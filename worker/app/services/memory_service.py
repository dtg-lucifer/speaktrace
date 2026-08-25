"""
Long-term user memory service.

Solves the rolling window problem: the chat history is capped at N messages,
so older context is lost. This service periodically summarizes old messages
into a compact "memory" string that gets injected into every chat prompt.

Storage:
  Redis key: memory:{user_id}
  TTL: 30 days (refreshed on every summarization)

Flow:
  1. When history exceeds SUMMARIZE_THRESHOLD messages, the oldest
     (history_limit - KEEP_RECENT) messages are summarized.
  2. The summary is stored in Redis with a 30-day TTL.
  3. The recent messages are kept as-is in the rolling window.
  4. The summary is injected into the chat system prompt.

This gives the AI "long-term memory" without blowing up the context window.
"""

import json
from typing import Any
from langchain_core.messages import SystemMessage, HumanMessage

from app.core.config import settings
from app.core.redis_client import get_redis
from app.core.llm_factory import get_plan_llm
from app.core.logger import logger

# Summarize when history reaches this many messages
SUMMARIZE_THRESHOLD = 16
# Keep this many recent messages after summarization
KEEP_RECENT = 8
# Redis TTL for memory summaries (30 days)
MEMORY_TTL = 30 * 24 * 60 * 60

_SUMMARY_SYSTEM_PROMPT = """You are a memory assistant for an AI agent.

Summarize the conversation history into a compact memory string that captures
the most important facts, preferences, and context about the user. Focus on:
- Goals and progress mentioned
- Preferences and dislikes
- Any commitments or plans made
- Significant achievements or struggles
- Domain-specific context relevant to your application

Return ONLY a concise paragraph (3-5 sentences) — no bullet points, no headers.
Write in third person: "The user has been..."
"""


async def get_memory(user_id: str) -> str | None:
    """Returns the stored memory summary for a user, or None if not set."""
    redis = await get_redis()
    key = f"memory:{user_id}"
    value = await redis.get(key)
    if value:
        return value.decode("utf-8") if isinstance(value, bytes) else value
    return None


async def save_memory(user_id: str, summary: str) -> None:
    """Saves a memory summary to Redis with a 30-day TTL."""
    redis = await get_redis()
    await redis.setex(f"memory:{user_id}", MEMORY_TTL, summary)
    logger.info("Memory saved", user_id=user_id, summary_length=len(summary))


async def clear_memory(user_id: str) -> None:
    """Clears the memory summary for a user. Called when chat history is cleared."""
    redis = await get_redis()
    await redis.delete(f"memory:{user_id}")
    logger.info("Memory cleared", user_id=user_id)


async def maybe_summarize(user_id: str, messages: list[Any]) -> str | None:
    """
    Checks if the message history is long enough to warrant summarization.
    If so, summarizes the oldest messages and stores the result.

    Returns the new summary if one was created, None otherwise.
    Auto-triggered during each chat request — no manual intervention needed.
    """
    if len(messages) < SUMMARIZE_THRESHOLD:
        return None

    # Messages to summarize (oldest ones, excluding the most recent KEEP_RECENT)
    to_summarize = messages[:-KEEP_RECENT]
    if not to_summarize:
        return None

    # Format messages for the summarization prompt
    conversation_text = "\n".join(
        f"{'User' if msg.__class__.__name__ == 'HumanMessage' else 'AI'}: {msg.content}"
        for msg in to_summarize
    )

    # Incorporate existing memory if present
    existing_memory = await get_memory(user_id)
    context = f"\nExisting memory to update:\n{existing_memory}\n" if existing_memory else ""

    llm = get_plan_llm(temperature=0.1)

    try:
        response = await llm.ainvoke([
            SystemMessage(content=_SUMMARY_SYSTEM_PROMPT),
            HumanMessage(content=f"{context}\nConversation to summarize:\n{conversation_text}"),
        ])

        summary = response.content.strip()
        await save_memory(user_id, summary)
        logger.info("Memory summarized", user_id=user_id, messages_summarized=len(to_summarize))
        return summary

    except Exception as e:
        logger.error("Memory summarization failed", user_id=user_id, error=str(e))
        return None
