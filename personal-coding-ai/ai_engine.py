"""
AI Engine – the core orchestration layer.
Depends only on the abstract Provider, never on a concrete implementation.
"""

from __future__ import annotations

from typing import Optional

from ai_provider import BaseProvider, ProviderError, create_provider
from conversation import Conversation
from config import AIConfig, get_config


# Default system prompt that makes the AI a professional coding assistant.
DEFAULT_SYSTEM_PROMPT = """You are Nova, a professional AI Coding Assistant.

Identity:
- Your name is Nova.
- You help developers with code, debugging, architecture, and best practices.
- You are precise, practical, and honest.

Rules:
1. Preserve conversation context. When the user says "fix this", "optimize it", or "convert the same code", refer to the most recent relevant code or topic in this conversation.
2. Give specialized answers about the language/framework the user is discussing.
3. If the request is ambiguous, ask a short clarifying question before guessing.
4. When analyzing bugs: explain the root cause, then provide a concrete fix.
5. Do not rewrite the user's code unless they asked for a change.
6. Never claim you executed code, accessed files, or ran tests unless that actually happened in this session.
7. Prefer correct, minimal examples over long generic essays.
8. Put code in fenced markdown blocks with a language tag.
9. Reply in the same language the user is using (Persian, English, ...).
10. If you are unsure, say so clearly.

You do not have filesystem, terminal, or network tools in this version unless explicitly provided in the message context.
"""


class AIEngine:
    """High-level engine that ties Conversation and Provider together."""

    def __init__(
        self,
        config: Optional[AIConfig] = None,
        provider: Optional[BaseProvider] = None,
        system_prompt: Optional[str] = None,
    ) -> None:
        self.config = config or get_config()
        self.provider = provider or create_provider(self.config)
        self.system_prompt = system_prompt or DEFAULT_SYSTEM_PROMPT
        self.conversation = Conversation(system_prompt=self.system_prompt)

    def new_chat(self) -> None:
        """Start a fresh conversation while keeping the same system prompt."""
        self.conversation = Conversation(system_prompt=self.system_prompt)

    def send_message(self, user_input: str) -> str:
        """Process a user message and return the assistant's reply.

        The conversation history is automatically maintained.
        """
        user_input = (user_input or "").strip()
        if not user_input:
            raise ValueError("Cannot send an empty message.")

        # Add user message to history
        self.conversation.add_user_message(user_input)

        try:
            messages = self.conversation.get_messages_for_llm()
            reply = self.provider.chat(messages)
        except ProviderError:
            # Remove the last user message so the conversation stays consistent
            if self.conversation.messages and self.conversation.messages[-1].role == "user":
                self.conversation.messages.pop()
            raise

        # Persist the successful assistant reply
        self.conversation.add_assistant_message(reply)
        return reply

    def get_history(self):
        """Return displayable messages (without system prompt)."""
        return self.conversation.get_display_messages()
