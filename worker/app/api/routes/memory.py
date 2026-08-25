"""
Memory management endpoints.

POST   /api/v1/memory/summarize — Manually trigger memory summarization
GET    /api/v1/memory           — Get current long-term memory summary
DELETE /api/v1/memory           — Clear memory
"""

from fastapi import APIRouter, Depends
from app.core.auth import get_backend_client, get_current_user_id
from app.services.backend_client import BackendClient
from app.services.chat_history import load_history
from app.services.memory_service import get_memory, clear_memory, maybe_summarize

router = APIRouter(prefix="/memory", tags=["Memory"])


@router.post("/summarize")
async def summarize_memory(
    client: BackendClient = Depends(get_backend_client),
):
    """
    Manually triggers memory summarization of the user's chat history.
    Useful for testing or when the user wants to explicitly save context.
    Auto-summarization also happens during each chat request.
    """
    user_id = await get_current_user_id(client)
    history = await load_history(user_id)

    if not history:
        return {"success": True, "data": {"message": "No chat history to summarize.", "summary": None}}

    summary = await maybe_summarize(user_id, history)

    if summary:
        return {"success": True, "data": {"message": "Memory updated.", "summary": summary}}

    existing = await get_memory(user_id)
    return {
        "success": True,
        "data": {
            "message": "History too short for summarization. Existing memory returned.",
            "summary": existing,
        },
    }


@router.get("")
async def get_user_memory(
    client: BackendClient = Depends(get_backend_client),
):
    """Returns the user's current long-term memory summary."""
    user_id = await get_current_user_id(client)
    memory = await get_memory(user_id)
    return {"success": True, "data": {"memory": memory}}


@router.delete("")
async def delete_user_memory(
    client: BackendClient = Depends(get_backend_client),
):
    """Clears the user's long-term memory summary."""
    user_id = await get_current_user_id(client)
    await clear_memory(user_id)
    return {"success": True, "message": "Memory cleared."}
