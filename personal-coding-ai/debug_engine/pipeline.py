"""Debugging Intelligence Pipeline – evidence-first, no premature root-cause claims."""

from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

from debug_engine.models import (
    DebugSession,
    DebugInput,
    EvidenceItem,
    SessionState,
    FailureType,
    RootCauseCandidate,
    ConfidenceLevel,
)
from debug_engine.classifier import classify_failure
from debug_engine.localizer import localize, parse_stack_trace
from debug_engine.hypothesis import generate_hypotheses
from debug_engine.fix_engine import generate_fix, validate_fix_static


def _uid(prefix: str = "x") -> str:
    import uuid
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


def _evidence_from_code_engine(analysis: Dict[str, Any], file_name: Optional[str] = None) -> List[EvidenceItem]:
    items: List[EvidenceItem] = []
    for ev in analysis.get("evidence") or []:
        loc = ev.get("location") or {}
        items.append(EvidenceItem(
            id=ev.get("id") or _uid("ev"),
            source=ev.get("source") or "static",
            message=ev.get("message") or "",
            reliability=ev.get("reliability") or "possible",
            file=loc.get("file") or file_name,
            line=loc.get("line"),
            column=loc.get("column"),
            kind="engine_evidence",
            related_symbols=ev.get("related_symbols") or [],
            confidence=float(ev.get("confidence") or 0.5),
            analysis_result_id=analysis.get("id"),
        ))
    for f in analysis.get("findings") or []:
        loc = f.get("location") or {}
        items.append(EvidenceItem(
            id=f.get("id") or _uid("ev"),
            source=f.get("evidence_source") or "static",
            message=f.get("message") or "",
            reliability=f.get("severity") or "possible",
            file=loc.get("file") or f.get("file") or file_name,
            line=loc.get("line"),
            column=loc.get("column"),
            kind="static_finding",
            related_symbols=f.get("related_symbols") or [],
            confidence=float(f.get("confidence") or 0.5),
        ))
    # parse errors
    parse = analysis.get("parse") or {}
    for err in parse.get("syntax_errors") or []:
        items.append(EvidenceItem(
            id=_uid("ev"),
            source="parser",
            message=err.get("message") or "Syntax error",
            reliability="confirmed",
            file=file_name,
            line=err.get("line"),
            column=err.get("column"),
            kind="syntax",
            confidence=0.95,
        ))
    return items


def _dedupe_evidence(items: List[EvidenceItem]) -> List[EvidenceItem]:
    seen = set()
    out = []
    for e in items:
        key = f"{e.message}|{e.file}|{e.line}|{e.source}"
        if key in seen:
            continue
        seen.add(key)
        out.append(e)
    return out


def collect_evidence(session: DebugSession) -> DebugSession:
    session.state = SessionState.INPUT_COLLECTED
    inp = session.input
    evidence: List[EvidenceItem] = []

    if inp.error_message:
        evidence.append(EvidenceItem(
            id=_uid("ev"),
            source="user_error",
            message=inp.error_message,
            reliability="high",
            kind="runtime_error",
            confidence=0.85,
        ))

    frames = parse_stack_trace(inp.stack_trace)
    for f in frames:
        evidence.append(EvidenceItem(
            id=_uid("ev"),
            source="stack_trace",
            message=f.get("raw") or "",
            reliability="possible" if f.get("external") else "high",
            file=f.get("file"),
            line=f.get("line"),
            column=f.get("column"),
            kind="external_frame" if f.get("external") else "application_frame",
            related_symbols=[f["function"]] if f.get("function") else [],
            confidence=0.7 if not f.get("external") else 0.4,
        ))

    if inp.user_description:
        evidence.append(EvidenceItem(
            id=_uid("ev"),
            source="user",
            message=inp.user_description,
            reliability="possible",
            kind="user_report",
            confidence=0.45,
        ))

    # Code Engine analysis per file
    try:
        from code_engine import analyze_source
        files = inp.files or []
        if not files and inp.source_code:
            files = [{"name": "snippet", "content": inp.source_code, "language": None}]
        for fobj in files[:15]:
            name = fobj.get("name") or "file"
            content = fobj.get("content") or ""
            if not content.strip():
                continue
            result = analyze_source(
                content,
                file_name=name,
                language_hint=fobj.get("language"),
            )
            ar = result.to_dict()
            session.analysis_results.append(ar)
            evidence.extend(_evidence_from_code_engine(ar, name))
            for lim in result.limitations or []:
                if lim not in session.limitations:
                    session.limitations.append(lim)
    except Exception as exc:  # noqa: BLE001
        session.limitations.append(f"Code engine unavailable: {exc}")
        session.state = SessionState.ANALYSIS_FAILED

    session.evidence = _dedupe_evidence(evidence)
    if not session.evidence:
        session.state = SessionState.INSUFFICIENT_EVIDENCE
        session.limitations.append("No structured evidence could be collected.")
    else:
        session.state = SessionState.EVIDENCE_COLLECTED
    return session


