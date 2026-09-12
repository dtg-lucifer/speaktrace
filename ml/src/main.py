import asyncio
import json
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel
import prometheus_client
from src.config import settings
from src.logger import logger, setup_logging
from src.rag.agent import query_project_rag, stream_project_rag
from src.worker.queue_consumer import start_queue_consumer


class RagChatRequest(BaseModel):
    project_id: str
    query: str
    job_id: str | None = None
    history: list[dict] | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    logger.info("Starting SpeakTrace ML & RAG Engine", env=settings.app_env, port=settings.app_port)

    # Launch background consumer task
    consumer_task = asyncio.create_task(start_queue_consumer())

    yield

    # Clean shutdown
    consumer_task.cancel()
    try:
        await consumer_task
    except asyncio.CancelledError:
        pass
    logger.info("SpeakTrace ML & RAG Engine stopped")


app = FastAPI(
    title="SpeakTrace ML & RAG Engine",
    description="Speech Diarization, Whisper Transcription, and Conversational RAG Engine",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "speaktrace-ml",
        "env": settings.app_env,
        "ollama_model": settings.ollama_model,
        "queue_provider": settings.queue_provider,
    }


@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint."""
    return Response(
        content=prometheus_client.generate_latest(),
        media_type=prometheus_client.CONTENT_TYPE_LATEST,
    )


@app.post("/api/rag/chat")
async def rag_chat(req: RagChatRequest):
    """
    Query the project-level RAG conversational agent with timestamp citations.
    """
    if not req.project_id or not req.query:
        raise HTTPException(status_code=400, detail="project_id and query are required")

    result = await query_project_rag(req.project_id, req.query, req.job_id, req.history)
    return result


@app.post("/api/rag/chat/stream")
async def rag_chat_stream(req: RagChatRequest):
    """
    Stream token-by-token LLM conversational agent response via Server-Sent Events (SSE).
    """
    if not req.project_id or not req.query:
        raise HTTPException(status_code=400, detail="project_id and query are required")

    async def event_generator():
        try:
            async for chunk in stream_project_rag(req.project_id, req.query, req.job_id, req.history):
                yield f"data: {json.dumps(chunk)}\n\n"
        except Exception as e:
            logger.error("Error in streaming RAG chat", error=str(e))
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

