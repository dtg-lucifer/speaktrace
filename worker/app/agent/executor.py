"""
Agent executor — the core LangChain reasoning loop.

How it works
------------
1. Receives the user message + system prompt (with full context injected)
2. LLM decides: respond directly OR call a tool
3. If tool called → executes it → feeds result back to LLM
4. Repeats until LLM gives a final answer or max_iterations is hit
5. If max_iterations hit, early_stopping_method="generate" forces a final answer

Each request gets a fresh AgentExecutor — no shared state between requests.

Iteration limit
---------------
AGENT_MAX_ITERATIONS (default: 5) prevents infinite tool-call loops.
Increase it if your agent needs to chain many tools in a single turn.
Decrease it to reduce latency and cost for simpler use cases.

Streaming
---------
Use build_agent_executor() + astream_events() for token-by-token streaming.
See app/api/routes/stream.py for the SSE streaming endpoint.
"""

from langchain.agents import create_openai_tools_agent, AgentExecutor
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import BaseMessage

from app.core.config import settings
from app.core.logger import logger
from app.core.llm_factory import get_chat_llm
from app.agent.tools import build_tools
from app.services.backend_client import BackendClient


def build_agent_executor(
    client: BackendClient,
    system_prompt: str,
    streaming: bool = False,
) -> AgentExecutor:
    """
    Builds a fresh AgentExecutor for a single request.

    Args:
        client:        BackendClient bound to the current user's token
        system_prompt: The fully assembled system prompt (with context injected)
        streaming:     If True, enables token-by-token streaming via astream_events
    """
    llm = get_chat_llm(temperature=0.3, streaming=streaming)
    tools = build_tools(client)

    # Prompt structure:
    #   [system]           ← your system prompt with injected context
    #   [chat_history]     ← rolling conversation history from Redis
    #   [human]            ← current user message
    #   [agent_scratchpad] ← LangChain internal tool call reasoning
    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        MessagesPlaceholder(variable_name="chat_history"),
        ("human", "{input}"),
        MessagesPlaceholder(variable_name="agent_scratchpad"),
    ])

    agent = create_openai_tools_agent(llm=llm, tools=tools, prompt=prompt)

    return AgentExecutor(
        agent=agent,
        tools=tools,
        verbose=settings.is_development,       # prints tool calls in dev
        max_iterations=settings.agent_max_iterations,
        early_stopping_method="generate",      # forces final answer if limit hit
        handle_parsing_errors=True,            # recovers from malformed tool calls
        return_intermediate_steps=False,       # set True to debug tool call chain
    )


async def run_agent(
    client: BackendClient,
    system_prompt: str,
    user_message: str,
    chat_history: list[BaseMessage],
) -> str:
    """
    Runs the agent for a single user message.
    Returns the agent's final text response.

    For streaming responses, use build_agent_executor(streaming=True)
    and call executor.astream_events() directly.
    """
    executor = build_agent_executor(client, system_prompt)

    logger.debug(
        "Agent run started",
        message_preview=user_message[:100],
        history_length=len(chat_history),
    )

    try:
        result = await executor.ainvoke({
            "input": user_message,
            "chat_history": chat_history,
        })

        output = result.get("output", "I'm sorry, I couldn't generate a response.")
        logger.debug("Agent run completed", output_preview=output[:100])
        return output

    except Exception as e:
        logger.error("Agent run failed", error=str(e))
        raise
