"""Nova Debugging Intelligence Engine – Phase 3 (V3.0).

Evidence-first root cause analysis + Learning Brain integration.
Independent of Chat/UI state.
Does not claim runtime confirmation without a real sandbox.
Memory is prior experience only; current evidence overrides conflicting memory.
"""

from debug_engine.pipeline import run_debug, build_llm_debug_context, format_debug_report
from debug_engine.models import DebugSession, FailureType, ConfidenceLevel, SessionState

__all__ = [
    "run_debug",
    "build_llm_debug_context",
    "format_debug_report",
    "DebugSession",
    "FailureType",
    "ConfidenceLevel",
    "SessionState",
]

__version__ = "3.0.0"
