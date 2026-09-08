"""Unit tests for Personal Coding AI (no network required)."""

from typing import List, Optional

import pytest

from conversation import Conversation
from ai_engine import AIEngine
from ai_provider import BaseProvider
from config import AIConfig


# ---------------------------------------------------------------------------
# Conversation tests
# ---------------------------------------------------------------------------

def test_add_messages():
    conv = Conversation(system_prompt="You are a helpful assistant.")
    assert len(conv.messages) == 1
    assert conv.messages[0].role == "system"

    conv.add_user_message("Hello")
    assert len(conv.messages) == 2
    assert conv.messages[1].role == "user"
    assert conv.messages[1].content == "Hello"

    conv.add_assistant_message("Hi there!")
    assert len(conv.messages) == 3
    assert conv.messages[2].role == "assistant"


def test_empty_user_message_raises():
    conv = Conversation()
    with pytest.raises(ValueError):
        conv.add_user_message("   ")


def test_get_messages_for_llm():
    conv = Conversation(system_prompt="System")
    conv.add_user_message("User msg")
    conv.add_assistant_message("AI msg")

    payload = conv.get_messages_for_llm()
    assert payload == [
        {"role": "system", "content": "System"},
        {"role": "user", "content": "User msg"},
        {"role": "assistant", "content": "AI msg"},
    ]


def test_display_messages_exclude_system():
    conv = Conversation(system_prompt="System")
    conv.add_user_message("Hi")
    display = conv.get_display_messages()
    assert len(display) == 1
    assert display[0].role == "user"


def test_clear_preserves_system():
    conv = Conversation(system_prompt="Keep me")
    conv.add_user_message("temp")
    conv.clear()
    assert len(conv.messages) == 1
    assert conv.messages[0].role == "system"
    assert conv.messages[0].content == "Keep me"


def test_new_system_message_replaces_old():
    conv = Conversation(system_prompt="Old")
    conv.add_system_message("New")
    assert len([m for m in conv.messages if m.role == "system"]) == 1
    assert conv.messages[0].content == "New"


# ---------------------------------------------------------------------------
# AIEngine tests (with mock provider)
# ---------------------------------------------------------------------------

class MockProvider(BaseProvider):
    def __init__(self, reply: str = "Mock reply"):
        self.reply = reply
        self.last_messages: List[dict] = []

    def chat(
        self,
        messages: List[dict],
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> str:
        self.last_messages = messages
        return self.reply


def test_send_message_and_context():
    config = AIConfig(
        api_key="fake",
        model="mock",
        base_url="http://localhost",
    )
    provider = MockProvider(reply="This is a mock analysis of your code.")
    engine = AIEngine(config=config, provider=provider)

    reply1 = engine.send_message("Explain this code: def foo(): pass")
    assert reply1 == "This is a mock analysis of your code."
    assert len(engine.get_history()) == 2  # user + assistant

    # Second message should include previous context
    provider.reply = "Continuing from previous context."
    reply2 = engine.send_message("Can you also suggest improvements?")
    assert reply2 == "Continuing from previous context."
    assert len(engine.get_history()) == 4

    # Provider received full history (system + 2 user + 1 assistant)
    roles = [m["role"] for m in provider.last_messages]
    assert roles[0] == "system"
    assert "user" in roles
    assert "assistant" in roles


def test_empty_message_raises():
    config = AIConfig(api_key="fake", model="mock", base_url="http://localhost")
    engine = AIEngine(config=config, provider=MockProvider())
    with pytest.raises(ValueError):
        engine.send_message("   ")


def test_new_chat_clears_history():
    config = AIConfig(api_key="fake", model="mock", base_url="http://localhost")
    engine = AIEngine(config=config, provider=MockProvider())
    engine.send_message("Hello")
    assert len(engine.get_history()) == 2
    engine.new_chat()
    assert len(engine.get_history()) == 0
