"""Failure classification based on evidence, not free-form guessing."""

from __future__ import annotations

import re
from typing import List, Optional

from debug_engine.models import FailureType, EvidenceItem, DebugInput


def classify_failure(
    inp: DebugInput,
    evidence: List[EvidenceItem],
) -> FailureType:
    text_parts = [
        inp.error_message or "",
        inp.stack_trace or "",
        inp.user_description or "",
        inp.actual_behavior or "",
    ]
    for e in evidence:
        text_parts.append(e.message)
        text_parts.append(e.kind or "")
        text_parts.append(e.source or "")
    blob = "\n".join(text_parts).lower()

    # Priority order: specific signals first
    if any(e.source == "parser" or e.kind in ("parser_hint", "syntax") for e in evidence):
        if re.search(r"syntax|parse|unexpected token|invalid syntax|unbalanced|never closed", blob):
            return FailureType.SYNTAX

    if re.search(r"syntaxerror|parseerror|unexpected token|invalid syntax|indentationerror", blob):
        return FailureType.SYNTAX

    if re.search(r"modulenotfound|cannot find module|importerror|no module named|unresolved import|dependency", blob):
        return FailureType.DEPENDENCY

    if re.search(r"typeerror|referenceerror|attributeerror|keyerror|indexerror|nullpointer|undefined is not|cannot read propert", blob):
        return FailureType.RUNTIME

    if re.search(r"timeout|econnrefused|fetch failed|cors|http\s*\d{3}|network error|api error", blob):
        return FailureType.API

    if re.search(r"deadlock|race condition|await|promise rejection|unhandledrejection|async", blob):
        return FailureType.ASYNC

    if re.search(r"permission|xss|injection|secret|token leak|eval\(", blob):
        return FailureType.SECURITY

    if re.search(r"slow|performance|memory leak|oom|out of memory", blob):
        return FailureType.PERFORMANCE

    if re.search(r"build failed|compile error|tsc error|webpack|bundler", blob):
        return FailureType.BUILD

    if re.search(r"state|not updated|stale|render|redux|useState", blob):
        return FailureType.STATE

    if re.search(r"assert|expected|should have|logic|wrong result|incorrect", blob):
        return FailureType.LOGIC

    # Evidence categories
    cats = {e.kind for e in evidence}
    if "syntax" in cats or any("syntax" in (e.message or "").lower() for e in evidence):
        return FailureType.SYNTAX
    if any(e.source == "scope" for e in evidence) and re.search(r"undefined|reference", blob):
        return FailureType.RUNTIME

    if inp.error_message or inp.stack_trace:
        return FailureType.RUNTIME

    if evidence:
        return FailureType.LOGIC

    return FailureType.UNKNOWN
