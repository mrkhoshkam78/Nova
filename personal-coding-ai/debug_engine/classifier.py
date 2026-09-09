"""Failure classification based on evidence – failure-specific, not generic Runtime."""

from __future__ import annotations

import re
from typing import List, Optional, Tuple

from debug_engine.models import FailureType, EvidenceItem, DebugInput


def _blob(inp: DebugInput, evidence: List[EvidenceItem]) -> str:
    text_parts = [
        inp.error_message or "",
        inp.stack_trace or "",
        inp.user_description or "",
        inp.actual_behavior or "",
    ]
    for e in evidence:
        text_parts.append(e.message or "")
        text_parts.append(e.kind or "")
        text_parts.append(e.source or "")
    return "\n".join(text_parts).lower()


def classify_failure(
    inp: DebugInput,
    evidence: List[EvidenceItem],
) -> FailureType:
    """Classify with priority for specific failure kinds over generic Runtime."""
    blob = _blob(inp, evidence)

    # --- Syntax / parse (highest priority when parser evidence present) ---
    if any(e.source == "parser" or e.kind in ("parser_hint", "syntax") for e in evidence):
        if re.search(r"syntax|parse|unexpected token|invalid syntax|unbalanced|never closed", blob):
            return FailureType.SYNTAX
    if re.search(r"syntaxerror|parseerror|unexpected token|invalid syntax|indentationerror", blob):
        return FailureType.SYNTAX

    # --- Reference / NameError / ReferenceError (identifier resolution) ---
    if re.search(
        r"\bnameerror\b|\breferenceerror\b|is not defined|"
        r"name ['\"].+['\"] is not defined|undefined variable|unresolved reference",
        blob,
    ):
        return FailureType.REFERENCE

    # --- Attribute ---
    if re.search(r"\battributeerror\b|has no attribute|object has no attribute", blob):
        return FailureType.ATTRIBUTE

    # --- Type ---
    if re.search(
        r"\btypeerror\b|cannot convert|not callable|unsupported operand|wrong type|expected .+ got",
        blob,
    ):
        return FailureType.TYPE

    # --- Nullability (None/null/undefined access) ---
    if re.search(
        r"nonetype|nullpointer|cannot read propert|undefined is not|is null|is none|"
        r"nonetype|optional\.|\.unwrap\(",
        blob,
    ):
        return FailureType.NULLABILITY

    # --- Index / Key ---
    if re.search(r"\bindexerror\b|\bkeyerror\b|list index out of range|out of range|keyerror", blob):
        return FailureType.INDEX

    # --- ZeroDivision / arithmetic ---
    if re.search(r"zerodivision|division by zero|divmod by zero", blob):
        return FailureType.RUNTIME  # specific hyp generated later

    # --- Dependency / Import ---
    if re.search(
        r"modulenotfound|cannot find module|importerror|no module named|unresolved import|dependency",
        blob,
    ):
        return FailureType.DEPENDENCY

    # --- Configuration ---
    if re.search(r"config|environment variable|missing env|misconfigured|settings\.|dotenv", blob):
        return FailureType.CONFIGURATION

    # --- API / network ---
    if re.search(r"timeout|econnrefused|fetch failed|cors|http\s*\d{3}|network error|api error", blob):
        return FailureType.API

    # --- Async ---
    if re.search(r"deadlock|race condition|await|promise rejection|unhandledrejection|async", blob):
        return FailureType.ASYNC

    # --- Security ---
    if re.search(r"permission|xss|injection|secret|token leak|eval\(", blob):
        return FailureType.SECURITY

    # --- Performance ---
    if re.search(r"slow|performance|memory leak|oom|out of memory", blob):
        return FailureType.PERFORMANCE

    # --- Build ---
    if re.search(r"build failed|compile error|tsc error|webpack|bundler", blob):
        return FailureType.BUILD

    # --- State ---
    if re.search(r"state|not updated|stale|render|redux|usestate", blob):
        return FailureType.STATE

    # --- Logic ---
    if re.search(r"assert|expected|should have|logic|wrong result|incorrect", blob):
        return FailureType.LOGIC

    # Evidence categories
    cats = {e.kind for e in evidence}
    if "syntax" in cats or any("syntax" in (e.message or "").lower() for e in evidence):
        return FailureType.SYNTAX
    if any(e.source == "scope" for e in evidence) and re.search(r"undefined|reference|not defined", blob):
        return FailureType.REFERENCE

    if inp.error_message or inp.stack_trace:
        return FailureType.RUNTIME

    if evidence:
        return FailureType.LOGIC

    return FailureType.UNKNOWN


def classify_with_subtype(
    inp: DebugInput,
    evidence: List[EvidenceItem],
) -> Tuple[FailureType, Optional[str]]:
    """Return (primary FailureType, optional subtype string) for richer reporting."""
    primary = classify_failure(inp, evidence)
    blob = _blob(inp, evidence)
    subtype = None
    if primary == FailureType.REFERENCE:
        if re.search(r"import|from .+ import|require\(", blob):
            subtype = "missing_import"
        elif re.search(r"scope|closure|shadow", blob):
            subtype = "scope"
        else:
            subtype = "undefined_name"
    elif primary == FailureType.RUNTIME and re.search(r"zerodivision|division by zero", blob):
        subtype = "zero_division"
    elif primary == FailureType.NULLABILITY:
        subtype = "null_access"
    return primary, subtype
