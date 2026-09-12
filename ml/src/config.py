import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../api/.env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "speaktrace-ml"
    app_env: str = "development"
    app_port: int = 8000
    app_host: str = "0.0.0.0"

    redis_url: str = "redis://localhost:6379"
    rabbitmq_url: str = "amqp://speaktrace:speaktrace_pass@localhost:5672/speaktrace"
    queue_provider: str = "bullmq"

    cloudinary_url: str = ""
    backend_api_url: str = "http://localhost:8989"

    # LLM Providers (Gemini, OpenAI, OpenRouter, or local Ollama)
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    openrouter_api_key: str = ""
    openrouter_model: str = "google/gemini-2.0-flash-exp:free"

    # Ollama Configuration (Local)
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2:1b"

    # Vector store
    chroma_persist_dir: str = "./chroma_db"

    # Diarization & Whisper
    hf_token: str = ""
    whisper_model_size: str = "base"


settings = Settings()

if settings.cloudinary_url:
    import cloudinary
    os.environ["CLOUDINARY_URL"] = settings.cloudinary_url
    cloudinary.reset_config()
