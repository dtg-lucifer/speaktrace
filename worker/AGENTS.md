# AGENTS.md — Complete Guide for Worker AI Agents

> 📖 **Root System Guide**: For the full system architecture across both API and Worker services, read [Root AGENTS.md](../AGENTS.md).
> **Read this first** if you are an AI agent working on this codebase.  
> This document describes everything: architecture, conventions, data flow, LLM models, file ownership, and rules for making changes.


---

## 1. What This Project Is

A **production-grade agentic API template** built with:

| Layer | Technology |
|---|---|
| HTTP framework | FastAPI 0.115 |
| Agent framework | LangChain 0.3 (`create_openai_tools_agent`) |
| LLM (development) | Google Gemini `gemini-2.0-flash` via `langchain-google-genai` |
| LLM (production) | OpenAI `gpt-4o` / `gpt-4o-mini` via `langchain-openai` |
| Chat history | Redis (async, via `redis.asyncio`) |
| Config | Pydantic Settings (reads `.env`) |
| Logging | structlog (JSON in prod, pretty in dev) |
| Package manager | uv |
| Process manager | PM2 |
| CI/CD | GitHub Actions |
| Python version | 3.12 |

The service acts as an **AI middleware layer** between a frontend and a backend API. It:
1. Receives user messages with a Bearer token
2. Fetches live context from the backend in parallel
3. Runs a LangChain agent that can call tools (which call the backend)
4. Returns the agent's response

---

## 2. Architecture

```
Frontend / Client
      │
      │  POST /api/v1/chat  { message: "..." }
      │  Authorization: Bearer <token>
      ▼
┌─────────────────────────────────────────────────────┐
│                  agent-api  :8000                   │
│                                                     │
│  FastAPI app                                        │
│    ↓                                                │
│  auth.py — extracts Bearer token                    │
│    ↓                                                │
│  context_builder.py — parallel fetches from backend │
│    ↓                                                │
│  system_prompt.py — builds system prompt            │
│    ↓                                                │
│  executor.py — runs LangChain AgentExecutor         │
│    ↓                                                │
│  tools.py — tool calls → backend_client.py          │
│    ↓                                                │
│  chat_history.py — saves to Redis                   │
│    ↓                                                │
│  Returns response                                   │
└──────────────┬──────────────────────────────────────┘
               │  httpx calls (Bearer token forwarded)
               ▼
┌─────────────────────────────────────────────────────┐
│              Your Backend Service  :3000            │
│  (Node.js, Django, Rails, whatever)                 │
│                                                     │
│  GET  /auth/me          ← resolves user identity    │
│  GET  /your/endpoints   ← context fetches           │
│  POST /your/endpoints   ← tool write actions        │
└─────────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────┐
│  Redis  :6379                                       │
│  chat_history:{user_id}  ← rolling message window  │
└─────────────────────────────────────────────────────┘
```

---

## 3. File Map — What Every File Does

### Entry points

| File | Purpose |
|---|---|
| `main.py` | Starts uvicorn. The only file that imports `settings.app_port`. |
| `app/main.py` | FastAPI app factory. Registers CORS, exception handlers, routes, lifespan. |

### `app/core/` — Infrastructure (never contains business logic)

| File | Purpose | When to edit |
|---|---|---|
| `config.py` | All environment variables via Pydantic Settings. Single `settings` singleton. | Adding a new env var |
| `llm_factory.py` | Returns the right LangChain LLM based on `APP_ENV`. `get_chat_llm()` for agent, `get_structured_llm()` for JSON generation. | Never — unless adding a new LLM provider |
| `auth.py` | FastAPI dependencies: `get_backend_client()` and `get_current_user_id()`. Extracts Bearer token, never verifies it. | Changing how user identity is resolved |
| `redis_client.py` | Async Redis singleton. `get_redis()` / `close_redis()`. | Never |
| `exceptions.py` | Exception hierarchy + FastAPI exception handlers. | Adding a new exception type |
| `logger.py` | structlog setup. `logger` singleton. | Never |

### `app/services/` — Business logic and external calls

| File | Purpose | When to edit |
|---|---|---|
| `backend_client.py` | All HTTP calls to the backend service. Add a named method for each endpoint you need. | **Every time you need to call a new backend endpoint** |
| `context_builder.py` | Fetches user context in parallel before each agent run. Returns a dict passed to `build_system_prompt()`. | **Every time you add a new context data point** |
| `chat_history.py` | Redis rolling chat history. `load_history()`, `save_message()`, `clear_history()`. | Never |
| `memory_service.py` | Long-term memory summarization. Auto-triggered at 16 messages. Stores 30-day Redis summary. | Never |

