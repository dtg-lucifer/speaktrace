"""
Auth dependency — Bearer token extraction and forwarding.

Design decision
---------------
This service does NOT verify JWTs. It extracts the Bearer token from
the incoming request and forwards it to every backend API call.
The backend service is the single source of truth for authentication.

This keeps the security boundary in one place and means this service
never needs to know about JWT secrets, expiry, or user roles.

Usage
-----
    from app.core.auth import get_backend_client, get_current_user_id

    @router.post("/my-route")
    async def my_route(
        body: MyRequest,
        client: BackendClient = Depends(get_backend_client),
    ):
        user_id = await get_current_user_id(client)
        ...
"""

from fastapi import Request, HTTPException, Depends
from app.services.backend_client import BackendClient
from app.core.logger import logger


async def get_backend_client(request: Request) -> BackendClient:
    """
    FastAPI dependency.
    Extracts the Bearer token and returns a BackendClient bound to it.
    Raises 401 if no token is present.
    """
    auth_header = request.headers.get("Authorization", "")

    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authorization header missing or malformed")

    token = auth_header.removeprefix("Bearer ").strip()

    if not token:
        raise HTTPException(status_code=401, detail="Bearer token is empty")

    return BackendClient(access_token=token)


async def get_current_user_id(
    client: BackendClient = Depends(get_backend_client),
) -> str:
    """
    FastAPI dependency.
    Resolves the current user's ID by calling GET /auth/me on the backend.
    Use this in routes that need the user_id (e.g. for Redis keys).

    Raises 401 if the token is invalid or the backend call fails.
    """
    try:
        me = await client.get_me()
        user_id = me.get("data", me).get("id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Could not resolve user ID from token")
        return user_id
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("Failed to resolve user ID", error=str(e))
        raise HTTPException(status_code=401, detail="Invalid or expired token")
