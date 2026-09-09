"""Root cause hypothesis engine – failure-specific, evidence-linked, no generic defaults."""

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


def _ids_for(evidence: List[EvidenceItem], pred) -> List[str]:
    return [e.id for e in evidence if pred(e)]


def generate_hypotheses(
    failure_type: FailureType,
    evidence: List[EvidenceItem],
    localization: Optional[FailureRegion],
    inp: DebugInput,
) -> List[Hypothesis]:
    hyps: List[Hypothesis] = []
    strong = [e for e in evidence if e.reliability in ("confirmed", "high")]
    all_ids = [e.id for e in evidence]
    blob = " ".join(
        [
            inp.error_message or "",
            inp.stack_trace or "",
            inp.user_description or "",
        ]
        + [e.message or "" for e in evidence]
    ).lower()

    # ------------------------------------------------------------------ SYNTAX
    if failure_type == FailureType.SYNTAX:
        syn = [e for e in evidence if e.source == "parser" or "syntax" in (e.message or "").lower()]
        conf = 0.92 if syn else 0.75
        hyps.append(Hypothesis(
            id="",
            label="Syntax / parse failure",
            cause="Parse failure: code does not conform to language grammar; fix syntax before further analysis.",
            supporting_evidence_ids=[e.id for e in syn] or all_ids[:3],
            related_files=list({e.file for e in syn if e.file}),
            related_locations=[{"file": e.file, "line": e.line} for e in syn if e.line is not None][:3],
            causal_path=["Invalid syntax", "Parser failure", "Program cannot start / analyze further"],
            severity="high",
            confidence=conf,
            confidence_level=_level(conf),
            scores={"proximity": 0.85, "evidence": 0.9, "stack": 0.2, "contradiction": 0.0},
        ))
        return _finalize(hyps, evidence)

    # ------------------------------------------------------------------ REFERENCE (NameError / ReferenceError)
    if failure_type == FailureType.REFERENCE:
        ref_ev = [e for e in evidence if re.search(
            r"nameerror|referenceerror|is not defined|not defined|undefined",
            e.message or "", re.I,
        )] or strong or evidence[:2]
        # Extract identifier if possible
        ident = None
        m = re.search(r"name ['\"](\w+)['\"] is not defined|(\w+) is not defined", blob)
        if m:
            ident = m.group(1) or m.group(2)

        hyps.append(Hypothesis(
            id="",
            label="Undefined identifier",
            cause=(
                f"Identifier resolution failed: name '{ident}' is not bound in the current scope."
                if ident else
                "Identifier resolution failed: referenced name is not defined / not bound."
            ),
            supporting_evidence_ids=[e.id for e in ref_ev],
            related_files=list({e.file for e in ref_ev if e.file}),
            related_locations=[{"file": localization.file, "line": localization.line}] if localization else [],
            causal_path=[
                "NameError / ReferenceError",
                "Identifier resolution",
                "Symbol/Binding not found",
                "Undefined name",
            ],
            severity="high",
            confidence=0.88 if ref_ev else 0.65,
            confidence_level=_level(0.88 if ref_ev else 0.65),
            scores={"proximity": 0.6, "evidence": 0.9, "stack": 0.7, "contradiction": 0.0},
        ))
        hyps.append(Hypothesis(
            id="",
            label="Missing declaration or import",
            cause="Name may be missing a declaration, assignment, or import/export in this module.",
            supporting_evidence_ids=[e.id for e in ref_ev],
            causal_path=[
                "Missing declaration / import",
                "Name not introduced in scope",
                "Unresolved reference at use site",
            ],
            severity="medium",
            confidence=0.62,
            confidence_level=ConfidenceLevel.POSSIBLE,
            scores={"proximity": 0.4, "evidence": 0.7, "stack": 0.5, "contradiction": 0.0},
        ))
        if re.search(r"scope|closure|shadow|global|nonlocal", blob):
            hyps.append(Hypothesis(
                id="",
                label="Wrong scope / shadowed variable",
                cause="Name exists in another scope or is shadowed; current binding is not visible.",
                supporting_evidence_ids=[e.id for e in ref_ev],
                causal_path=["Scope mismatch", "Binding not visible", "Unresolved at use site"],
                severity="medium",
                confidence=0.55,
                confidence_level=ConfidenceLevel.POSSIBLE,
                scores={"proximity": 0.3, "evidence": 0.55, "stack": 0.4, "contradiction": 0.0},
            ))
        return _finalize(hyps, evidence)

    # ------------------------------------------------------------------ ATTRIBUTE
    if failure_type == FailureType.ATTRIBUTE:
        att = [e for e in evidence if re.search(r"attribute|has no", e.message or "", re.I)] or strong
        hyps.append(Hypothesis(
            id="",
            label="Missing or wrong attribute",
            cause="Object does not have the requested attribute; wrong type, wrong instance, or typo in attribute name.",
            supporting_evidence_ids=[e.id for e in att] or all_ids[:2],
            related_locations=[{"file": localization.file, "line": localization.line}] if localization else [],
            causal_path=["Attribute access", "Attribute not present on object", "AttributeError"],
            severity="high",
            confidence=0.82,
            confidence_level=_level(0.82),
            scores={"proximity": 0.7, "evidence": 0.85, "stack": 0.6, "contradiction": 0.0},
        ))
        return _finalize(hyps, evidence)

    # ------------------------------------------------------------------ TYPE
    if failure_type == FailureType.TYPE:
        typ = [e for e in evidence if re.search(r"typeerror|type|operand|callable", e.message or "", re.I)] or strong
        hyps.append(Hypothesis(
            id="",
            label="Type mismatch",
            cause="Operand or argument has an incompatible type for the operation or call.",
            supporting_evidence_ids=[e.id for e in typ] or all_ids[:2],
            causal_path=["TypeError", "Incompatible type at operation/call", "Runtime type failure"],
            severity="high",
            confidence=0.8,
            confidence_level=_level(0.8),
            scores={"proximity": 0.6, "evidence": 0.85, "stack": 0.65, "contradiction": 0.0},
        ))
        return _finalize(hyps, evidence)

    # ------------------------------------------------------------------ NULLABILITY
    if failure_type == FailureType.NULLABILITY:
        nullish = [e for e in evidence if re.search(
            r"null|undefined|none|nonetype|cannot read", e.message or "", re.I
        )] or strong
        hyps.append(Hypothesis(
            id="",
            label="Null / None / undefined access",
            cause="Value is null/None/undefined at access site; missing guard or default on the data path.",
            supporting_evidence_ids=[e.id for e in nullish] or all_ids[:2],
            related_locations=[{"file": localization.file, "line": localization.line}] if localization else [],
            causal_path=[
                "Missing validation or default at boundary",
                "Null/None/undefined value propagates",
                "Unsafe property/index/attribute access",
                "Runtime error",
            ],
            severity="high",
            confidence=0.8 if nullish else 0.55,
            confidence_level=_level(0.8 if nullish else 0.55),
            scores={"proximity": 0.55, "evidence": 0.8, "stack": 0.6, "data_flow": 0.85, "contradiction": 0.0},
        ))
        return _finalize(hyps, evidence)

    # ------------------------------------------------------------------ INDEX
    if failure_type == FailureType.INDEX:
        idx = [e for e in evidence if re.search(r"index|keyerror|out of range", e.message or "", re.I)] or strong
        hyps.append(Hypothesis(
            id="",
            label="Index / key out of range",
            cause="Index or key does not exist in the container; bounds or key presence not checked.",
            supporting_evidence_ids=[e.id for e in idx] or all_ids[:2],
            causal_path=["Index/Key access", "Out of range or missing key", "IndexError/KeyError"],
            severity="medium",
            confidence=0.78,
            confidence_level=_level(0.78),
            scores={"proximity": 0.6, "evidence": 0.8, "stack": 0.5, "contradiction": 0.0},
        ))
        return _finalize(hyps, evidence)

    # ------------------------------------------------------------------ ZeroDivision (Runtime subtype)
    if failure_type == FailureType.RUNTIME and re.search(r"zerodivision|division by zero", blob):
        div_ev = [e for e in evidence if re.search(r"zero|division", e.message or "", re.I)] or strong or evidence[:1]
        hyps.append(Hypothesis(
            id="",
            label="Division by zero",
            cause="Denominator evaluates to zero at a division (or modulo) operation.",
            supporting_evidence_ids=[e.id for e in div_ev],
            related_locations=[{"file": localization.file, "line": localization.line}] if localization else [],
            causal_path=[
                "Division / modulo operation",
                "Denominator",
                "Possible zero value",
                "ZeroDivisionError",
            ],
            severity="high",
            confidence=0.9,
            confidence_level=_level(0.9),
            scores={"proximity": 0.7, "evidence": 0.95, "stack": 0.7, "contradiction": 0.0},
        ))
        return _finalize(hyps, evidence)

    # ------------------------------------------------------------------ DEPENDENCY
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
        return _finalize(hyps, evidence)

    # ------------------------------------------------------------------ LOGIC
    if failure_type == FailureType.LOGIC:
        # Only weak user reports → insufficient, not a real logic diagnosis
        strong = [e for e in evidence if e.reliability in ("confirmed", "high")
                  or e.source in ("parser", "static", "stack_trace", "user_error", "runtime")]
        only_weak_user = (
            evidence
            and not strong
            and all(e.source in ("user", "heuristic") or e.reliability in ("possible", "weak")
                    for e in evidence)
        )
        if only_weak_user or not evidence:
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
        else:
            hyps.append(Hypothesis(
                id="",
                label="Logic defect",
                cause="Behavior diverges from expected; possible incorrect condition or data transformation.",
                supporting_evidence_ids=all_ids[:4] if all_ids else [],
                causal_path=["Incorrect logic or assumption", "Wrong intermediate state", "Unexpected result"],
                severity="medium",
                confidence=0.45 if strong else 0.30,
                confidence_level=_level(0.45 if strong else 0.30),
                scores={"proximity": 0.3, "evidence": 0.4 if strong else 0.2, "stack": 0.2, "contradiction": 0.0},
            ))
        return _finalize(hyps, evidence)

    # ------------------------------------------------------------------ Generic RUNTIME (only when nothing specific matched)
    if failure_type == FailureType.RUNTIME:
        # Prefer evidence message over null template
        if strong:
            top = strong[0]
            conf = min(0.85, 0.55 + 0.08 * len(strong))
            hyps.append(Hypothesis(
                id="",
                label="Evidence-driven runtime failure",
                cause=top.message,
                supporting_evidence_ids=[e.id for e in strong[:6]],
                related_files=list({e.file for e in strong if e.file}),
                related_locations=[{"file": e.file, "line": e.line} for e in strong[:3] if e.line is not None],
                causal_path=[top.message, "Leads to invalid state", "Visible runtime failure"],
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
        else:
            hyps.append(Hypothesis(
                id="",
                label="Runtime failure (generic)",
                cause=inp.error_message or "Runtime failure observed; insufficient detail for specific root cause.",
                supporting_evidence_ids=all_ids[:3],
                causal_path=["Runtime error", "Cause not further specialized"],
                severity="medium",
                confidence=0.4,
                confidence_level=ConfidenceLevel.POSSIBLE,
                scores={"proximity": 0.3, "evidence": 0.4, "stack": 0.5, "contradiction": 0.0},
            ))
        return _finalize(hyps, evidence)

    # ------------------------------------------------------------------ Fallback
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

    return _finalize(hyps, evidence)


def _finalize(hyps: List[Hypothesis], evidence: List[EvidenceItem]) -> List[Hypothesis]:
    """Enforce evidence-linked rule, recompute confidence, sort."""
    # Drop hypotheses with zero supporting evidence unless they are the insufficient one
    filtered = []
    for h in hyps:
        if h.supporting_evidence_ids or h.confidence_level == ConfidenceLevel.INSUFFICIENT_EVIDENCE:
            filtered.append(h)
        # else: discard – no evidence-linked hyp
    if not filtered and hyps:
        # keep the weakest as insufficient
        weakest = min(hyps, key=lambda x: x.confidence)
        weakest.confidence = 0.15
        weakest.confidence_level = ConfidenceLevel.INSUFFICIENT_EVIDENCE
        weakest.supporting_evidence_ids = []
        filtered = [weakest]

    for h in filtered:
        s = h.scores or {}
        weighted = (
            (s.get("proximity") or 0) * 0.12
            + (s.get("evidence") or 0) * 0.38
            + (s.get("stack") or 0) * 0.18
            + (s.get("data_flow") or 0) * 0.12
            + (s.get("control_flow") or 0) * 0.08
            + (1.0 - (s.get("contradiction") or 0)) * 0.12
        )
        h.confidence = round(min(0.95, max(h.confidence, weighted)), 3)
        h.confidence_level = _level(h.confidence)
        if h.confidence_level == ConfidenceLevel.CONFIRMED:
            srcs = set()
            for eid in h.supporting_evidence_ids:
                for e in evidence:
                    if e.id == eid:
                        srcs.add(e.source)
            if srcs and srcs <= {"heuristic"}:
                h.confidence = min(h.confidence, 0.65)
                h.confidence_level = _level(h.confidence)

    filtered.sort(key=lambda x: x.confidence, reverse=True)
    return filtered
