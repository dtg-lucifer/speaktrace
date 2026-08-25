"""
Chat endpoints.

POST   /api/v1/chat          — Send message to agent, get full response
GET    /api/v1/chat/history  — Get rolling chat history from Redis
DELETE /api/v1/chat/history  — Clear chat history + long-term memory
POST   /api/v1/chat/stream   — SSE streaming — token-by-token response
"""

import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.agent.executor import build_agent_executor, run_agent
from app.core.auth import get_backend_client, get_current_user_id
from app.core.logger import logger
from app.prompts.system_prompt import build_system_prompt
from app.schemas.requests import SendMessageRequest, SendMessageResponse
from app.services.backend_client import BackendClient
from app.services.chat_history import clear_history, load_history, save_message
from app.services.context_builder import build_user_context
from app.services.memory_service import clear_memory, get_memory, maybe_summarize

router = APIRouter(prefix="/chat", tags=["Chat"])


@router.post("", response_model=SendMessageResponse)
async def chat(
    body: SendMessageRequest,
    client: BackendClient = Depends(get_backend_client),
):
    """
    Send a message to the AI agent and get a full response.

    Flow:
      1. Resolve user ID
      2. Build live context (parallel backend fetches)
      3. Load rolling chat history from Redis
      4. Auto-summarize memory if history is getting long
      5. Load long-term memory summary
      6. Build system prompt with context + memory
      7. Run LangChain agent (may call tools)
      8. Save both messages to Redis history
      9. Return AI response
    """
    user_id = await get_current_user_id(client)
    logger.info("Chat request", user_id=user_id, message_preview=body.message[:80])

    # Build context + load history in parallel
    ctx, history = await asyncio.gather(
        build_user_context(client),
        load_history(user_id),
    )

    # Auto-summarize if history is getting long
    await maybe_summarize(user_id, history)

    # Load long-term memory
    memory = await get_memory(user_id)

    # Build system prompt with context + memory
    system_prompt = build_system_prompt(ctx, memory=memory)

    # Run agent
    try:
        response = await run_agent(
            client=client,
            system_prompt=system_prompt,
            user_message=body.message,
            chat_history=history,
        )
    except Exception as e:
        logger.error("Agent failed", user_id=user_id, error=str(e))
        raise HTTPException(status_code=500, detail="AI agent encountered an error")

    # Persist to Redis
    await save_message(user_id, "human", body.message)
    await save_message(user_id, "ai", response)

    logger.info("Chat response sent", user_id=user_id, response_preview=response[:80])

    return SendMessageResponse(data={"message": response, "userId": user_id})


@router.get("/history")
async def get_chat_history(
    client: BackendClient = Depends(get_backend_client),
):
    """Returns the user's recent chat history from Redis."""
    user_id = await get_current_user_id(client)
    history = await load_history(user_id)

    messages = [
        {
            "role": "user" if msg.__class__.__name__ == "HumanMessage" else "assistant",
            "content": msg.content,
        }
        for msg in history
    ]

    return {"success": True, "data": {"messages": messages}}


@router.delete("/history")
async def delete_chat_history(
    client: BackendClient = Depends(get_backend_client),
):
    """Clears the user's chat history and long-term memory from Redis."""
    user_id = await get_current_user_id(client)
    await clear_history(user_id)
    await clear_memory(user_id)
    return {"success": True, "message": "Chat history cleared."}


@router.post("/stream")
async def stream_chat(
    body: SendMessageRequest,
    request: Request,
    client: BackendClient = Depends(get_backend_client),
):
    """
    Streaming chat endpoint using Server-Sent Events (SSE).

    Streams the AI response token-by-token. The full assembled response
    is saved to Redis history after streaming completes.

    SSE format:
      data: {"token": "Hello"}\n\n
      data: {"token": " there"}\n\n
      data: [DONE]\n\n

    Client usage (JavaScript):
      const response = await fetch('/api/v1/chat/stream', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Hello' }),
      });
      const reader = response.body.getReader();
      // read SSE tokens...
    """
    user_id = await get_current_user_id(client)
    logger.info("Streaming chat request", user_id=user_id, message_preview=body.message[:80])

    ctx, history = await asyncio.gather(
        build_user_context(client),
        load_history(user_id),
    )

    await maybe_summarize(user_id, history)
    memory = await get_memory(user_id)
    system_prompt = build_system_prompt(ctx, memory=memory)

    # Build streaming executor
    executor = build_agent_executor(client, system_prompt, streaming=True)
    queue: asyncio.Queue[str | None] = asyncio.Queue()

    async def run_streaming():
        full_response = ""
        try:
            async for event in executor.astream_events(
                {"input": body.message, "chat_history": history},
                version="v1",
            ):
                if event.get("event") == "on_chat_model_stream":
                    chunk = event.get("data", {}).get("chunk")
                    if chunk and hasattr(chunk, "content") and chunk.content:
                        full_response += chunk.content
                        await queue.put(chunk.content)
        except Exception as e:
            logger.error("Streaming agent error", error=str(e))
            if not full_response:
                await queue.put(f"Error: {e}")
        finally:
            await queue.put(None)  # sentinel

        # Save to Redis after streaming completes
        if full_response:
            await save_message(user_id, "human", body.message)
            await save_message(user_id, "ai", full_response)

    asyncio.create_task(run_streaming())

    async def event_generator():
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    token = await asyncio.wait_for(queue.get(), timeout=30.0)
                except asyncio.TimeoutError:
                    yield "data: [DONE]\n\n"
                    break

                if token is None:
                    yield "data: [DONE]\n\n"
                    break

                payload = json.dumps({"token": token})
                yield f"data: {payload}\n\n"
        except Exception as e:
            logger.error("SSE generator error", error=str(e))

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
