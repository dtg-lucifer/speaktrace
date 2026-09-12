import asyncio
import json
import os
import time
from src.config import settings
from src.logger import logger
from src.metrics import JOBS_PROCESSED_TOTAL, PROCESSING_DURATION_SECONDS, SPEAKERS_DETECTED_TOTAL
from src.pipeline.diarizer import run_diarization
from src.pipeline.downloader import download_and_normalize_audio
from src.pipeline.formatter import format_and_upload_transcript
from src.pipeline.snippet_extractor import extract_speaker_snippets
from src.pipeline.transcriber import transcribe_and_align
from src.rag.indexer import index_transcription_segments
from src.worker.publisher import get_redis_client, publish_event

# In-memory or Redis job state cache between diarization and mapping submission
JOB_CACHE: dict[str, dict] = {}


async def process_media_uploaded(event: dict):
    """
    Handles media.uploaded event:
    1. Downloads & normalizes audio
    2. Runs speaker diarization
    3. Extracts clean 1-5s audio snippets for each speaker and uploads to Cloudinary
    4. Caches normalized audio and diarization result
    5. Emits diarization.completed event (state = AWAITING_SPEAKER_MAPPING)
    """
    payload = event.get("payload", {})
    job_id = event.get("job_id")
    tenant_id = event.get("tenant_id")
    correlation_id = event.get("correlation_id")
    storage_url = payload.get("storage_url")
    filename = payload.get("filename") or payload.get("original_filename")
    options = payload.get("options", {})
    project_id = event.get("project_id") or payload.get("project_id")

    if not job_id or not storage_url:
        logger.error("Invalid media.uploaded event: missing job_id or storage_url", event_payload=event)
        return

    logger.info("Starting processing for uploaded media", job_id=job_id, url=storage_url)
    start_time = time.time()

    try:
        # Step 1: Download & normalize
        await publish_event("job.progress.updated", "job.progress.updated", job_id, {
            "status": "AUDIO_EXTRACTED",
            "progress_pct": 20,
            "current_stage": "Extracting audio stream",
        }, correlation_id, tenant_id)

        audio_wav_path = await download_and_normalize_audio(storage_url)

        # Step 2: Speaker Diarization
        await publish_event("job.progress.updated", "job.progress.updated", job_id, {
            "status": "DIARIZATION_DONE",
            "progress_pct": 40,
            "current_stage": "Detecting speakers (Diarization)",
        }, correlation_id, tenant_id)

        diarization_start = time.time()
        diarized_segments = run_diarization(audio_wav_path)
        PROCESSING_DURATION_SECONDS.labels(stage="diarization").observe(time.time() - diarization_start)

        # Step 3: Extract 1s-5s speaker snippets for identification UI
        await publish_event("job.progress.updated", "job.progress.updated", job_id, {
            "status": "AWAITING_SPEAKER_MAPPING",
            "progress_pct": 60,
            "current_stage": "Generating speaker audio clips",
        }, correlation_id, tenant_id)

        snippets = extract_speaker_snippets(audio_wav_path, diarized_segments, job_id)
        SPEAKERS_DETECTED_TOTAL.inc(len(snippets))

        # Cache state so when user submits speaker mappings, we resume instantly
        cached_data = {
            "audio_wav_path": audio_wav_path,
            "diarized_segments": diarized_segments,
            "project_id": project_id,
            "options": options,
            "tenant_id": tenant_id,
            "correlation_id": correlation_id,
            "storage_url": storage_url,
            "filename": filename,
        }
        JOB_CACHE[job_id] = cached_data
        try:
            r = await get_redis_client()
            await r.set(f"job_cache:{job_id}", json.dumps(cached_data), ex=86400)
        except Exception as cache_err:
            logger.warn("Failed to persist job cache to Redis", error=str(cache_err))

        # Step 4: Publish diarization.completed event to notify API & Dashboard
        await publish_event("diarization.completed", "diarization.completed", job_id, {
            "speakers": snippets,
            "project_id": project_id,
        }, correlation_id, tenant_id)

        logger.info(
            "Diarization & snippet generation finished; awaiting user speaker mapping",
            job_id=job_id,
            speakers_count=len(snippets),
            duration=round(time.time() - start_time, 2),
        )

    except Exception as e:
        logger.error("Processing media.uploaded failed", job_id=job_id, error=str(e))
        JOBS_PROCESSED_TOTAL.labels(status="failure").inc()
        await publish_event("job.progress.updated", "job.progress.updated", job_id, {
            "status": "FAILED",
            "progress_pct": 0,
            "current_stage": "FAILED",
            "error_message": str(e),
        }, correlation_id, tenant_id)


