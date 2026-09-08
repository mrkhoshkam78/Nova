"""Nova Debugging Intelligence Engine – Phase 2 (V2.03).

Evidence-first root cause analysis. Independent of Chat/UI state.
Does not claim runtime confirmation without a real sandbox.
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

__version__ = "2.03"