### `app/agent/` — LangChain agent layer

| File | Purpose | When to edit |
|---|---|---|
| `executor.py` | Builds `AgentExecutor` and runs it. Prompt template structure lives here. | Changing agent behavior (temperature, max_iterations, etc.) |
| `tools.py` | All LangChain tools. `build_tools(client)` factory. | **Every time you add a new tool** |

### `app/prompts/` — LLM prompt builders

| File | Purpose | When to edit |
|---|---|---|
| `system_prompt.py` | `build_system_prompt(ctx)` — assembles the full system prompt from context. | **Every time you add new context or change agent persona** |

### `app/api/` — HTTP layer

| File | Purpose | When to edit |
|---|---|---|
| `router.py` | Mounts all sub-routers at `/api/v1`. | Adding a new route module |
| `routes/chat.py` | Chat endpoints: POST/GET/DELETE `/api/v1/chat`, POST `/api/v1/chat/stream`. | Changing chat endpoint behavior |
| `routes/memory.py` | Memory endpoints: POST/GET/DELETE `/api/v1/memory`. | Never |

### `app/schemas/` — Pydantic models

| File | Purpose | When to edit |
|---|---|---|
| `requests.py` | Request/response Pydantic models. | Adding new endpoints |

---

## 4. LLM Models

### Provider selection

All tasks use **Gemini** (Google AI Studio) as the primary provider, with OpenRouter and OpenAI as fallbacks.
`GEMINI_API_KEY` is the only required API key for Gemini.

```python
# In app/core/llm_factory.py
from app.core.llm_factory import get_chat_llm, get_plan_llm, get_reasoning_llm

llm = get_chat_llm()       # chat agent (tool calling) → GEMINI_MODEL
llm = get_plan_llm()       # structured JSON → GEMINI_MODEL
llm = get_reasoning_llm()  # deep analysis → GEMINI_MODEL
```

| Task | Function | Model env var | Default |
|---|---|---|---|
| Chat agent (tool calling) | `get_chat_llm()` | `GEMINI_CHAT_MODEL` | `gemini-2.0-flash` |
| Structured JSON generation | `get_plan_llm()` | `GEMINI_MODEL` | `gemini-2.0-flash` |
| Deep reasoning / evaluation | `get_reasoning_llm()` | `GEMINI_MODEL` | `gemini-2.0-flash` |
| Vision (multimodal) | `get_vision_llm()` | `GEMINI_MODEL` | `gemini-2.0-flash` |

### Why Gemini for the chat agent?

Gemini 2.0 Flash supports function calling, making it compatible with `create_openai_tools_agent`.
If Gemini is not available, the system falls back to OpenRouter (OpenAI-compatible) and then OpenAI.

### Fallback chain

If `GEMINI_API_KEY` is not set, the factory attempts to use OpenRouter, then OpenAI.
If no provider keys are set, the factory raises a clear error message at call time.

### Fallback chain

If `OPENROUTER_API_KEY` is not set, the factory raises `RuntimeError` at call time with a clear message. Gemini and OpenAI keys are kept as optional fallbacks for non-agent tasks only.

**Rule: Never import `ChatOpenAI` or `ChatGoogleGenerativeAI` directly in business logic. Always use the factory.**

---

## 5. Authentication Flow

```
Client sends: Authorization: Bearer eyJhbGci...
                    ↓
auth.py: get_backend_client()
  → extracts token
  → creates BackendClient(access_token=token)
  → BackendClient carries token on every outgoing request
                    ↓
auth.py: get_current_user_id()
  → calls GET /auth/me on backend
  → extracts user.id from response
  → returns user_id string
```

**This service NEVER verifies JWTs.** It only forwards the token. The backend is the single source of truth for authentication.

If your backend uses a different auth endpoint (not `/auth/me`), update `BackendClient.get_me()` in `backend_client.py`.

---

## 6. Agent Execution Flow