def run_debug(input_data: Dict[str, Any] | DebugInput) -> DebugSession:
    """Full debugging algorithm."""
    t0 = time.perf_counter()
    if isinstance(input_data, dict):
        inp = DebugInput(
            source_code=input_data.get("source_code") or input_data.get("sourceCode"),
            files=input_data.get("files") or [],
            error_message=input_data.get("error_message") or input_data.get("errorMessage"),
            stack_trace=input_data.get("stack_trace") or input_data.get("stackTrace"),
            user_description=input_data.get("user_description") or input_data.get("userDescription"),
            expected_behavior=input_data.get("expected_behavior") or input_data.get("expectedBehavior"),
            actual_behavior=input_data.get("actual_behavior") or input_data.get("actualBehavior"),
        )
    else:
        inp = input_data

    session = DebugSession(id=_uid("dbg"), input=inp)
    session.expected_behavior = inp.expected_behavior or "Not specified"
    session.actual_behavior = inp.actual_behavior or inp.error_message or "Failure observed"
    session.runtime_available = False  # no sandbox in this version
    session.limitations.append("No code execution sandbox — results are evidence-based only.")

    # 1–2 Collect + classify
    collect_evidence(session)
    if session.state == SessionState.INSUFFICIENT_EVIDENCE:
        session.finished_at = time.time()
        return session

    session.failure_type = classify_failure(inp, session.evidence)
    session.state = SessionState.CLASSIFIED

    # 3 Localize (not root cause)
    session.localization = localize(inp, session.evidence)
    session.state = SessionState.LOCALIZED

    # 4 Hypotheses
    session.hypotheses = generate_hypotheses(
        session.failure_type,
        session.evidence,
        session.localization,
        inp,
    )
    session.state = SessionState.HYPOTHESIZED

    # 5 Rank / select root cause candidate
    if not session.hypotheses:
        session.state = SessionState.INSUFFICIENT_EVIDENCE
        session.finished_at = time.time()
        return session

    top = session.hypotheses[0]
    session.state = SessionState.RANKED

    if top.confidence < 0.40 or top.confidence_level == ConfidenceLevel.INSUFFICIENT_EVIDENCE:
        session.root_cause = RootCauseCandidate(
            hypothesis_id=top.id,
            summary=top.cause,
            confidence=top.confidence,
            confidence_level=ConfidenceLevel.INSUFFICIENT_EVIDENCE,
            causal_chain=top.causal_path or ["Insufficient evidence"],
            supporting_evidence_ids=top.supporting_evidence_ids,
            note="Highest-ranked hypothesis is weak; need more evidence (stack, error, code).",
        )
        session.state = SessionState.INSUFFICIENT_EVIDENCE
        session.finished_at = time.time()
        return session

    region = None
    if top.related_locations:
        region = top.related_locations[0]
    elif session.localization:
        region = {
            "file": session.localization.file,
            "line": session.localization.line,
        }

    session.root_cause = RootCauseCandidate(
        hypothesis_id=top.id,
        summary=top.cause,
        confidence=top.confidence,
        confidence_level=top.confidence_level,
        causal_chain=top.causal_path,
        supporting_evidence_ids=top.supporting_evidence_ids,
        region=region,
        note=(
            "Selected from ranked hypotheses using evidence strength. "
            "Error location is not automatically the root cause."
            if not session.runtime_available
            else "Evidence-ranked candidate."
        ),
    )
    session.state = SessionState.ROOT_CAUSE_SELECTED

    # 6 Fix
    session.fix = generate_fix(
        session.root_cause,
        session.failure_type,
        session.hypotheses,
        session.evidence,
        runtime_available=session.runtime_available,
    )
    if session.fix:
        session.state = SessionState.FIX_GENERATED
        # Optional static validation hint: if syntax was the issue and we have parser evidence, stay suggested
        session.fix = validate_fix_static(session.fix)
        session.state = SessionState.FIX_VALIDATED
        session.state = SessionState.PARTIALLY_RESOLVED
    else:
        session.state = SessionState.PARTIALLY_RESOLVED

    session.finished_at = time.time()
    return session


