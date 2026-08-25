"""
Root API router — mounts all sub-routers under /api/v1.

To add a new feature module:
  1. Create app/api/routes/your_feature.py
  2. Define a router = APIRouter(prefix="/your-feature", tags=["Your Feature"])
  3. Import and include it here
"""

from fastapi import APIRouter
from app.api.routes.chat import router as chat_router
from app.api.routes.memory import router as memory_router

# Add more routers here as your application grows:
# from app.api.routes.your_feature import router as your_feature_router

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(chat_router)
api_router.include_router(memory_router)
# api_router.include_router(your_feature_router)
