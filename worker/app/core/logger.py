"""
Structured logging via structlog.

  Development  →  pretty-printed, coloured console output
  Production   →  JSON lines (one JSON object per log entry)

Usage
-----
    from app.core.logger import logger

    logger.info("Something happened", key="value", count=42)
    logger.error("Something failed", error=str(e))
    logger.debug("Verbose detail", payload=data)
"""

import logging
import structlog
from app.core.config import settings


def setup_logging() -> None:
    """Call once at application startup (in the lifespan handler)."""
    log_level = getattr(logging, settings.log_level.upper(), logging.DEBUG)

    shared_processors = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
    ]

    if settings.is_development:
        processors = shared_processors + [
            structlog.dev.ConsoleRenderer(colors=True),
        ]
    else:
        processors = shared_processors + [
            structlog.processors.dict_tracebacks,
            structlog.processors.JSONRenderer(),
        ]

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(log_level),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )

    logging.basicConfig(format="%(message)s", level=log_level)


# Module-level logger — import this in every file that needs logging
logger = structlog.get_logger("agent-api")
