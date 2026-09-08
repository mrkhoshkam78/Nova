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
DEFAULT_SYSTEM_PROMPT = """You are Personal Coding AI, a professional and helpful coding assistant.

Your primary goals:
- Help the user with programming tasks of any language or framework.
- Explain concepts clearly and accurately.
- Analyze code snippets the user pastes and point out bugs, edge cases, or improvements.
- Suggest better implementations, design patterns, or refactoring when appropriate.
- Explain error messages and help debug problems.
- Be concise when possible, but thorough when the user asks for depth.
- When you are unsure, say so honestly rather than inventing information.

You do NOT have access to the user's file system, terminal, or the ability to execute code.
You work purely through natural language conversation.

Respond in the same language the user is using (Persian, English, etc.).
Keep a friendly, professional, and collaborative tone.
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
