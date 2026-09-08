"""Root cause hypothesis engine – multiple candidates, evidence-linked, no high confidence without support."""

from __future__ import annotations

import re
from typing import List, Optional

from debug_engine.models import (
    Hypothesis,
    EvidenceItem,
    FailureRegion,
    FailureType,
    ConfidenceLevel,
    DebugInput,
)


def _rel_score(r: str) -> float:
    return {"confirmed": 1.0, "high": 0.8, "possible": 0.5, "weak": 0.25}.get(r, 0.3)


def _level(conf: float) -> ConfidenceLevel:
    if conf >= 0.90:
        return ConfidenceLevel.CONFIRMED
    if conf >= 0.70:
        return ConfidenceLevel.HIGH_PROBABILITY
    if conf >= 0.40:
        return ConfidenceLevel.POSSIBLE
    return ConfidenceLevel.INSUFFICIENT_EVIDENCE


def generate_hypotheses(
    failure_type: FailureType,
    evidence: List[EvidenceItem],
    localization: Optional[FailureRegion],
    inp: DebugInput,
) -> List[Hypothesis]:
    hyps: List[Hypothesis] = []
    strong = [e for e in evidence if e.reliability in ("confirmed", "high")]
    all_ids = [e.id for e in evidence]

    # H1: proximity to reported location (intentionally moderate confidence)
    if localization and (localization.line is not None or localization.file):
        hyps.append(Hypothesis(
            id="",
            label="Symptom proximity",
            cause="Defect near the reported error location (symptom proximity only).",
            supporting_evidence_ids=list(localization.evidence_ids or []),
            related_files=[localization.file] if localization.file else [],
            related_locations=[{"file": localization.file, "line": localization.line}],
            causal_path=[
                "Unknown upstream defect",
                f"Effect visible near {localization.file or '?'}:{localization.line or '?'}",
                "Observed failure symptom",
            ],
            severity="medium",
            confidence=0.42,
            confidence_level=ConfidenceLevel.POSSIBLE,
            scores={"proximity": 0.9, "evidence": 0.35, "stack": 0.55, "contradiction": 0.0},
        ))

    # H2: strongest evidence-driven
    if strong:
        top = strong[0]
        conf = min(0.88, 0.55 + 0.08 * len(strong))
        # Cap if only heuristic
        if all(e.source == "heuristic" for e in strong):
            conf = min(conf, 0.55)
        hyps.append(Hypothesis(
            id="",
            label="Strong evidence cluster",
            cause=top.message,
            supporting_evidence_ids=[e.id for e in strong[:6]],
            related_files=list({e.file for e in strong if e.file}),
            related_locations=[{"file": e.file, "line": e.line} for e in strong[:3] if e.line is not None],
            causal_path=[
                top.message,
                "Leads to invalid state or bad data",
                "Propagates to failure point",
                "Visible symptom",
            ],
            severity="high" if top.reliability == "confirmed" else "medium",
            confidence=conf,
            confidence_level=_level(conf),
            scores={
                "proximity": 0.5 if localization and top.line == localization.line else 0.3,
                "evidence": _rel_score(top.reliability),
                "stack": 0.7 if top.kind in ("application_frame", "runtime_error") else 0.3,
                "contradiction": 0.0,
            },
        ))

    # Type-specific hypotheses
    if failure_type == FailureType.SYNTAX:
        syn = [e for e in evidence if e.source == "parser" or "syntax" in (e.message or "").lower()]
        conf = 0.92 if syn else 0.7
        hyps.append(Hypothesis(
            id="",
            label="Syntax / parse failure",
            cause="Code does not parse; syntax must be fixed before logic analysis.",
            supporting_evidence_ids=[e.id for e in syn] or all_ids[:3],
            related_files=list({e.file for e in syn if e.file}),
            related_locations=[{"file": e.file, "line": e.line} for e in syn if e.line is not None][:3],
            causal_path=["Invalid syntax", "Parser failure", "Program cannot start / analyze further"],
            severity="high",
            confidence=conf,
            confidence_level=_level(conf),
            scores={"proximity": 0.85, "evidence": 0.9, "stack": 0.2, "contradiction": 0.0},
        ))

    if failure_type == FailureType.DEPENDENCY:
        dep = [e for e in evidence if re.search(r"import|module|require|dependency", e.message or "", re.I)]
        hyps.append(Hypothesis(
            id="",
            label="Missing or unresolved dependency",
            cause="Import/module path unavailable or misconfigured in the runtime environment.",
            supporting_evidence_ids=[e.id for e in dep] or all_ids[:2],
            related_files=list({e.file for e in dep if e.file}),
            causal_path=["Unresolved import", "Module load failure", "Runtime/Import error"],
            severity="high",
            confidence=0.75 if dep else 0.5,
            confidence_level=_level(0.75 if dep else 0.5),
            scores={"proximity": 0.3, "evidence": 0.75, "stack": 0.4, "contradiction": 0.0},
        ))

    if failure_type == FailureType.RUNTIME or any(
        re.search(r"null|undefined|none|attributeerror|typeerror|indexerror", e.message or "", re.I)
        for e in evidence
    ):
        nullish = [e for e in evidence if re.search(r"null|undefined|none|attributeerror|typeerror|index", e.message or "", re.I)]
        hyps.append(Hypothesis(
            id="",
            label="Missing null/empty guard",
            cause="Value may be null/undefined/None or empty before use; guard missing on the data path.",
            supporting_evidence_ids=[e.id for e in nullish] or ([strong[0].id] if strong else []),
            related_files=list({e.file for e in nullish if e.file}),
            related_locations=[{"file": localization.file, "line": localization.line}] if localization else [],
            causal_path=[
                "Missing validation or default at boundary",
                "Null/empty value propagates",
                "Unsafe property/index access",
                "Runtime error",
            ],
            severity="high",
            confidence=0.68 if nullish else 0.5,
            confidence_level=_level(0.68 if nullish else 0.5),
            scores={"proximity": 0.55, "evidence": 0.65, "stack": 0.6, "data_flow": 0.8, "contradiction": 0.0},
        ))

    if failure_type == FailureType.LOGIC and not hyps:
        hyps.append(Hypothesis(
            id="",
            label="Logic defect",
            cause="Behavior diverges from expected; possible incorrect condition or data transformation.",
            supporting_evidence_ids=all_ids[:4],
            causal_path=["Incorrect logic or assumption", "Wrong intermediate state", "Unexpected result"],
            severity="medium",
            confidence=0.45,
            confidence_level=ConfidenceLevel.POSSIBLE,
            scores={"proximity": 0.3, "evidence": 0.4, "stack": 0.2, "contradiction": 0.0},
        ))

    # Insufficient
    if not hyps:
        hyps.append(Hypothesis(
            id="",
            label="Insufficient evidence",
            cause="Not enough structured evidence to rank a concrete root cause.",
            supporting_evidence_ids=[],
            causal_path=["Insufficient evidence", "Symptom observed", "Root cause not identified"],
            severity="low",
            confidence=0.15,
            confidence_level=ConfidenceLevel.INSUFFICIENT_EVIDENCE,
            scores={"proximity": 0, "evidence": 0.1, "stack": 0, "contradiction": 0},
        ))

    # Apply weighted ranking scores → confidence
    for h in hyps:
        s = h.scores or {}
        weighted = (
            (s.get("proximity") or 0) * 0.12
            + (s.get("evidence") or 0) * 0.38
            + (s.get("stack") or 0) * 0.18
            + (s.get("data_flow") or 0) * 0.12
            + (s.get("control_flow") or 0) * 0.08
            + (1.0 - (s.get("contradiction") or 0)) * 0.12
        )
        # Prefer evidence over pure proximity
        h.confidence = round(min(0.95, max(h.confidence, weighted)), 3)
        h.confidence_level = _level(h.confidence)
        # Never CONFIRMED on heuristic-only without parser/runtime
        if h.confidence_level == ConfidenceLevel.CONFIRMED:
            srcs = set()
            for eid in h.supporting_evidence_ids:
                for e in evidence:
                    if e.id == eid:
                        srcs.add(e.source)
            if srcs and srcs <= {"heuristic"}:
                h.confidence = min(h.confidence, 0.65)
                h.confidence_level = _level(h.confidence)

    hyps.sort(key=lambda x: x.confidence, reverse=True)
    return hyps
