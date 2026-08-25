"""
LangChain tools — each tool maps to one or more backend API calls.

Design principles
-----------------
✅ Tools are business-level actions, not low-level HTTP calls
   BAD:  async def post_to_orders_endpoint(payload: dict)
   GOOD: async def create_order(item_name: str, quantity: int)

✅ The tool docstring IS the tool description the LLM reads.
   Make it specific about WHEN to use the tool and what it does.
   Vague docstrings → the LLM calls the wrong tool or misses it entirely.

✅ Every tool validates inputs before calling the backend.
   Return a human-readable error string on failure — never raise.
   The LLM feeds the return value back into its reasoning.

✅ Write tools should confirm intent in their docstring.
   "Always confirm with the user before calling this."

✅ The BackendClient is injected at runtime — no shared state.
   Each request gets its own client bound to the user's token.

How to add a tool
-----------------
1. Add a method to BackendClient for the backend endpoint you need.
2. Define an async function decorated with @tool inside build_tools().
3. Write a clear docstring explaining when the LLM should call it.
4. Add it to the return list at the bottom of build_tools().

Example tool:
    @tool
    async def get_order_status(order_id: str) -> str:
        \"\"\"
        Get the current status of a specific order.
        Use this when the user asks about their order, says 'where is my order',
        or asks 'what happened to order #X'.

        Args:
            order_id: The order ID to look up (e.g. 'ORD-12345')
        \"\"\"
        try:
            result = await client.get_order(order_id)
            return json.dumps(result.get("data", result), indent=2)
        except Exception as e:
            return f"Could not fetch order status: {e}"
"""

import json
from langchain_core.tools import tool
from app.services.backend_client import BackendClient
from app.core.logger import logger


def build_tools(client: BackendClient) -> list:
    """
    Factory that returns a list of LangChain tools bound to a specific
    BackendClient instance (i.e. a specific user's session).

    Add your domain-specific tools inside this function.
    """

    # ─── Example read tool ────────────────────────────────────────────────────

    @tool
    async def get_current_user() -> str:
        """
        Get the current authenticated user's profile information.
        Use this when the user asks 'who am I', 'what's my account',
        or when you need to know the user's name or ID.
        """
        try:
            result = await client.get_me()
            return json.dumps(result.get("data", result), indent=2)
        except Exception as e:
            return f"Could not fetch user profile: {e}"

    # ─── TODO: Add your domain-specific tools below ───────────────────────────
    #
    # @tool
    # async def get_order_history() -> str:
    #     """
    #     Get the user's recent order history.
    #     Use this when the user asks 'show my orders', 'what have I bought',
    #     or 'my recent purchases'.
    #     """
    #     try:
    #         result = await client.get_user_orders()
    #         return json.dumps(result.get("data", result), indent=2)
    #     except Exception as e:
    #         return f"Could not fetch orders: {e}"
    #
    # @tool
    # async def create_order(item_name: str, quantity: int = 1) -> str:
    #     """
    #     Place a new order for the user.
    #     Use this when the user says 'order X', 'buy X', or 'I want X'.
    #     Always confirm the item and quantity with the user before calling this.
    #
    #     Args:
    #         item_name: Name of the item to order
    #         quantity:  Number of units (default 1)
    #     """
    #     if quantity < 1 or quantity > 100:
    #         return "Invalid quantity. Please provide a number between 1 and 100."
    #     try:
    #         result = await client.create_order({"item": item_name, "quantity": quantity})
    #         logger.info("Order created via agent", item=item_name, qty=quantity)
    #         return f"✅ Order placed: {quantity}x {item_name}."
    #     except Exception as e:
    #         return f"Could not place order: {e}"

    return [
        get_current_user,
        # Add your tools here
    ]