def build_llm_debug_context(session: DebugSession, max_evidence: int = 15) -> Dict[str, Any]:
    """Context for LLM reasoning layer – after analysis only."""
    return {
        "DEBUG_SESSION": session.id,
        "VERSION": session.version,
        "STATE": session.state.value if hasattr(session.state, "value") else session.state,
        "FAILURE_TYPE": session.failure_type.value if hasattr(session.failure_type, "value") else session.failure_type,
        "EXPECTED_BEHAVIOR": session.expected_behavior,
        "ACTUAL_BEHAVIOR": session.actual_behavior,
        "LOCALIZATION": session.localization.to_dict() if session.localization else None,
        "EVIDENCE": [e.to_dict() for e in session.evidence[:max_evidence]],
        "HYPOTHESES": [h.to_dict() for h in session.hypotheses[:6]],
        "ROOT_CAUSE_CANDIDATE": session.root_cause.to_dict() if session.root_cause else None,
        "SUGGESTED_FIX": session.fix.to_dict() if session.fix else None,
        "LIMITATIONS": session.limitations,
        "RUNTIME_AVAILABLE": session.runtime_available,
        "CONSTRAINTS": [
            "Do not invent execution results",
            "Do not claim the bug is fixed without runtime confirmation",
            "Separate symptom (error location) from root cause",
            "Respect evidence source and confidence levels",
            "Heuristic-only findings cannot be CONFIRMED",
            "Suggested Fix is not a verified patch",
        ],
    }


def format_debug_report(session: DebugSession) -> str:
    lines: List[str] = []
    lines.append("## Failure Summary")
    lines.append(f"- **Failure type:** {session.failure_type.value if hasattr(session.failure_type, 'value') else session.failure_type}")
    lines.append(f"- **Expected:** {session.expected_behavior}")
    lines.append(f"- **Actual:** {session.actual_behavior}")
    lines.append(f"- **Session state:** `{session.state.value if hasattr(session.state, 'value') else session.state}`")
    lines.append(f"- **Engine:** Nova Debug Intelligence V{session.version}")
    lines.append("")

    if session.localization and (session.localization.line is not None or session.localization.file):
        loc = session.localization
        lines.append("## Error Location (starting point only)")
        lines.append(f"- {loc.file or '?'}:{loc.line if loc.line is not None else '?'}")
        lines.append(f"- _{loc.note}_")
        lines.append("")

    lines.append("## Most Likely Root Cause Candidate")
    if session.root_cause:
        rc = session.root_cause
        lines.append(f"- {rc.summary}")
        cl = rc.confidence_level.value if hasattr(rc.confidence_level, "value") else rc.confidence_level
        lines.append(f"- **Confidence:** {rc.confidence} ({cl})")
        if rc.note:
            lines.append(f"- _{rc.note}_")
    else:
        lines.append("- Not identified (insufficient evidence)")
    lines.append("")

    lines.append("## Evidence")
    for e in session.evidence[:12]:
        loc = ":".join(str(x) for x in [e.file, e.line] if x is not None)
        lines.append(f"- **[{e.reliability}]** {loc + ' — ' if loc else ''}{e.message} _({e.source})_")
    lines.append("")

    if session.root_cause and session.root_cause.causal_chain:
        lines.append("## Causal Chain")
        for i, step in enumerate(session.root_cause.causal_chain, 1):
            lines.append(f"{i}. {step}")
        lines.append("")

    lines.append("## Alternative Hypotheses")
    for i, h in enumerate(session.hypotheses[:4], 1):
        cl = h.confidence_level.value if hasattr(h.confidence_level, "value") else h.confidence_level
        lines.append(f"{i}. **{h.label}** — confidence {h.confidence} ({cl})")
        lines.append(f"   - {h.cause}")
    lines.append("")

    lines.append("## Suggested Fix")
    if session.fix:
        fx = session.fix
        st = fx.status.value if hasattr(fx.status, "value") else fx.status
        lines.append(f"- **Strategy:** {fx.strategy}")
        lines.append(f"- **Status:** {st} (not runtime-confirmed)" if st != "runtime_confirmed" else f"- **Status:** {st}")
        lines.append(f"- **Regression risk:** {fx.regression_risk}")
        lines.append("```")
        lines.append(fx.patch_hint.strip())
        lines.append("```")
        lines.append(f"- _{fx.note}_")
    else:
        lines.append("- No fix suggested (confidence too low or insufficient evidence).")
    lines.append("")

    lines.append("## Limitations")
    for lim in (session.limitations or ["Evidence-based analysis only."]):
        lines.append(f"- {lim}")

    return "\n".join(lines)
