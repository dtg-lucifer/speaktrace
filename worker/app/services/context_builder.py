"""
Context builder — fetches user data in parallel before each agent run.

Why parallel?
-------------
The agent needs multiple data points to build a useful system prompt
(user profile, current state, recent activity, etc.).
Fetching them sequentially would add ~1s of latency per request.
asyncio.gather fires all requests concurrently, reducing this to ~100ms.

How to extend
-------------
1. Add a new method to BackendClient for the data you need.
2. Add a safe() call to the asyncio.gather block below.
3. Add the result to the returned dict.
4. Reference it in build_system_prompt() in app/prompts/system_prompt.py.

Partial failure handling
------------------------
Each fetch is wrapped in safe() which catches exceptions and returns
an empty default. This means the agent can still run even if some
backend endpoints are temporarily unavailable.
"""

import asyncio
from typing import Any
from app.services.backend_client import BackendClient
from app.core.logger import logger


async def build_user_context(client: BackendClient) -> dict[str, Any]:
    """
    Fetches all data needed to build the agent's system prompt.
    Returns a dict that is passed directly to build_system_prompt().

    Extend this function as your application grows — add more parallel
    fetches and include the results in the returned dict.
    """

    async def safe(coro, default=None):
        """Wraps a coroutine so a failure returns a default instead of raising."""
        try:
            result = await coro
            # Unwrap { "data": ... } envelope if present
            return result.get("data", result)
        except Exception as e:
            logger.warning("Context fetch failed", error=str(e))
            return default if default is not None else {}

    # ─── Parallel fetches ─────────────────────────────────────────────────────
    # Add more entries here as your application grows.
    # Each entry is a safe(client.some_method()) call.
    (
        me,
        # TODO: add your domain-specific fetches here, e.g.:
        # user_profile,
        # recent_orders,
        # account_balance,
    ) = await asyncio.gather(
        safe(client.get_me()),
        # safe(client.get_user_profile()),
        # safe(client.get_recent_orders()),
    )

    return {
        "user": me,
        # TODO: add your domain-specific context keys here, e.g.:
        # "profile": user_profile,
        # "recent_orders": recent_orders,
    }
