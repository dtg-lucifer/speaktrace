FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

COPY pyproject.toml README.md ./
RUN uv sync --no-dev

COPY src/ ./src/

EXPOSE 8000

CMD ["uv", "run", "python", "-m", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
