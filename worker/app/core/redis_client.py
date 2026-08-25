"""
Async Redis client singleton.

Used for:
  - Chat history rolling window (per-user Redis list)
  - AI response caching (optional, keyed by request hash)

The same Redis instance can be shared with your backend service —
just point REDIS_URL at the same server and use distinct key prefixes.
"""

import redis.asyncio as aioredis
from urllib.parse import urlparse, urlunparse
from app.core.config import settings
from app.core.logger import logger

_redis: aioredis.Redis | None = None


def _safe_redis_url(url: str) -> str:
    """Returns the Redis URL with credentials masked for safe logging."""
    try:
        parsed = urlparse(url)
        if parsed.password or parsed.username:
            masked = parsed._replace(
                netloc="***@" + parsed.hostname + (f":{parsed.port}" if parsed.port else "")
            )
            return urlunparse(masked)
    except Exception:
        pass
    return url


async def get_redis() -> aioredis.Redis:
    """Returns the shared Redis client, creating it on first call."""
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
        )
        logger.info("Redis connected", url=_safe_redis_url(settings.redis_url))
    return _redis


async def close_redis() -> None:
    """Closes the Redis connection. Called on application shutdown."""
    global _redis
    if _redis:
        await _redis.aclose()
        _redis = None
        logger.info("Redis connection closed")
