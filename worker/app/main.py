"""
FastAPI application factory.

Registers:
  - CORS middleware
  - Exception handlers
  - API router (all versioned routes)
  - Health check endpoint
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings
from app.core.exceptions import (
    AgentAPIError,
    agent_api_exception_handler,
    generic_exception_handler,
)
from app.core.logger import logger, setup_logging
from app.core.redis_client import close_redis, get_redis


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle hooks."""
    setup_logging()
    logger.info(
        "Agent API starting",
        env=settings.app_env,
        port=settings.app_port,
        backend=settings.backend_base_url,
        llm=settings.primary_llm_provider,
        reasoning_model=(
            settings.openrouter_reasoning_model
            if settings.primary_llm_provider == "openrouter"
            else (
                settings.gemini_model
                if settings.primary_llm_provider == "gemini"
                else settings.openai_model
            )
        ),
        general_model=(
            settings.openrouter_general_model
            if settings.primary_llm_provider == "openrouter"
            else (
                settings.gemini_model
                if settings.primary_llm_provider == "gemini"
                else settings.openai_model
            )
        ),
    )

    # Warm up Redis connection on startup
    await get_redis()

    yield

    # Graceful shutdown
    await close_redis()
    logger.info("Agent API stopped")


app = FastAPI(
    title="Agent API",
    description="Production-grade LangChain agentic API — FastAPI + LangChain + Gemini + Redis",
    version="1.0.0",
    lifespan=lifespan,
    # Disable docs in production — enable only in development
    docs_url="/docs" if settings.is_development else None,
    redoc_url="/redoc" if settings.is_development else None,
)

# ─── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.is_development else [settings.backend_base_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Exception handlers ───────────────────────────────────────────────────────
app.add_exception_handler(AgentAPIError, agent_api_exception_handler)
app.add_exception_handler(Exception, generic_exception_handler)

# ─── Routes ───────────────────────────────────────────────────────────────────
app.include_router(api_router)


@app.get("/health", tags=["Health"])
async def health():
    """Health check — used by load balancers and deployment pipelines."""
    return {
        "status": "ok",
        "service": "agent-api",
        "env": settings.app_env,
        "llm": settings.primary_llm_provider,
    }
