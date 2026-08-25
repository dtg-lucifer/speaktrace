"""
Central configuration — reads from environment variables via pydantic-settings.

All settings have sensible defaults for local development.
Add new settings here; never read os.environ directly in business logic.

LLM routing strategy
--------------------
Primary LLM provider is Gemini (GEMINI_API_KEY required for agent tasks).
OpenRouter and OpenAI are kept as optional fallbacks.

  Chat agent (tool calling)   → GEMINI_MODEL (with function calling support)
  Structured JSON generation  → GEMINI_MODEL or OPENROUTER_GENERAL_MODEL
  Deep reasoning / evaluation → GEMINI_MODEL or OPENROUTER_REASONING_MODEL

Note: Gemini 2.0 Flash supports function calling, making it suitable for the chat agent.
If GEMINI_API_KEY is not set, falls back to OpenRouter, then OpenAI.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ─── Server ───────────────────────────────────────────────────────────────
    app_port: int = 8000
    app_env: str = "development"   # "development" | "production"
    log_level: str = "debug"

    # ─── OpenRouter (primary — all tasks) ─────────────────────────────────────
    openrouter_api_key: str = ""
    # Reasoning model — chat agent, evaluation, vision, analysis
    openrouter_reasoning_model: str = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"
    # General model — structured JSON output, plan generation
    openrouter_general_model: str = "openai/gpt-4o-mini"

    # ─── OpenAI (optional fallback) ───────────────────────────────────────────
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"
    openai_chat_model: str = "gpt-4o-mini"

    # ─── Gemini (optional fallback) ───────────────────────────────────────────
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"
    gemini_chat_model: str = "gemini-2.0-flash"

    # ─── Backend API ──────────────────────────────────────────────────────────
    # The service this agent calls as tools (e.g. your Node.js/Express backend)
    backend_base_url: str = "http://localhost:8989"

    # ─── Redis ────────────────────────────────────────────────────────────────
    redis_url: str = "redis://localhost:6379"
    ai_cache_ttl: int = 300  # seconds

    # ─── RabbitMQ ─────────────────────────────────────────────────────────────
    rabbitmq_url: str = "amqp://speaktrace:speaktrace_pass@localhost:5672/speaktrace"
    rabbitmq_exchange: str = "speaktrace.events"
    rabbitmq_exchange_type: str = "topic"
    # Queues this worker binds to
    rabbitmq_worker_queue: str = "speaktrace.worker"
    rabbitmq_prefetch: int = 1  # process one job at a time

    # ─── Agent ────────────────────────────────────────────────────────────────
    agent_max_iterations: int = 5
    chat_history_limit: int = 20

    # ─── Computed properties ──────────────────────────────────────────────────

    @property
    def is_development(self) -> bool:
        return self.app_env == "development"

    @property
    def has_gemini(self) -> bool:
        return bool(self.gemini_api_key)

    @property
    def has_openrouter(self) -> bool:
        return bool(self.openrouter_api_key)

    @property
    def has_openai(self) -> bool:
        return bool(self.openai_api_key)

    @property
    def primary_llm_provider(self) -> str:
        """Returns the primary LLM provider to use based on available keys."""
        if self.has_gemini:
            return "gemini"
        elif self.has_openrouter:
            return "openrouter"
        elif self.has_openai:
            return "openai"
        else:
            return "none"


# Singleton — import this everywhere
settings = Settings()
