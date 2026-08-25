"""
BackendClient — async HTTP client for calling your backend service.

Every tool in the agent layer goes through this client.
The user's Bearer token is forwarded on every request so the backend
enforces its own auth and RBAC — this service never bypasses security.

How to extend
-------------
Add a named method for each backend endpoint you need to call.
Named methods are preferred over raw get()/post() calls in tools
because they are self-documenting and easier to mock in tests.

Example:
    async def get_user_profile(self) -> dict:
        return await self.get("/users/me/profile")

    async def create_order(self, payload: dict) -> dict:
        return await self.post("/orders", json=payload)
"""

import httpx
from typing import Any
from app.core.config import settings
from app.core.exceptions import BackendAPIError
from app.core.logger import logger


class BackendClient:
    """
    Thin async httpx wrapper.
    One instance is created per request and carries the user's access token.
    """

    def __init__(self, access_token: str):
        self._token = access_token
        self._base = settings.backend_base_url.rstrip("/")
        self._headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
            "X-Source": "agent-api",
        }

    # ─── Generic HTTP methods ─────────────────────────────────────────────────

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json: dict | None = None,
        params: dict | None = None,
    ) -> dict[str, Any]:
        url = f"{self._base}{path}"
        logger.debug("Backend call", method=method, url=url)

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.request(
                method,
                url,
                headers=self._headers,
                json=json,
                params=params,
            )

        if not response.is_success:
            body = response.text
            logger.warning(
                "Backend error",
                status=response.status_code,
                url=url,
                body=body[:200],
            )
            raise BackendAPIError(
                f"Backend returned {response.status_code}: {body[:200]}",
                status_code=response.status_code,
            )

        return response.json()

    async def get(self, path: str, params: dict | None = None) -> dict[str, Any]:
        return await self._request("GET", path, params=params)

    async def post(self, path: str, json: dict | None = None) -> dict[str, Any]:
        return await self._request("POST", path, json=json)

    async def put(self, path: str, json: dict | None = None) -> dict[str, Any]:
        return await self._request("PUT", path, json=json)

    async def patch(self, path: str, json: dict | None = None) -> dict[str, Any]:
        return await self._request("PATCH", path, json=json)

    async def delete(self, path: str) -> dict[str, Any]:
        return await self._request("DELETE", path)

    # ─── Auth ─────────────────────────────────────────────────────────────────

    async def get_me(self) -> dict:
        """GET /auth/me — returns the current user's profile."""
        return await self.get("/auth/me")

    # ─── TODO: Add your domain-specific methods below ─────────────────────────
    # Each method should map to one backend endpoint.
    # Keep method names business-level, not HTTP-level.
    #
    # Examples:
    #
    # async def get_user_orders(self) -> dict:
    #     return await self.get("/orders")
    #
    # async def create_order(self, payload: dict) -> dict:
    #     return await self.post("/orders", json=payload)
    #
    # async def update_order_status(self, order_id: str, status: str) -> dict:
    #     return await self.patch(f"/orders/{order_id}", json={"status": status})
    #
    # async def search_products(self, query: str) -> dict:
    #     return await self.get("/products/search", params={"q": query})
