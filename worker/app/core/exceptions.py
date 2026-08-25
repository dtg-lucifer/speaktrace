"""
Application-level exceptions and FastAPI exception handlers.

Exception hierarchy
-------------------
AgentAPIError           — base for all agent API errors
  ├── BackendAPIError   — backend service returned a non-2xx response
  ├── AgentRunError     — LangChain agent failed to complete a run
  └── UnauthorizedError — missing or invalid Bearer token
"""

from fastapi import Request
from fastapi.responses import JSONResponse


class AgentAPIError(Exception):
    """Base exception for all agent API errors."""

    def __init__(self, message: str, status_code: int = 500):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class BackendAPIError(AgentAPIError):
    """Raised when a call to the backend service returns a non-2xx response."""

    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message, status_code)


class AgentRunError(AgentAPIError):
    """Raised when the LangChain agent fails to complete a run."""

    def __init__(self, message: str):
        super().__init__(message, 500)


class UnauthorizedError(AgentAPIError):
    def __init__(self, message: str = "Unauthorized"):
        super().__init__(message, 401)


# ─── FastAPI exception handlers ───────────────────────────────────────────────

async def agent_api_exception_handler(
    request: Request, exc: AgentAPIError
) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "message": exc.message},
    )


async def generic_exception_handler(
    request: Request, exc: Exception
) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content={"success": False, "message": "Internal server error"},
    )