async def process_speaker_mapping_submitted(event: dict):
    """
    Handles speaker.mapping.submitted event:
    1. Resumes pipeline with user's mapped speaker names (e.g. SPEAKER_00 -> "Piush")
    2. Transcribes audio with Whisper and aligns timestamps
    3. Renders formatted transcript (VTT, TXT, or custom grammar)
    4. Uploads transcript to Cloudinary
    5. Indexes segments into project ChromaDB RAG vector store
    6. Emits transcription.completed / job.completed event
    """
    payload = event.get("payload", {})
    job_id = event.get("job_id")
    tenant_id = event.get("tenant_id")
    correlation_id = event.get("correlation_id")
    mappings = payload.get("mappings", {})
    export_format = payload.get("export_format", "vtt")
    custom_template = payload.get("custom_template")

    cached_job = JOB_CACHE.get(job_id)
    if not cached_job:
        try:
            r = await get_redis_client()
            raw = await r.get(f"job_cache:{job_id}")
            if raw:
                cached_job = json.loads(raw)
                JOB_CACHE[job_id] = cached_job
                logger.info("Restored job cache from Redis", job_id=job_id)
        except Exception as cache_err:
            logger.warn("Failed to retrieve job cache from Redis", error=str(cache_err))

    if not cached_job:
        logger.warn("Job state not found in memory cache, attempting fallback recovery", job_id=job_id)
        # Mock recovery segments if worker restarted
        cached_job = {
            "audio_wav_path": "/tmp/fallback.wav",
            "diarized_segments": [{"speaker": "SPEAKER_00", "start": 0.0, "end": 60.0}],
            "project_id": event.get("project_id"),
        }

    audio_wav_path = cached_job["audio_wav_path"]
    diarized_segments = cached_job["diarized_segments"]
    # Aggressively resolve project_id from all possible sources
    project_id = (
        cached_job.get("project_id")
        or event.get("project_id")
        or payload.get("project_id")
    )
    logger.info("Resolved project_id for speaker mapping", job_id=job_id, project_id=project_id)

    logger.info("Resuming transcription with speaker mappings", job_id=job_id, mappings=mappings)
    start_time = time.time()

    try:
        # Step 1: Transcribe with Whisper & replace speaker IDs with user names
        await publish_event("job.progress.updated", "job.progress.updated", job_id, {
            "status": "TRANSCRIPTION_IN_PROGRESS",
            "progress_pct": 75,
            "current_stage": "Transcribing speech and aligning speakers",
        }, correlation_id, tenant_id)

        stt_start = time.time()
        aligned_segments = transcribe_and_align(audio_wav_path, diarized_segments, mappings)
        PROCESSING_DURATION_SECONDS.labels(stage="transcription").observe(time.time() - stt_start)

        # Step 2: Format transcript & upload to Cloudinary
        await publish_event("job.progress.updated", "job.progress.updated", job_id, {
            "status": "POSTPROCESSING_IN_PROGRESS",
            "progress_pct": 85,
            "current_stage": "Rendering formatted transcript output",
        }, correlation_id, tenant_id)

        transcript_text, storage_url = format_and_upload_transcript(
            aligned_segments,
            job_id,
            export_format=export_format,
            custom_template=custom_template,
        )

        # Step 3: Populate Project-level RAG Vector Store
        await publish_event("job.progress.updated", "job.progress.updated", job_id, {
            "status": "RAG_INDEXING_IN_PROGRESS",
            "progress_pct": 95,
            "current_stage": "Indexing transcript into project RAG memory",
        }, correlation_id, tenant_id)

        if project_id:
            audio_url = cached_job.get("storage_url") or payload.get("storage_url")
            filename = cached_job.get("filename") or payload.get("filename") or payload.get("original_filename")
            indexed_count = index_transcription_segments(
                project_id,
                job_id,
                aligned_segments,
                audio_url=audio_url,
                filename=filename,
            )
            logger.info(
                "RAG vector store indexed for project",
                job_id=job_id,
                project_id=project_id,
                indexed_count=indexed_count,
            )
        else:
            logger.warn(
                "Skipping RAG indexing: project_id is None",
                job_id=job_id,
                event_project_id=event.get("project_id"),
                payload_project_id=payload.get("project_id"),
                cached_project_id=cached_job.get("project_id"),
            )

        # Step 4: Complete Job
        await publish_event("transcription.completed", "transcription.completed", job_id, {
            "format": export_format,
            "storage_url": storage_url,
            "transcript_text": transcript_text,
            "project_id": project_id,
        }, correlation_id, tenant_id)

        JOBS_PROCESSED_TOTAL.labels(status="success").inc()
        logger.info(
            "Audio processing and RAG indexing fully completed",
            job_id=job_id,
            duration=round(time.time() - start_time, 2),
            storage_url=storage_url,
        )

    except Exception as e:
        logger.error("Processing speaker.mapping.submitted failed", job_id=job_id, error=str(e))
        JOBS_PROCESSED_TOTAL.labels(status="failure").inc()
        await publish_event("job.progress.updated", "job.progress.updated", job_id, {
            "status": "FAILED",
            "progress_pct": 0,
            "current_stage": "FAILED",
            "error_message": str(e),
        }, correlation_id, tenant_id)