```
POST /api/v1/chat { message: "..." }
        ↓
1. get_current_user_id(client)
   → GET /auth/me → user_id

2. build_user_context(client)
   → asyncio.gather(10+ parallel backend calls)
   → returns ctx dict

3. load_history(user_id)
   → Redis LRANGE → list[BaseMessage]

4. build_system_prompt(ctx)
   → formats ctx into string prompt

5. AgentExecutor.ainvoke({
       "input": user_message,
       "chat_history": history,
   })
   → LLM decides: respond OR call tool
   → If tool: executes tool → feeds result back to LLM
   → Repeats up to AGENT_MAX_ITERATIONS times
   → Returns final text response

6. save_message(user_id, "human", message)
   save_message(user_id, "ai", response)
   → Redis LPUSH + LTRIM

7. Return { success: true, data: { message, userId } }
```

---

## 7. Tool Design Rules

Tools are what the agent can DO. The LLM reads each tool's docstring to decide when to call it.

### Rules (non-negotiable)

1. **Business-level, not HTTP-level.** `create_order(item, qty)` not `post_to_orders_endpoint(payload)`.
2. **Docstring is the tool description.** Be specific about WHEN to use it. Vague docstrings → wrong tool calls.
3. **Always wrap in try/except.** Return a human-readable error string on failure. Never raise from a tool.
4. **Validate inputs before calling backend.** Check ranges, types, required fields.
5. **Return strings.** The LLM feeds the return value back into its reasoning.
6. **Write tools should confirm intent.** Add "Always confirm with the user before calling this." to the docstring.
7. **No shared state.** Tools are closures over `client` — one client per request.

### Tool template

```python
@tool
async def do_something(param: str, optional_param: int = 1) -> str:
    """
    One sentence: what this tool does.
    Use this when the user says X, Y, or Z.
    Do NOT use this when the user asks about A or B (use other_tool instead).

    Args:
        param:          Description of what this parameter is
        optional_param: Description, including the default value
    """
    # Validate inputs
    if not param or len(param.strip()) < 2:
        return "Please provide a valid value for param."

    try:
        result = await client.some_backend_method(param, optional_param)
        logger.info("Action completed via agent", param=param)
        return f"✅ Done: {result.get('message', 'Success')}."
    except Exception as e:
        return f"Could not complete action: {e}"
```

---

## 8. Adding a New Feature — Step-by-Step

### Adding a new tool (most common task)

1. **Add backend method** in `app/services/backend_client.py`:
   ```python
   async def get_something(self, id: str) -> dict:
       return await self.get(f"/something/{id}")
   ```

2. **Add tool** in `app/agent/tools.py` inside `build_tools()`:
   ```python
   @tool
   async def get_something(id: str) -> str:
       """Clear docstring about when to use this."""
       try:
           result = await client.get_something(id)
           return json.dumps(result.get("data", result), indent=2)
       except Exception as e:
           return f"Could not fetch: {e}"
   ```

3. **Add to return list** at the bottom of `build_tools()`:
   ```python
   return [
       get_current_user,
       get_something,   # ← add here
   ]
   ```

### Adding context to every agent run

1. **Add backend method** in `backend_client.py`
2. **Add to `asyncio.gather`** in `context_builder.py`
3. **Add to returned dict** in `context_builder.py`
4. **Reference in `build_system_prompt()`** in `system_prompt.py`

### Adding a new API route module

1. Create `app/api/routes/your_feature.py`
2. Define `router = APIRouter(prefix="/your-feature", tags=["Your Feature"])`
3. Add endpoints
4. Register in `app/api/router.py`

---

## 9. Configuration Reference

All config lives in `app/core/config.py`. Access via `from app.core.config import settings`.

```python
settings.app_port           # int — server port
settings.app_env            # str — "development" | "production"
settings.is_development     # bool — computed property
settings.log_level          # str — "debug" | "info" | "warning" | "error"

# Gemini (primary)
settings.gemini_api_key     # str
settings.gemini_model       # str
settings.gemini_chat_model  # str
settings.has_gemini         # bool — computed property

# OpenRouter (optional fallback)
settings.openrouter_api_key           # str
settings.openrouter_reasoning_model   # str — chat, evaluation, vision
settings.openrouter_general_model     # str — structured JSON, plan generation
settings.has_openrouter               # bool — computed property

# OpenAI (optional fallback)
settings.openai_api_key     # str
settings.openai_model       # str
settings.openai_chat_model  # str
settings.has_openai         # bool — computed property

settings.primary_llm_provider   # str — "gemini" | "openrouter" | "openai" | "none" (computed property)
```

---

## 10. Redis Key Namespacing

