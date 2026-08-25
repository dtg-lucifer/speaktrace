"""
System prompt builder for the chat agent.

The system prompt is assembled dynamically on every request from the
user's live context (fetched in context_builder.py) and optional
long-term memory (from memory_service.py).

How to extend
-------------
1. Add new data to build_user_context() in context_builder.py.
2. Reference the new context keys in build_system_prompt() below.
3. Add a section to the prompt template describing the new data.

Prompt design principles
------------------------
- Be specific about the agent's persona and constraints.
- Inject live context as structured sections (not raw JSON dumps).
- Tell the agent exactly when to use tools vs answer directly.
- Include safety guardrails relevant to your domain.
- Keep the prompt focused — every line costs tokens.
- Memory section is injected only when a summary exists.
"""

from typing import Any


def build_system_prompt(ctx: dict[str, Any], memory: str | None = None) -> str:
    """
    Builds the full system prompt from the user context dict and optional memory.

    Args:
        ctx:    The dict returned by build_user_context()
        memory: Optional long-term memory summary from memory_service.get_memory()

    Returns:
        A string system prompt ready to pass to the AgentExecutor.
    """
    user = ctx.get("user", {})

    # Extract user info — adapt these keys to match your backend's response shape
    user_name = user.get("name") or user.get("firstName") or "the user"
    user_email = user.get("email", "")

    # TODO: Extract and format your domain-specific context here
    # Example:
    # orders = ctx.get("recent_orders", [])
    # order_summary = _format_orders(orders) if orders else "No recent orders."

    # Build memory section — only included when a summary exists
    memory_section = ""
    if memory:
        memory_section = f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LONG-TERM MEMORY (from past conversations)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{memory}
"""

    return f"""You are a helpful AI assistant for {user_name}.

You are professional, concise, and accurate. You only answer questions
you have context for — if you don't know something, say so clearly.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CURRENT USER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Name:  {user_name}
Email: {user_email or "Not provided"}
{memory_section}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TODO: ADD YOUR DOMAIN CONTEXT SECTIONS HERE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Replace this section with structured context relevant to your application.
For example:
  - Current account balance
  - Recent orders or activity
  - User preferences or settings
  - Any real-time data the agent needs to answer questions

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOOLS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You have tools available to take actions on behalf of the user.
Use tools when the user asks you to DO something (create, update, fetch live data).
Answer directly from the context above for informational questions.

Always confirm with the user before taking irreversible actions.
"""


# ─── Private helpers ──────────────────────────────────────────────────────────
# Add private formatting helpers below as your prompt grows.
#
# def _format_orders(orders: list[dict]) -> str:
#     if not orders:
#         return "No recent orders."
#     lines = []
#     for o in orders[:5]:  # show last 5
#         lines.append(f"  - #{o.get('id')} — {o.get('item')} ({o.get('status')})")
#     return "\n".join(lines)