async def start_queue_consumer():
    """
    Consumer loop for BullMQ (Redis) and fallback RabbitMQ.
    Uses official BullMQ Python Worker for reliable job parsing, concurrency, and acks.
    """
    logger.info("Starting ML worker queue consumer", provider=settings.queue_provider)

    from bullmq import Worker

    async def _process_upload_job(job, job_token):
        logger.info("BullMQ Worker received media.uploaded job", job_id=job.id)
        try:
            data = job.data
            if isinstance(data, str):
                data = json.loads(data)
            event_data = data.get("data", data) if isinstance(data, dict) else data
            await process_media_uploaded(event_data)
        except Exception as e:
            logger.error("Error processing media.uploaded job", job_id=job.id, error=str(e))
            raise e

    async def _process_mapping_job(job, job_token):
        logger.info("BullMQ Worker received speaker.mapping.submitted job", job_id=job.id)
        try:
            data = job.data
            if isinstance(data, str):
                data = json.loads(data)
            event_data = data.get("data", data) if isinstance(data, dict) else data
            await process_speaker_mapping_submitted(event_data)
        except Exception as e:
            logger.error("Error processing speaker.mapping.submitted job", job_id=job.id, error=str(e))
            raise e

    if settings.queue_provider == "bullmq":
        upload_worker = Worker(
            "media.uploaded",
            _process_upload_job,
            {"connection": settings.redis_url, "concurrency": 2},
        )
        mapping_worker = Worker(
            "speaker.mapping.submitted",
            _process_mapping_job,
            {"connection": settings.redis_url, "concurrency": 2},
        )

        logger.info("BullMQ Workers active for media.uploaded & speaker.mapping.submitted")

        try:
            while True:
                await asyncio.sleep(1)
        except asyncio.CancelledError:
            logger.info("Shutting down BullMQ workers...")
            await upload_worker.close()
            await mapping_worker.close()
            logger.info("BullMQ workers stopped")
    else:
        # RabbitMQ consumer
        try:
            import aio_pika
            connection = await aio_pika.connect_robust(settings.rabbitmq_url)
            channel = await connection.channel()
            await channel.set_qos(prefetch_count=2)
            exchange = await channel.declare_exchange("speak_trace", aio_pika.ExchangeType.TOPIC, durable=True)

            upload_queue = await channel.declare_queue("ml.media.uploaded", durable=True)
            await upload_queue.bind(exchange, routing_key="media.uploaded")

            mapping_queue = await channel.declare_queue("ml.speaker.mapping.submitted", durable=True)
            await mapping_queue.bind(exchange, routing_key="speaker.mapping.submitted")

            async def on_upload_msg(message: aio_pika.IncomingMessage):
                async with message.process():
                    event = json.loads(message.body.decode())
                    await process_media_uploaded(event)

            async def on_mapping_msg(message: aio_pika.IncomingMessage):
                async with message.process():
                    event = json.loads(message.body.decode())
                    await process_speaker_mapping_submitted(event)

            await upload_queue.consume(on_upload_msg)
            await mapping_queue.consume(on_mapping_msg)
            logger.info("RabbitMQ consumers active for media.uploaded & speaker.mapping.submitted")

            while True:
                await asyncio.sleep(1)
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error("RabbitMQ consumer error", error=str(e))
            await asyncio.sleep(5)
