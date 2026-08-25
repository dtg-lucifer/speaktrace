"""
Pydantic request/response models for all API endpoints.

Keep models here rather than inline in route files so they can be
reused across routes and are easy to find.

Naming convention
-----------------
  <Action><Resource>Request   — incoming request body
  <Action><Resource>Response  — outgoing response body

Examples:
  SendMessageRequest, SendMessageResponse
  GeneratePlanRequest, GeneratePlanResponse
"""

from pydantic import BaseModel, Field
from typing import Any


# ─── Chat ─────────────────────────────────────────────────────────────────────

class SendMessageRequest(BaseModel):
    message: str = Field(
        ...,
        min_length=1,
        max_length=4000,
        description="The user's message to the agent",
    )


class SendMessageResponse(BaseModel):
    success: bool = True
    data: dict[str, Any]


# ─── TODO: Add your domain-specific request/response models below ─────────────
#
# class GeneratePlanRequest(BaseModel):
#     user_data: dict[str, Any] = Field(..., description="User data to generate a plan from")
#
# class GeneratePlanResponse(BaseModel):
#     success: bool = True
#     data: dict[str, Any]
