"""
Conversation management for Personal Coding AI.
Keeps messages in runtime memory (no persistent storage in V1).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import List, Literal, Optional
from uuid import uuid4


Role = Literal["system", "user", "assistant"]


@dataclass
class Message:
    """A single message in the conversation."""

    role: Role
    content: str
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    id: str = field(default_factory=lambda: str(uuid4()))

    def to_dict(self) -> dict:
        """Serialize message for the LLM provider."""
        return {"role": self.role, "content": self.content}


class Conversation:
    """Manages a single conversation session in memory."""

    def __init__(self, system_prompt: Optional[str] = None) -> None:
        self.id: str = str(uuid4())
        self.messages: List[Message] = []
        self.created_at: datetime = datetime.now(timezone.utc)

        if system_prompt:
            self.add_system_message(system_prompt)

    def add_system_message(self, content: str) -> Message:
        """Add or replace the system message (always first)."""
        # Keep only one system message at the beginning
        self.messages = [m for m in self.messages if m.role != "system"]
        msg = Message(role="system", content=content)
        self.messages.insert(0, msg)
        return msg

    def add_user_message(self, content: str) -> Message:
        """Append a user message."""
        content = content.strip()
        if not content:
            raise ValueError("Message content cannot be empty.")
        msg = Message(role="user", content=content)
        self.messages.append(msg)
        return msg

    def add_assistant_message(self, content: str) -> Message:
        """Append an assistant message."""
        msg = Message(role="assistant", content=content)
        self.messages.append(msg)
        return msg

    def get_messages_for_llm(self) -> List[dict]:
        """Return messages in the format expected by OpenAI-compatible APIs."""
        return [m.to_dict() for m in self.messages]

    def get_display_messages(self) -> List[Message]:
        """Return messages suitable for UI display (exclude system)."""
        return [m for m in self.messages if m.role != "system"]

    def clear(self) -> None:
        """Clear all non-system messages while preserving the system prompt."""
        system_msgs = [m for m in self.messages if m.role == "system"]
        self.messages = system_msgs

    def __len__(self) -> int:
        return len(self.messages)

    def __repr__(self) -> str:
        return f"<Conversation id={self.id[:8]} messages={len(self.messages)}>"
