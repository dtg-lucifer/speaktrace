import { env } from "~/config/env";
import { rabbitMQ, type SpeakTraceEvent } from "~/lib/rabbitmq";
import { UploadsRepository } from "~/modules/uploads/uploads.repository";
import { eventBus } from "~/shared/events";
import { logger } from "~/shared/logging";
import type { AppDependencies } from "~/shared/middlewares";
import { getQueueProvider } from "~/shared/queue";

interface MediaValidatedPayload {
	media_asset_id: string;
	storage_url: string;
	mime_type: string;
	options: Record<string, unknown>;
}

async function handleMediaValidated(event: SpeakTraceEvent<MediaValidatedPayload>, uploadsRepo: UploadsRepository) {
	logger.info("[EVENT-CONSUMERS] Received media.validated event", {
		jobId: event.job_id,
		mediaAssetId: event.payload.media_asset_id,
	});

	try {
		const job = await uploadsRepo.findJobByMediaAssetId(event.payload.media_asset_id, event.tenant_id ?? "");

		if (!job) {
			logger.warn("[EVENT-CONSUMERS] No job found for media asset", {
				mediaAssetId: event.payload.media_asset_id,
			});
			return;
		}

		await uploadsRepo.updateJobStatus(job.id, "MEDIA_VALIDATED", {
			currentStage: "MEDIA_VALIDATED",
			progressPct: 20,
		});

		eventBus.emit("job.progress.updated", {
			jobId: job.id,
			correlationId: job.correlation_id,
			tenantId: job.tenant_id,
			status: "MEDIA_VALIDATED",
			progressPct: 20,
			currentStage: "MEDIA_VALIDATED",
		});

		logger.info("[EVENT-CONSUMERS] Updated job status to MEDIA_VALIDATED", {
			jobId: job.id,
		});
	} catch (error) {
		logger.error("[EVENT-CONSUMERS] Failed to process media.validated event", {
			jobId: event.job_id,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

async function handleAudioExtracted(event: SpeakTraceEvent<MediaValidatedPayload>, uploadsRepo: UploadsRepository) {
	logger.info("[EVENT-CONSUMERS] Received audio.extracted event", {
		jobId: event.job_id,
		mediaAssetId: event.payload.media_asset_id,
	});

	try {
		const job = await uploadsRepo.findJobByMediaAssetId(event.payload.media_asset_id, event.tenant_id ?? "");

		if (!job) {
			logger.warn("[EVENT-CONSUMERS] No job found for media asset", {
				mediaAssetId: event.payload.media_asset_id,
			});
			return;
		}

		await uploadsRepo.updateJobStatus(job.id, "AUDIO_EXTRACTED", {
			currentStage: "AUDIO_EXTRACTED",
			progressPct: 40,
		});

		eventBus.emit("job.progress.updated", {
			jobId: job.id,
			correlationId: job.correlation_id,
			tenantId: job.tenant_id,
			status: "AUDIO_EXTRACTED",
			progressPct: 40,
			currentStage: "AUDIO_EXTRACTED",
		});

		logger.info("[EVENT-CONSUMERS] Updated job status to AUDIO_EXTRACTED", {
			jobId: job.id,
		});
	} catch (error) {
		logger.error("[EVENT-CONSUMERS] Failed to process audio.extracted event", {
			jobId: event.job_id,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

interface DiarizationCompletedPayload {
	project_id?: string;
	speakers: Array<{
		speaker_tag: string;
		snippet_url: string;
		duration_seconds?: number;
	}>;
}

async function handleDiarizationCompleted(event: SpeakTraceEvent<DiarizationCompletedPayload>, uploadsRepo: UploadsRepository) {
	logger.info("[EVENT-CONSUMERS] Received diarization.completed event", {
		jobId: event.job_id,
		speakerCount: event.payload.speakers?.length,
	});

	try {
		const job = await uploadsRepo.findJobById(event.job_id);
		const projectId = event.payload.project_id || event.project_id || job?.project_id || null;

		await uploadsRepo.updateJobStatus(event.job_id, "AWAITING_SPEAKER_MAPPING", {
			currentStage: "AWAITING_SPEAKER_MAPPING",
			progressPct: 60,
		});

		if (event.payload.speakers && event.payload.speakers.length > 0) {
			await uploadsRepo.saveSpeakerSnippets(
				event.job_id,
				event.payload.speakers.map((s) => ({
					speakerTag: s.speaker_tag,
					snippetUrl: s.snippet_url,
					durationSeconds: s.duration_seconds,
				})),
			);
		}

		eventBus.emit("job.progress.updated", {
			jobId: event.job_id,
			correlationId: event.correlation_id,
			tenantId: event.tenant_id,
			projectId,
			status: "AWAITING_SPEAKER_MAPPING",
			progressPct: 60,
			currentStage: "AWAITING_SPEAKER_MAPPING",
			speakers: event.payload.speakers,
		});

		logger.info("[EVENT-CONSUMERS] Updated job to AWAITING_SPEAKER_MAPPING", { jobId: event.job_id });
	} catch (error) {
		logger.error("[EVENT-CONSUMERS] Failed to process diarization.completed event", {
			jobId: event.job_id,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

interface TranscriptionCompletedPayload {
	format: string;
	storage_url?: string;
	transcript_text: string;
	project_id?: string;
}

async function handleTranscriptionCompleted(event: SpeakTraceEvent<TranscriptionCompletedPayload>, uploadsRepo: UploadsRepository) {
	logger.info("[EVENT-CONSUMERS] Received transcription.completed event", { jobId: event.job_id });

	try {
		const job = await uploadsRepo.findJobById(event.job_id);
		const projectId = event.payload.project_id || event.project_id || job?.project_id || null;

		await uploadsRepo.saveTranscript({
			jobId: event.job_id,
			projectId,
			format: event.payload.format || "vtt",
			contentText: event.payload.transcript_text,
			storageUrl: event.payload.storage_url,
		});

		await uploadsRepo.updateJobStatus(event.job_id, "COMPLETED", {
			currentStage: "COMPLETED",
			progressPct: 100,
		});

		eventBus.emit("job.progress.updated", {
			jobId: event.job_id,
			correlationId: event.correlation_id,
			tenantId: event.tenant_id,
			projectId,
			status: "COMPLETED",
			progressPct: 100,
			currentStage: "COMPLETED",
		});

		logger.info("[EVENT-CONSUMERS] Updated job to COMPLETED", { jobId: event.job_id });
	} catch (error) {
		logger.error("[EVENT-CONSUMERS] Failed to process transcription.completed event", {
			jobId: event.job_id,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

interface JobProgressUpdatedPayload {
	status: string;
	progress_pct: number;
	current_stage: string | null;
	error_message?: string;
	project_id?: string;
}

async function handleJobProgressUpdated(event: SpeakTraceEvent<JobProgressUpdatedPayload>, uploadsRepo: UploadsRepository) {
	logger.info("[EVENT-CONSUMERS] Received job.progress.updated event", {
		jobId: event.job_id,
		status: event.payload.status,
		progressPct: event.payload.progress_pct,
	});

	try {
		const job = await uploadsRepo.findJobById(event.job_id);
		const projectId = event.payload.project_id || event.project_id || job?.project_id || null;

		await uploadsRepo.updateJobStatus(event.job_id, event.payload.status as any, {
			currentStage: event.payload.current_stage ?? undefined,
			progressPct: event.payload.progress_pct,
			errorMessage: event.payload.error_message,
		});

		eventBus.emit("job.progress.updated", {
			jobId: event.job_id,
			correlationId: event.correlation_id,
			tenantId: event.tenant_id,
			projectId,
			status: event.payload.status,
			progressPct: event.payload.progress_pct,
			currentStage: event.payload.current_stage,
			errorMessage: event.payload.error_message,
		});
	} catch (error) {
		logger.error("[EVENT-CONSUMERS] Failed to process job.progress.updated event", {
			jobId: event.job_id,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

/**
 * Sets up consumers for events published by workers.
 * Dynamically uses BullMQ (Redis) or RabbitMQ (AMQP) depending on env.QUEUE_PROVIDER.
 */
export function setupWorkerEventConsumers(deps: AppDependencies): void {
	const { db } = deps;
	if (!db) {
		logger.error("[EVENT-CONSUMERS] Database not available");
		return;
	}

	const uploadsRepo = new UploadsRepository();

	if (env.QUEUE_PROVIDER === "bullmq") {
		const queueProvider = getQueueProvider();

		queueProvider
			.startWorker<SpeakTraceEvent<MediaValidatedPayload>>("media.validated", async (job) =>
				handleMediaValidated(job.data, uploadsRepo),
			)
			.catch((err) => logger.error("[EVENT-CONSUMERS] Failed to start BullMQ media.validated worker", { err }));

		queueProvider
			.startWorker<SpeakTraceEvent<MediaValidatedPayload>>("audio.extracted", async (job) =>
				handleAudioExtracted(job.data, uploadsRepo),
			)
			.catch((err) => logger.error("[EVENT-CONSUMERS] Failed to start BullMQ audio.extracted worker", { err }));

		queueProvider
			.startWorker<SpeakTraceEvent<DiarizationCompletedPayload>>("diarization.completed", async (job) =>
				handleDiarizationCompleted(job.data, uploadsRepo),
			)
			.catch((err) => logger.error("[EVENT-CONSUMERS] Failed to start BullMQ diarization.completed worker", { err }));

		queueProvider
			.startWorker<SpeakTraceEvent<TranscriptionCompletedPayload>>("transcription.completed", async (job) =>
				handleTranscriptionCompleted(job.data, uploadsRepo),
			)
			.catch((err) => logger.error("[EVENT-CONSUMERS] Failed to start BullMQ transcription.completed worker", { err }));

		queueProvider
			.startWorker<SpeakTraceEvent<JobProgressUpdatedPayload>>("job.progress.updated", async (job) =>
				handleJobProgressUpdated(job.data, uploadsRepo),
			)
			.catch((err) => logger.error("[EVENT-CONSUMERS] Failed to start BullMQ job.progress.updated worker", { err }));

		logger.info("[EVENT-CONSUMERS] BullMQ (Redis) worker event consumers initialized");
	} else {
		rabbitMQ
			.subscribe<MediaValidatedPayload>("media.validated", (event) => handleMediaValidated(event, uploadsRepo))
			.catch((error) => logger.error("[EVENT-CONSUMERS] Failed to set up media.validated consumer", error));

		rabbitMQ
			.subscribe<MediaValidatedPayload>("audio.extracted", (event) => handleAudioExtracted(event, uploadsRepo))
			.catch((error) => logger.error("[EVENT-CONSUMERS] Failed to set up audio.extracted consumer", error));

		rabbitMQ
			.subscribe<DiarizationCompletedPayload>("diarization.completed", (event) => handleDiarizationCompleted(event, uploadsRepo))
			.catch((error) => logger.error("[EVENT-CONSUMERS] Failed to set up diarization.completed consumer", error));

		rabbitMQ
			.subscribe<TranscriptionCompletedPayload>("transcription.completed", (event) => handleTranscriptionCompleted(event, uploadsRepo))
			.catch((error) => logger.error("[EVENT-CONSUMERS] Failed to set up transcription.completed consumer", error));

		rabbitMQ
			.subscribe<JobProgressUpdatedPayload>("job.progress.updated", (event) => handleJobProgressUpdated(event, uploadsRepo))
			.catch((error) => logger.error("[EVENT-CONSUMERS] Failed to set up job.progress.updated consumer", error));

		logger.info("[EVENT-CONSUMERS] RabbitMQ (AMQP) worker event consumers initialized");
	}
}
