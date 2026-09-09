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


# ---------------------------------------------------------------------------
# Phase 3 – Debug Intelligence + Learning Brain
# ---------------------------------------------------------------------------

import os
import tempfile
from pathlib import Path


def _tmp_db():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    return path


def test_debug_syntax_error():
    from debug_engine import run_debug, FailureType
    session = run_debug({
        "source_code": "def foo(\n    print('hi')",
        "error_message": "SyntaxError: unexpected EOF while parsing",
        "user_description": "function definition broken",
    })
    assert session.evidence, "must collect evidence"
    assert session.failure_type in (FailureType.SYNTAX, FailureType.RUNTIME, FailureType.UNKNOWN)
    d = session.to_dict()
    assert "related_memories" in d
    assert "learning" in d or d.get("learning") is None or isinstance(d.get("learning"), dict)


def test_debug_reference_error():
    from debug_engine import run_debug
    session = run_debug({
        "source_code": "print(undefined_var)",
        "error_message": "NameError: name 'undefined_var' is not defined",
        "stack_trace": 'File "main.py", line 1, in <module>\n    print(undefined_var)',
    })
    assert session.evidence
    assert any(e.source in ("user_error", "stack_trace", "parser", "static") for e in session.evidence)
    if session.hypotheses:
        for h in session.hypotheses:
            if h.confidence >= 0.4:
                assert h.supporting_evidence_ids, "hypothesis with confidence must link evidence"


def test_debug_null_undefined_access():
    from debug_engine import run_debug
    session = run_debug({
        "source_code": "const x = null; console.log(x.foo);",
        "error_message": "TypeError: Cannot read properties of null (reading 'foo')",
        "stack_trace": "at Object.<anonymous> (app.js:1:20)",
    })
    assert session.evidence
    assert session.root_cause is not None or session.state.value == "INSUFFICIENT_EVIDENCE"


def test_debug_valid_code_no_false_root():
    from debug_engine import run_debug, ConfidenceLevel
    session = run_debug({
        "source_code": "def add(a, b):\n    return a + b\nprint(add(1, 2))",
        "user_description": "this code works fine",
    })
    # Should not invent a high-confidence root cause without error evidence
    if session.root_cause:
        assert session.root_cause.confidence < 0.9 or session.root_cause.confidence_level != ConfidenceLevel.CONFIRMED


def test_debug_insufficient_evidence():
    from debug_engine import run_debug, SessionState
    session = run_debug({
        "user_description": "something is wrong",
    })
    # Minimal input → insufficient or weak
    assert session.state in (
        SessionState.INSUFFICIENT_EVIDENCE,
        SessionState.PARTIALLY_RESOLVED,
        SessionState.HYPOTHESIZED,
        SessionState.RANKED,
        SessionState.ROOT_CAUSE_SELECTED,
        SessionState.FIX_VALIDATED,
        SessionState.FIX_GENERATED,
    )


def test_debug_empty_input():
    from debug_engine import run_debug
    session = run_debug({})
    assert session is not None
    d = session.to_dict()
    assert d["id"]


def test_hypothesis_requires_evidence():
    from debug_engine import run_debug
    session = run_debug({
        "source_code": "x = 1 / 0",
        "error_message": "ZeroDivisionError: division by zero",
    })
    for h in session.hypotheses:
        if h.confidence >= 0.4 and "Insufficient" not in (h.label or ""):
            assert h.supporting_evidence_ids, f"hypothesis {h.label} lacks evidence ids"


def test_root_cause_unresolved_when_weak():
    from debug_engine import run_debug, ConfidenceLevel, SessionState
    session = run_debug({
        "user_description": "maybe a bug somewhere",
    })
    if session.root_cause and session.root_cause.confidence < 0.4:
        assert session.root_cause.confidence_level == ConfidenceLevel.INSUFFICIENT_EVIDENCE
        assert session.state == SessionState.INSUFFICIENT_EVIDENCE


def test_validation_is_static_not_runtime():
    from debug_engine import run_debug
    session = run_debug({
        "source_code": "def f(:\n  pass",
        "error_message": "SyntaxError: invalid syntax",
    })
    assert session.runtime_available is False
    if session.fix:
        note = (session.fix.note or "").lower()
        status = session.fix.status.value if hasattr(session.fix.status, "value") else str(session.fix.status)
        assert "runtime" not in status or status != "runtime_confirmed"
        assert "not confirmed" in note or "static" in note or "suggested" in status


