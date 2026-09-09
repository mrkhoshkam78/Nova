"""Relevance retrieval for past experiences."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

from learning.experience import Experience
from learning.memory import MemoryStore


def _tokenize(text: str) -> set:
    if not text:
        return set()
    return set(re.findall(r"[a-zA-Z_][\w.]{1,}|[\u0600-\u06FF]{2,}", text.lower()))


def _jaccard(a: set, b: set) -> float:
    if not a and not b:
        return 0.0
    inter = len(a & b)
    union = len(a | b)
    return inter / union if union else 0.0


def compute_relevance(
    exp: Experience,
    *,
    language: Optional[str] = None,
    error_message: Optional[str] = None,
    error_type: Optional[str] = None,
    problem_text: Optional[str] = None,
    evidence_messages: Optional[List[str]] = None,
    code_hints: Optional[List[str]] = None,
) -> Dict[str, float]:
    """Return component scores and overall relevance in [0, 1]."""
    scores: Dict[str, float] = {}

    # Language match
    if language and exp.language:
        scores["language"] = 1.0 if language.lower() == exp.language.lower() else 0.15
    elif language or exp.language:
        scores["language"] = 0.3
    else:
        scores["language"] = 0.5

    # Error type match
    if error_type and exp.error_type:
        scores["error_type"] = 1.0 if error_type.lower() == exp.error_type.lower() else 0.2
    else:
        scores["error_type"] = 0.4

    # Text similarity (problem + error)
    q_tokens = _tokenize(" ".join(filter(None, [problem_text, error_message])))
    e_tokens = _tokenize(" ".join(filter(None, [exp.problem, exp.error, exp.root_cause or ""])))
    scores["text"] = _jaccard(q_tokens, e_tokens)

    # Evidence pattern overlap
    ev_tokens = _tokenize(" ".join(evidence_messages or []))
    exp_ev = _tokenize(" ".join(exp.evidence_summary or []))
    scores["evidence"] = _jaccard(ev_tokens, exp_ev) if (ev_tokens or exp_ev) else 0.3

    # Structure hints
    if code_hints and exp.code_structure_hints:
        scores["structure"] = _jaccard(set(h.lower() for h in code_hints), set(h.lower() for h in exp.code_structure_hints))
    else:
        scores["structure"] = 0.25

    # Historical success bias (small – memory is prior, not truth)
    if exp.success and exp.status.value == "success":
        scores["history"] = 0.15
    elif exp.status.value == "failure":
        scores["history"] = -0.1  # still usable as "what failed"
    else:
        scores["history"] = 0.0

    # Usefulness prior
    scores["usefulness"] = (exp.usefulness - 0.5) * 0.2

    # Weighted overall
    overall = (
        0.20 * scores["language"]
        + 0.22 * scores["error_type"]
        + 0.28 * scores["text"]
        + 0.15 * scores["evidence"]
        + 0.08 * scores["structure"]
        + 0.05 * max(0.0, scores["history"] + 0.5)  # shift negative history
        + scores["usefulness"]
    )
    scores["overall"] = max(0.0, min(1.0, overall))
    return scores


def retrieve_relevant(
    store: MemoryStore,
    *,
    language: Optional[str] = None,
    error_message: Optional[str] = None,
    error_type: Optional[str] = None,
    problem_text: Optional[str] = None,
    evidence_messages: Optional[List[str]] = None,
    code_hints: Optional[List[str]] = None,
    limit: int = 8,
    min_relevance: float = 0.28,
) -> List[Tuple[Experience, Dict[str, float]]]:
    """Fetch candidates then rank by relevance. Irrelevant memories stay out."""
    # Broad fetch then score
    candidates = store.search(
        language=language,
        error_type=error_type,
        limit=max(40, limit * 5),
        min_usefulness=0.05,
    )
    # Also pull some by text if needed
    if problem_text or error_message:
        extra = store.search(
            query_text=(problem_text or "")[:80] or (error_message or "")[:80],
            limit=20,
        )
        seen = {c.id for c in candidates}
        for e in extra:
            if e.id not in seen:
                candidates.append(e)
                seen.add(e.id)

    ranked: List[Tuple[Experience, Dict[str, float]]] = []
    for exp in candidates:
        scores = compute_relevance(
            exp,
            language=language,
            error_message=error_message,
            error_type=error_type,
            problem_text=problem_text,
            evidence_messages=evidence_messages,
            code_hints=code_hints,
        )
        if scores["overall"] >= min_relevance:
            ranked.append((exp, scores))
            store.record_retrieval(exp.id)

    ranked.sort(key=lambda x: (x[1]["overall"], x[0].usefulness), reverse=True)
    return ranked[:limit]
