"""
LLM Factory — task-specific model routing with Gemini as primary provider.

Routes to available LLM providers in this order:
1. Gemini (Google AI Studio) - primary choice
2. OpenRouter (OpenAI-compatible) - fallback
3. OpenAI - last resort fallback

For the chat agent (tool calling), we use Gemini 2.0 Flash which supports function calling,
making it compatible with create_openai_tools_agent.

Rules
-----
- NEVER import ChatOpenAI or ChatGoogleGenerativeAI directly in business logic.
- Always go through this factory so the provider switch is automatic.
- get_plan_llm() is for structured JSON — use for any fixed-schema output.
"""

from langchain_core.language_models import BaseChatModel
from app.core.config import settings
from app.core.logger import logger


# ─── Public task-specific factories ──────────────────────────────────────────

def get_chat_llm(temperature: float = 0.3, streaming: bool = False) -> BaseChatModel:
    """
    Chat agent — tool calling, conversational responses.
    Uses Gemini 2.0 Flash which supports function calling for tool use.
    """
    provider = settings.primary_llm_provider
    if provider == "gemini":
        return _gemini(settings.gemini_chat_model, temperature, streaming=streaming)
    elif provider == "openrouter":
        return _openrouter(settings.openrouter_reasoning_model, temperature, streaming=streaming)
    elif provider == "openai":
        return _openai(settings.openai_chat_model, temperature, streaming=streaming)
    else:
        raise RuntimeError(
            "No LLM provider API key is set. "
            "Please set GEMINI_API_KEY, OPENROUTER_API_KEY, or OPENAI_API_KEY in your .env file."
        )


def get_plan_llm(temperature: float = 0.2) -> BaseChatModel:
    """
    Structured JSON generation — plan creation, analysis, summarization.
    Uses Gemini for reliable structured output, falls back to OpenRouter/OpenAI.
    """
    provider = settings.primary_llm_provider
    if provider == "gemini":
        return _gemini(settings.gemini_model, temperature)
    elif provider == "openrouter":
        return _openrouter(settings.openrouter_general_model, temperature)
    elif provider == "openai":
        return _openai(settings.openai_model, temperature)
    else:
        raise RuntimeError(
            "No LLM provider API key is set. "
            "Please set GEMINI_API_KEY, OPENROUTER_API_KEY, or OPENAI_API_KEY in your .env file."
        )


def get_reasoning_llm(temperature: float = 0.1) -> BaseChatModel:
    """
    Deep reasoning — evaluation, complex multi-step analysis.
    Uses Gemini for reasoning, falls back to OpenRouter/OpenAI.
    """
    provider = settings.primary_llm_provider
    if provider == "gemini":
        return _gemini(settings.gemini_model, temperature)
    elif provider == "openrouter":
        return _openrouter(settings.openrouter_reasoning_model, temperature)
    elif provider == "openai":
        return _openai(settings.openai_model, temperature)
    else:
        raise RuntimeError(
            "No LLM provider API key is set. "
            "Please set GEMINI_API_KEY, OPENROUTER_API_KEY, or OPENAI_API_KEY in your .env file."
        )


def get_vision_llm() -> BaseChatModel:
    """
    Vision — multimodal image analysis.
    Uses Gemini 2.0 Flash for vision capabilities, falls back to OpenRouter/OpenAI.
    Note: For direct multimodal calls, use the appropriate SDK with base_url set to
    the provider's endpoint instead of this LangChain wrapper.
    """
    provider = settings.primary_llm_provider
    if provider == "gemini":
        return _gemini(settings.gemini_model, temperature=0.1)
    elif provider == "openrouter":
        return _openrouter(settings.openrouter_reasoning_model, temperature=0.1)
    elif provider == "openai":
        return _openai(settings.openai_model, temperature=0.1)
    else:
        raise RuntimeError(
            "No LLM provider API key is set. "
            "Please set GEMINI_API_KEY, OPENROUTER_API_KEY, or OPENAI_API_KEY in your .env file."
        )


# Legacy alias — kept for backward compatibility
def get_structured_llm(temperature: float = 0.2) -> BaseChatModel:
    """Alias for get_plan_llm(). Use get_plan_llm() in new code."""
    return get_plan_llm(temperature)


# ─── Private helpers ──────────────────────────────────────────────────────────

def _gemini(model: str, temperature: float, streaming: bool = False) -> BaseChatModel:
    """
    Gemini via Google AI Studio.
    Uses ChatGoogleGenerativeAI with the specified model.
    """
    from langchain_google_genai import ChatGoogleGenerativeAI

    logger.debug("LLM: Gemini", model=model, streaming=streaming)
    return ChatGoogleGenerativeAI(
        model=model,
        temperature=temperature,
        google_api_key=settings.gemini_api_key,
        streaming=streaming,
        convert_system_message_to_human=True,  # Required for tool calling with Gemini
    )


def _openrouter(model: str, temperature: float, streaming: bool = False) -> BaseChatModel:
    """
    OpenRouter via the OpenAI-compatible API.
    Uses ChatOpenAI with base_url pointing at OpenRouter.
    Sends required HTTP-Referer and X-Title headers.
    """
    from langchain_openai import ChatOpenAI

    logger.debug("LLM: OpenRouter", model=model, streaming=streaming)
    return ChatOpenAI(
        model=model,
        temperature=temperature,
        api_key=settings.openrouter_api_key,
        base_url="https://openrouter.ai/api/v1",
        streaming=streaming,
        default_headers={
            "HTTP-Referer": "https://your-app.com",   # update to your app URL
            "X-Title": "Agent API",                   # update to your app name
        },
    )


def _openai(model: str, temperature: float, streaming: bool = False) -> BaseChatModel:
    """
    OpenAI via direct API.
    Uses ChatOpenAI with OpenAI's API endpoint.
    """
    from langchain_openai import ChatOpenAI

    logger.debug("LLM: OpenAI", model=model, streaming=streaming)
    return ChatOpenAI(
        model=model,
        temperature=temperature,
        api_key=settings.openai_api_key,
        streaming=streaming,
    )