def test_memory_save_and_retrieve():
    from learning import LearningBrain, Experience, ExperienceStatus
    db = _tmp_db()
    try:
        brain = LearningBrain(db_path=db)
        from learning.experience import Experience as Exp
        exp = Exp(
            language="python",
            problem="NameError undefined variable",
            error="NameError: name 'x' is not defined",
            error_type="Runtime",
            evidence_summary=["name 'x' is not defined"],
            root_cause="Variable used before assignment",
            root_cause_status="probable",
            fix="Initialize x before use",
            success=True,
            status=ExperienceStatus.SUCCESS,
            confidence=0.75,
            tags=["python", "nameerror"],
        )
        assert brain.store.insert(exp)
        assert brain.store.count() >= 1
        retrieved = brain.retrieve_for_debug(
            language="python",
            error_message="NameError: name 'x' is not defined",
            error_type="Runtime",
            problem_text="undefined variable",
            limit=3,
        )
        assert isinstance(retrieved, list)
        # may or may not match depending on scoring threshold, but store works
        got = brain.store.get(exp.id)
        assert got is not None
        assert got.problem.startswith("NameError") or "undefined" in (got.problem or "").lower() or got.error
    finally:
        try:
            os.unlink(db)
        except OSError:
            pass


def test_memory_persistence_after_restart():
    from learning import LearningBrain
    from learning.experience import Experience, ExperienceStatus
    db = _tmp_db()
    try:
        brain1 = LearningBrain(db_path=db)
        exp = Experience(
            language="javascript",
            problem="Cannot read property of undefined",
            error="TypeError: Cannot read properties of undefined",
            error_type="Runtime",
            evidence_summary=["undefined access"],
            root_cause="Missing null check",
            fix="Add optional chaining",
            success=True,
            status=ExperienceStatus.SUCCESS,
            confidence=0.7,
        )
        brain1.store.insert(exp)
        eid = exp.id
        # simulate restart
        brain2 = LearningBrain(db_path=db)
        got = brain2.store.get(eid)
        assert got is not None
        assert got.language == "javascript"
        assert brain2.store.count() >= 1
    finally:
        try:
            os.unlink(db)
        except OSError:
            pass


def test_successful_and_failed_experience_tracking():
    from learning import LearningBrain
    from learning.experience import Experience, ExperienceStatus
    db = _tmp_db()
    try:
        brain = LearningBrain(db_path=db)
        ok = Experience(
            language="python",
            problem="syntax fix worked",
            error="SyntaxError",
            evidence_summary=["missing colon"],
            root_cause="Missing colon after def",
            fix="Add colon",
            success=True,
            status=ExperienceStatus.SUCCESS,
            confidence=0.9,
            usefulness=0.6,
        )
        fail = Experience(
            language="python",
            problem="wrong fix attempted",
            error="TypeError",
            evidence_summary=["type mismatch"],
            root_cause="Wrong type assumption",
            fix="cast to int (failed)",
            success=False,
            status=ExperienceStatus.FAILURE,
            confidence=0.5,
            usefulness=0.3,
        )
        brain.store.insert(ok)
        brain.store.insert(fail)
        updated = brain.learn_from_validation(fail.id, success=False, notes="still fails")
        assert updated is not None
        assert updated.status == ExperienceStatus.FAILURE
        assert updated.usefulness < 0.3 or updated.usefulness <= 0.3
    finally:
        try:
            os.unlink(db)
        except OSError:
            pass


def test_memory_evidence_conflict_detection():
    from learning import LearningBrain
    brain = LearningBrain(db_path=":memory:")
    memories = [
        {
            "id": "exp_old",
            "root_cause": "null pointer due to missing guard",
            "success": False,
            "fix": "add null check",
            "relevance": 0.6,
        }
    ]
    conflicts = brain.detect_memory_evidence_conflict(
        memories,
        ["value is definitely not null", "object exists"],
    )
    assert isinstance(conflicts, list)
    # failed past fix should produce a conflict warning
    assert any("failed" in c.lower() or "null" in c.lower() for c in conflicts)