| Key pattern | Purpose | Owner |
|---|---|---|
| `chat_history:{user_id}` | Rolling chat history list | `chat_history.py` |
| `memory:{user_id}` | Long-term memory summary (30-day TTL) | `memory_service.py` |

If you share Redis with your backend service, use distinct prefixes to avoid collisions.

---

## 11. Error Handling

### Exception hierarchy

```
AgentAPIError (base, 500)
  ├── BackendAPIError (502) — backend returned non-2xx
  ├── AgentRunError (500)   — LangChain agent failed
  └── UnauthorizedError (401) — missing/invalid token
```

### Rules

- **Never raise raw `Exception` from route handlers.** Use the hierarchy above.
- **Tools must never raise.** Catch all exceptions and return a human-readable string.
- **Backend errors are wrapped** in `BackendAPIError` by `BackendClient._request()`.
- **FastAPI handlers** in `exceptions.py` convert exceptions to `{ success: false, message: "..." }` JSON.

---

## 12. Logging

```python
from app.core.logger import logger

logger.info("Something happened", key="value", count=42)
logger.warning("Something unexpected", error=str(e))
logger.error("Something failed", error=str(e), user_id=user_id)
logger.debug("Verbose detail", payload=data)
```

- **Development**: pretty-printed, coloured console output
- **Production**: JSON lines — one JSON object per log entry, ready for log aggregators

Never use `print()`. Never use `logging.getLogger()` directly.

---

## 13. Deployment

### CI/CD pipeline (`.github/workflows/deploy.yml`)

```
push to main
    ↓
ci job: uv sync → ruff check → pyright
    ↓
deploy job: scp source → ssh (uv sync --no-dev → pm2 reload)
    ↓
health-check job: GET /health → assert 200
```

### Required GitHub Secrets

| Secret | Description |
|---|---|
| `DEPLOY_HOST` | Server IP or hostname |
| `DEPLOY_USER` | SSH user |
| `SSH_KEY` | Private key content |
| `APP_DIR` | Absolute path on server (e.g. `/var/www/agent-api`) |

### PM2 process config (`ecosystem.config.json`)

```json
{
  "apps": [{
    "name": "agent-api",
    "script": "main.py",
    "interpreter": ".venv/bin/python",
    "env_production": { "APP_ENV": "production" }
  }]
}
```

The `.venv` is created by `uv sync --no-dev` on the server. Never commit `.venv`.

---

## 14. What NOT to Do

| ❌ Don't | ✅ Do instead |
|---|---|
| Import `ChatOpenAI` directly | Use `get_chat_llm()` from `llm_factory.py` |
| Import `ChatGoogleGenerativeAI` directly | Use `get_chat_llm()` from `llm_factory.py` |
| Use OpenRouter for the chat agent (unless Gemini unavailable) | Use Gemini — it supports function calling natively |
| Verify JWTs in this service | Forward the token; let the backend verify |
| Write to a database from this service | Call the backend API to write data |
| Use `print()` for logging | Use `logger.info()` / `logger.error()` |
| Raise from inside a tool | Return a human-readable error string |
| Read `os.environ` directly | Use `settings.your_var` from `config.py` |
| Share state between requests | Each request gets its own `BackendClient` and `AgentExecutor` |
| Put business logic in `core/` | `core/` is infrastructure only |
| Hardcode model names | Use `settings.gemini_model` etc. |

---

## 15. Checklist for Common Tasks

### Adding a new tool
- [ ] Add method to `BackendClient` in `backend_client.py`
- [ ] Add `@tool` function inside `build_tools()` in `tools.py`
- [ ] Write a specific docstring (when to use, when NOT to use, args)
- [ ] Add to the `return [...]` list in `build_tools()`
- [ ] Test: does the agent call it when expected? Does it NOT call it when not expected?

### Adding context to every agent run
- [ ] Add method to `BackendClient`
- [ ] Add `safe(client.new_method())` to `asyncio.gather` in `context_builder.py`
- [ ] Add result to returned dict in `context_builder.py`
- [ ] Reference in `build_system_prompt()` in `system_prompt.py`

### Adding a new API endpoint
- [ ] Add Pydantic models to `schemas/requests.py`
- [ ] Create route in `app/api/routes/your_feature.py`
- [ ] Register router in `app/api/router.py`

### Adding a new environment variable
- [ ] Add field to `Settings` class in `config.py`
- [ ] Add to `.env.example` with a comment
- [ ] Add to the GitHub Secrets table in `README.md` if it's a secret
