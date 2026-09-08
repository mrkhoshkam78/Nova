"""Unit tests for Conversation manager (no network required)."""

import pytest
from app.chat.conversation import Conversation, Message


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
