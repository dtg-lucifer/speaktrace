# Backend Agent LangChain Template

> **Production-grade agentic API template**  
> FastAPI · LangChain · Gemini · Redis · uv · PM2

Clone this, rename things, add your tools, ship.

---

## What's Included

- **FastAPI** app with lifespan, CORS, and exception handlers
- **LangChain AgentExecutor** with tool calling (OpenAI tools API format)
- **Gemini** as the LLM provider — one API key, access to Google's models
- **Long-term memory** — auto-summarizes old chat history into a persistent Redis summary
- **SSE streaming** — token-by-token responses via `POST /api/v1/chat/stream`
- **Bearer token forwarding** — the agent never verifies JWTs; forwards to your backend
- **Parallel context fetching** — `asyncio.gather` fires all backend calls concurrently
- **Redis rolling chat history** — per-user, configurable window size
- **Structured logging** — JSON in production, pretty-printed in development (structlog)
- **Pydantic settings** — all config from `.env`, validated at startup
- **PM2 ecosystem config** — production process management
- **GitHub Actions CI/CD** — lint → type-check → deploy → health check

---

## Quick Start

### Prerequisites

- Python ≥ 3.12
- [uv](https://docs.astral.sh/uv/) — `curl -LsSf https://astral.sh/uv/install.sh | sh`
- Redis
- A backend service with a `GET /auth/me` endpoint (or adapt `auth.py`)

### 1. Clone and install

```bash
git clone <your-repo>
cd <your-repo>
uv sync
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` — at minimum set:
```env
# Required — all LLM tasks use Gemini
GEMINI_API_KEY=your_gemini_key_here

# Your backend service URL
BACKEND_BASE_URL=http://localhost:3000
```

### 3. Start Redis

```bash
redis-server
# or: docker run -p 6379:6379 redis:alpine
```

### 4. Run the dev server

```bash
uv run main.py
```

The server starts on `http://localhost:8000`.

- Swagger UI: `http://localhost:8000/docs`
- Health check: `http://localhost:8000/health`

---

## Project Structure

```
.
├── main.py                      # Entry point — starts uvicorn
├── pyproject.toml               # Dependencies + build config (uv)
├── .python-version              # Python 3.12
├── .env.example                 # Environment variable template
├── ecosystem.config.json        # PM2 production process config
│
├── app/
│   ├── main.py                  # FastAPI app factory (CORS, exception handlers, routes)
│   │
│   ├── core/                    # Infrastructure — shared by everything
│   │   ├── config.py            # Pydantic settings (reads .env)
│   │   ├── llm_factory.py       # LLM routing: get_chat_llm() / get_plan_llm() / get_reasoning_llm()
│   │   ├── auth.py              # Bearer token extraction FastAPI dependency
│   │   ├── redis_client.py      # Async Redis singleton
│   │   ├── exceptions.py        # Custom exceptions + FastAPI handlers
│   │   └── logger.py            # structlog setup (JSON prod / pretty dev)
│   │
│   ├── api/
│   │   ├── router.py            # Root router — mounts all sub-routers at /api/v1
│   │   └── routes/
│   │       ├── chat.py          # POST/GET/DELETE /api/v1/chat + POST /api/v1/chat/stream
│   │       └── memory.py        # POST/GET/DELETE /api/v1/memory
│   │
│   ├── agent/
│   │   ├── executor.py          # AgentExecutor builder + run_agent() + streaming support
│   │   └── tools.py             # LangChain tools — ADD YOUR TOOLS HERE
│   │
│   ├── services/
│   │   ├── backend_client.py    # Async httpx wrapper — ADD YOUR BACKEND METHODS HERE
│   │   ├── context_builder.py   # Parallel context fetcher — ADD YOUR FETCHES HERE
│   │   ├── chat_history.py      # Redis rolling chat history
│   │   └── memory_service.py    # Long-term memory summarization (auto at 16 messages)
│   │
│   ├── prompts/
│   │   └── system_prompt.py     # Dynamic system prompt builder — CUSTOMIZE THIS
│   │
│   └── schemas/
│       └── requests.py          # Pydantic request/response models
│
└── .github/
    └── workflows/
        └── deploy.yml           # CI/CD: lint → typecheck → deploy → health check
```

---

## How to Build Your Agent

There are 4 files you need to touch to build your specific agent. Everything else is infrastructure that you don't need to change.

### Step 1 — Add backend methods (`app/services/backend_client.py`)

Add a named async method for each endpoint on your backend that the agent needs to call:

```python
async def get_user_orders(self) -> dict:
    return await self.get("/orders")

async def create_order(self, payload: dict) -> dict:
    return await self.post("/orders", json=payload)

async def search_products(self, query: str) -> dict:
    return await self.get("/products/search", params={"q": query})
```

### Step 2 — Add context fetches (`app/services/context_builder.py`)

Add parallel fetches for data the agent needs in every response:

```python
(
    me,
    recent_orders,
    account_balance,
) = await asyncio.gather(
    safe(client.get_me()),
    safe(client.get_user_orders()),
    safe(client.get_account_balance()),
)

return {
    "user": me,
    "recent_orders": recent_orders,
    "account_balance": account_balance,
}
```

### Step 3 — Build the system prompt (`app/prompts/system_prompt.py`)

Format the context into a clear, structured system prompt. The `memory` parameter is injected automatically — include it in your prompt:

```python
def build_system_prompt(ctx: dict[str, Any], memory: str | None = None) -> str:
    user = ctx.get("user", {})
    orders = ctx.get("recent_orders", [])

    memory_section = f"\nPAST CONTEXT:\n{memory}\n" if memory else ""

    return f"""You are a helpful shopping assistant for {user.get('name')}.
{memory_section}
RECENT ORDERS:
{_format_orders(orders)}

Use tools to take actions. Answer questions directly from context above.
"""
```

### Step 4 — Add tools (`app/agent/tools.py`)

Add `@tool` functions inside `build_tools()`:

```python
@tool
async def get_order_status(order_id: str) -> str:
    """
    Get the current status of a specific order.
    Use this when the user asks 'where is my order' or 'what happened to order #X'.

    Args:
        order_id: The order ID to look up (e.g. 'ORD-12345')
    """
    try:
        result = await client.get_order(order_id)
        return json.dumps(result.get("data", result), indent=2)
    except Exception as e:
        return f"Could not fetch order: {e}"
```

Then add it to the return list:

```python
return [
    get_current_user,
    get_order_status,   # ← add here
]
```

---

## API Endpoints

All endpoints are prefixed with `/api/v1`.

| Method | Path | Description | Auth |
|---|---|---|---|
| `GET` | `/health` | Health check | None |
| `POST` | `/api/v1/chat` | Send message to agent, get full response | Bearer |
| `GET` | `/api/v1/chat/history` | Get rolling chat history from Redis | Bearer |
| `DELETE` | `/api/v1/chat/history` | Clear chat history + long-term memory | Bearer |
| `POST` | `/api/v1/chat/stream` | SSE streaming — token-by-token response | Bearer |
| `POST` | `/api/v1/memory/summarize` | Manually trigger memory summarization | Bearer |
| `GET` | `/api/v1/memory` | Get current long-term memory summary | Bearer |
| `DELETE` | `/api/v1/memory` | Clear long-term memory | Bearer |

### POST /api/v1/chat

```bash
curl -X POST http://localhost:8000/api/v1/chat \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, what can you help me with?"}'
```

Response:
```json
{
  "success": true,
  "data": {
    "message": "I can help you with...",
    "userId": "user-uuid"
  }
}
```

### POST /api/v1/chat/stream (SSE)

```javascript
const response = await fetch('http://localhost:8000/api/v1/chat/stream', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'Hello' }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\n\n');
  buffer = lines.pop() || '';
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    const data = line.slice(6);
    if (data === '[DONE]') return;
    const { token } = JSON.parse(data);
    appendToUI(token);
  }
}
```

---

## LLM Provider Strategy

All tasks use **Gemini** (Google AI Studio) as the primary provider, with OpenRouter and OpenAI as fallbacks.
`GEMINI_API_KEY` is the only required API key for Gemini.

| Task | Function | Model env var | Default |
|---|---|---|---|
| Chat agent (tool calling) | `get_chat_llm()` | `GEMINI_CHAT_MODEL` | `gemini-2.0-flash` |
| Structured JSON generation | `get_plan_llm()` | `GEMINI_MODEL` | `gemini-2.0-flash` |
| Deep reasoning / evaluation | `get_reasoning_llm()` | `GEMINI_MODEL` | `gemini-2.0-flash` |

**Why Gemini for the chat agent?** Gemini 2.0 Flash supports function calling, making it compatible with `create_openai_tools_agent`.
If Gemini is not available, the system falls back to OpenRouter (OpenAI-compatible) and then OpenAI.

```python
# In your code — never import ChatOpenAI or ChatGoogleGenerativeAI directly
from app.core.llm_factory import get_chat_llm, get_plan_llm, get_reasoning_llm

llm = get_chat_llm()       # for the agent (tool calling)
llm = get_plan_llm()       # for JSON generation (no tool loop)
llm = get_reasoning_llm()  # for deep analysis
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `APP_PORT` | `8000` | Port to listen on |
| `APP_ENV` | `development` | `development` or `production` |
| `LOG_LEVEL` | `debug` | `debug`, `info`, `warning`, `error` |
| `GEMINI_API_KEY` | — | **Required** — all LLM tasks use Gemini by default |
| `GEMINI_MODEL` | `gemini-2.0-flash` | Model for chat agent, structured JSON, reasoning, and vision |
| `GEMINI_CHAT_MODEL` | `gemini-2.0-flash` | Model specifically for chat agent (tool calling) |
| `OPENROUTER_API_KEY` | — | Optional fallback — used if GEMINI_API_KEY is not set |
| `OPENROUTER_REASONING_MODEL` | `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` | Reasoning model for OpenRouter fallback |
| `OPENROUTER_GENERAL_MODEL` | `openai/gpt-4o-mini` | General model for OpenRouter fallback |
| `OPENAI_API_KEY` | — | Optional fallback — used if GEMINI_API_KEY and OPENROUTER_API_KEY are not set |
| `OPENAI_MODEL` | `gpt-4o` | Model for OpenAI fallback |
| `OPENAI_CHAT_MODEL` | `gpt-4o-mini` | Chat model for OpenAI fallback |
| `BACKEND_BASE_URL` | `http://localhost:3000` | Your backend service URL |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `AI_CACHE_TTL` | `300` | Cache TTL in seconds |
| `AGENT_MAX_ITERATIONS` | `5` | Max tool calls per agent run |
| `CHAT_HISTORY_LIMIT` | `20` | Rolling history window size |

---

## Development Commands

```bash
# Start dev server (auto-reload)
uv run main.py

# Lint
uv run ruff check .
uv run ruff check --fix .

# Type check
uv run pyright

# Add a dependency
uv add <package>

# Add a dev dependency
uv add --dev <package>

# Sync dependencies (after pulling changes)
uv sync
```

---

## Deployment

### GitHub Secrets required

| Secret | Example | Description |
|---|---|---|
| `DEPLOY_HOST` | `123.45.67.89` | Server IP or hostname |
| `DEPLOY_USER` | `root` | SSH user |
| `SSH_KEY` | `-----BEGIN OPENSSH...` | Private key for SSH |
| `APP_DIR` | `/var/www/agent-api` | Deployment directory on server |

### Server prerequisites

```bash
# uv
curl -LsSf https://astral.sh/uv/install.sh | sh
source ~/.bashrc

# PM2
npm install -g pm2
pm2 startup && pm2 save

# Redis
sudo apt install -y redis-server
sudo systemctl enable redis-server
```

### First deploy

1. Add secrets to GitHub → Settings → Secrets and variables → Actions
2. Create the deployment directory on the server: `mkdir -p /var/www/agent-api`
3. Copy `.env` to the server: `scp .env user@host:/var/www/agent-api/.env`
4. Push to `main` — the workflow handles the rest

---

## Adding a New Route Module

1. Create `app/api/routes/your_feature.py`
2. Define a router:
   ```python
   from fastapi import APIRouter
   router = APIRouter(prefix="/your-feature", tags=["Your Feature"])
   ```
3. Add your endpoints to the router
4. Register in `app/api/router.py`:
   ```python
   from app.api.routes.your_feature import router as your_feature_router
   api_router.include_router(your_feature_router)
   ```
