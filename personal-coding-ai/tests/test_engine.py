"""Tests for AIEngine with a mock provider (no network)."""

from typing import List, Optional
from app.ai.engine import AIEngine
from app.ai.provider import BaseProvider
from app.config import AIConfig


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
    import pytest
    with pytest.raises(ValueError):
        engine.send_message("   ")


def test_new_chat_clears_history():
    config = AIConfig(api_key="fake", model="mock", base_url="http://localhost")
    engine = AIEngine(config=config, provider=MockProvider())
    engine.send_message("Hello")
    assert len(engine.get_history()) == 2
    engine.new_chat()
    assert len(engine.get_history()) == 0