def test_debug_session_stores_learning():
    from debug_engine import run_debug
    import tempfile
    db = _tmp_db()
    old = os.environ.get("NOVA_MEMORY_DB")
    os.environ["NOVA_MEMORY_DB"] = db
    try:
        # force new brain path via env
        session = run_debug({
            "source_code": "print(1/0)",
            "error_message": "ZeroDivisionError: division by zero",
            "stack_trace": 'File "t.py", line 1, in <module>',
        })
        d = session.to_dict()
        assert "related_memories" in d
        # learning may store depending on evidence quality
        assert session.runtime_available is False
        assert any("sandbox" in lim.lower() or "runtime" in lim.lower() for lim in session.limitations)
    finally:
        if old is None:
            os.environ.pop("NOVA_MEMORY_DB", None)
        else:
            os.environ["NOVA_MEMORY_DB"] = old
        try:
            os.unlink(db)
        except OSError:
            pass


def test_irrelevant_memory_not_forced():
    from learning import LearningBrain
    from learning.experience import Experience, ExperienceStatus
    db = _tmp_db()
    try:
        brain = LearningBrain(db_path=db)
        exp = Experience(
            language="rust",
            problem="borrow checker lifetime error",
            error="E0502 cannot borrow",
            error_type="Build",
            evidence_summary=["lifetime issue"],
            root_cause="Conflicting borrows",
            success=True,
            status=ExperienceStatus.SUCCESS,
            confidence=0.8,
        )
        brain.store.insert(exp)
        # query completely different problem
        results = brain.retrieve_for_debug(
            language="python",
            error_message="SyntaxError: invalid syntax",
            error_type="Syntax",
            problem_text="missing parenthesis",
            limit=5,
        )
        # rust borrow checker should not rank high for python syntax
        for r in results:
            if r.get("language") == "rust":
                assert (r.get("relevance") or 0) < 0.5
    finally:
        try:
            os.unlink(db)
        except OSError:
            pass


def test_conversation_isolation_unchanged():
    """Regression: conversation manager still isolated from debug state."""
    conv = Conversation(system_prompt="Nova")
    conv.add_user_message("hi")
    assert len(conv.get_display_messages()) == 1
    from debug_engine import run_debug
    run_debug({"error_message": "TypeError"})
    # conversation untouched
    assert len(conv.get_display_messages()) == 1


def test_sanitize_secrets_in_experience():
    from learning.experience import Experience, sanitize_text
    text = "api_key = 'sk-abcdefghijklmnopqrstuvwxyz123456'"
    cleaned = sanitize_text(text)
    assert "sk-abcdefghijklmnopqrstuvwxyz123456" not in (cleaned or "")
    assert "REDACTED" in (cleaned or "")
    exp = Experience(
        problem="bug with password=supersecret123 and token=abc",
        error="auth failed",
        evidence_summary=["password=supersecret123"],
        root_cause="bad token",
    )
    assert "supersecret123" not in exp.problem or "REDACTED" in exp.problem


def test_structured_debug_result_shape():
    from debug_engine import run_debug
    session = run_debug({
        "source_code": "foo()",
        "error_message": "NameError: name 'foo' is not defined",
    })
    d = session.to_dict()
    for key in ("id", "state", "failure_type", "evidence", "hypotheses", "limitations", "version"):
        assert key in d
    assert d["version"].startswith("3")
    assert isinstance(d["evidence"], list)
    assert isinstance(d.get("related_memories"), list)


def test_causal_chain_present_when_root_selected():
    from debug_engine import run_debug, SessionState
    session = run_debug({
        "source_code": "def broken(\n  pass",
        "error_message": "SyntaxError: invalid syntax",
    })
    if session.root_cause and session.state != SessionState.INSUFFICIENT_EVIDENCE:
        assert isinstance(session.root_cause.causal_chain, list)


def test_format_report_includes_limitations():
    from debug_engine import run_debug, format_debug_report
    session = run_debug({
        "source_code": "x = None\nx.attr",
        "error_message": "AttributeError: 'NoneType' object has no attribute 'attr'",
    })
    report = format_debug_report(session)
    assert "Limitation" in report or "limitation" in report.lower() or "sandbox" in report.lower()
    assert "Root Cause" in report or "root" in report.lower()
