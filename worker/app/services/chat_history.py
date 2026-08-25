"""
Per-user chat history stored in Redis.

Storage strategy
----------------
Messages are stored as a Redis list using LPUSH + LTRIM.
The most recent N messages are always available without a DB query.
This is the fast rolling window for the agent's context.

If you need permanent history, persist messages to your database
from the route handler after each successful agent run.

Redis key format: chat_history:{user_id}
"""

import json
from langchain_core.messages import HumanMessage, AIMessage, BaseMessage
from app.core.redis_client import get_redis
from app.core.config import settings
from app.core.logger import logger

_HISTORY_KEY = "chat_history:{user_id}"


async def load_history(user_id: str) -> list[BaseMessage]:
    """
    Load the last N messages for a user from Redis.
    Returns a list of LangChain BaseMessage objects ready to pass to the agent.
    """
    redis = await get_redis()
    key = _HISTORY_KEY.format(user_id=user_id)

    # LPUSH stores newest first, so we reverse to get chronological order
    raw_messages = await redis.lrange(key, 0, settings.chat_history_limit - 1)

    messages: list[BaseMessage] = []
    for raw in reversed(raw_messages):
        try:
            msg = json.loads(raw)
            if msg["role"] == "human":
                messages.append(HumanMessage(content=msg["content"]))
            elif msg["role"] == "ai":
                messages.append(AIMessage(content=msg["content"]))
        except (json.JSONDecodeError, KeyError) as e:
            logger.warning("Failed to parse chat history entry", error=str(e))

    return messages


async def save_message(user_id: str, role: str, content: str) -> None:
    """
    Prepend a message to the user's Redis history list.
    Automatically trims to CHAT_HISTORY_LIMIT to prevent unbounded growth.

    Args:
        user_id: The user's unique identifier (used as part of the Redis key)
        role:    "human" for user messages, "ai" for assistant messages
        content: The message text
    """
    redis = await get_redis()
    key = _HISTORY_KEY.format(user_id=user_id)

    payload = json.dumps({"role": role, "content": content})
    await redis.lpush(key, payload)
    await redis.ltrim(key, 0, settings.chat_history_limit - 1)


async def clear_history(user_id: str) -> None:
    """Delete all chat history for a user from Redis."""
    redis = await get_redis()
    key = _HISTORY_KEY.format(user_id=user_id)
    await redis.delete(key)
    logger.info("Chat history cleared", user_id=user_id)
