"""Nova Code Intelligence Engine – Phase 1.

Real analysis pipeline: normalize → detect → parse → analyze → evidence.
No fake AST. Capabilities reported honestly.
"""

from code_engine.pipeline import analyze_source, build_llm_context, clear_cache
from code_engine.models import AnalysisResult, content_hash
from code_engine.detection import detect
from code_engine.normalization import normalize
from code_engine.parsers import capability_for, parse

__all__ = [
    "analyze_source",
    "build_llm_context",
    "clear_cache",
    "AnalysisResult",
    "content_hash",
    "detect",
    "normalize",
    "capability_for",
    "parse",
]

__version__ = "1.0.0"
