"""
Entry point.

Run dev server:   uv run main.py
Run with uvicorn: uv run uvicorn app.main:app --reload --port 8000
"""

import uvicorn

from app.core.config import settings


def main() -> None:
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=settings.app_port,
        reload=settings.is_development,
        log_level=settings.log_level.lower(),
    )


if __name__ == "__main__":
    main()
