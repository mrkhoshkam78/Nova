"""Debugging Intelligence Pipeline – evidence-first, no premature root-cause claims."""

from __future__ import annotations

import re
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
            files = [{"name": "snippet", "content": inp.source_code, "language": inp.language}]
        for fobj in files[:15]:
            name = fobj.get("name") or "file"
            content = fobj.get("content") or ""
            if not content.strip():
                continue
            lang_hint = fobj.get("language") or inp.language
            result = analyze_source(
                content,
                file_name=name,
                language_hint=lang_hint,
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


def _get_learning_brain():
    """Lazy import so pipeline works even if learning package is absent."""
    try:
        from learning import LearningBrain
        return LearningBrain()
    except Exception:  # noqa: BLE001
        return None


def _apply_memory_priors(session: DebugSession, brain) -> None:
    """Boost/penalize hypotheses from prior experiences. Memory is prior, not truth."""
    if not brain or not session.related_memories or not session.hypotheses:
        return
    for h in session.hypotheses:
        boost = brain.memory_prior_boost(session.related_memories, h.cause or h.label or "")
        if boost != 0.0:
            h.confidence = round(max(0.05, min(0.95, h.confidence + boost)), 3)
            h.scores = dict(h.scores or {})
            h.scores["historical"] = boost
            # recompute level
            if h.confidence >= 0.90:
                h.confidence_level = ConfidenceLevel.CONFIRMED
            elif h.confidence >= 0.70:
                h.confidence_level = ConfidenceLevel.HIGH_PROBABILITY
            elif h.confidence >= 0.40:
                h.confidence_level = ConfidenceLevel.POSSIBLE
            else:
                h.confidence_level = ConfidenceLevel.INSUFFICIENT_EVIDENCE
    session.hypotheses.sort(key=lambda x: x.confidence, reverse=True)


def run_debug(input_data: Dict[str, Any] | DebugInput) -> DebugSession:
    """Full debugging algorithm with Phase 3 Learning Brain integration."""
    t0 = time.perf_counter()
    if isinstance(input_data, dict):
        lang = input_data.get("language") or input_data.get("Language")
        files = input_data.get("files") or []
        # Propagate top-level language into file entries when missing
        if lang and files:
            for f in files:
                if isinstance(f, dict) and not f.get("language"):
                    f["language"] = lang
        inp = DebugInput(
            source_code=input_data.get("source_code") or input_data.get("sourceCode"),
            language=lang,
            files=files,
            error_message=input_data.get("error_message") or input_data.get("errorMessage"),
            stack_trace=input_data.get("stack_trace") or input_data.get("stackTrace"),
            user_description=input_data.get("user_description") or input_data.get("userDescription"),
            expected_behavior=input_data.get("expected_behavior") or input_data.get("expectedBehavior"),
            actual_behavior=input_data.get("actual_behavior") or input_data.get("actualBehavior"),
            code_structure=input_data.get("code_structure") or input_data.get("codeStructure"),
            evidence=input_data.get("evidence"),
        )
    else:
        inp = input_data
    # Ensure language reaches code engine for short snippets without filename
    if inp.language and inp.source_code and not inp.files:
        inp.files = [{"name": "snippet", "content": inp.source_code, "language": inp.language}]
    elif not inp.language and inp.source_code and not inp.files:
        # lightweight detection for short code without extension
        code = inp.source_code
        detected = None
        if re.search(r"\bdef\s+\w+\s*\(|\bimport\s+\w+|\bprint\s*\(", code):
            detected = "python"
        elif re.search(r"\bfunction\s+\w+|\bconst\s+\w+|\blet\s+\w+|console\.log", code):
            detected = "javascript"
        elif re.search(r"\bpublic\s+class\b|\bSystem\.out", code):
            detected = "java"
        if detected:
            inp.language = detected
            inp.files = [{"name": "snippet", "content": code, "language": detected}]

    session = DebugSession(id=_uid("dbg"), input=inp)
    session.expected_behavior = inp.expected_behavior or "Not specified"
    session.actual_behavior = inp.actual_behavior or inp.error_message or "Failure observed"
    session.runtime_available = False  # no sandbox in this version
    session.limitations.append("No code execution sandbox — results are evidence-based only.")
    session.limitations.append("Validation is reasoning/static only (no runtime confirmation).")

    brain = _get_learning_brain()

    # 1–2 Collect + classify
    collect_evidence(session)
    if session.state == SessionState.INSUFFICIENT_EVIDENCE:
        session.finished_at = time.time()
        if brain:
            try:
                exp = brain.learn_from_session(session)
                if exp:
                    session.learning = {"stored": True, "experience_id": exp.id, "status": exp.status.value}
            except Exception:  # noqa: BLE001
                pass
        return session

    session.failure_type = classify_failure(inp, session.evidence)
    session.state = SessionState.CLASSIFIED

    # 3 Localize (not root cause)
    session.localization = localize(inp, session.evidence)
    session.state = SessionState.LOCALIZED

    # 3.5 Retrieve related memories (prior experience only)
    if brain:
        try:
            lang = None
            if inp.files:
                lang = (inp.files[0] or {}).get("language")
            if not lang and inp.source_code:
                code = inp.source_code
                if "def " in code or "import " in code:
                    lang = "python"
                elif "function " in code or "const " in code:
                    lang = "javascript"
            evidence_msgs = [e.message for e in session.evidence if e.message][:15]
            session.related_memories = brain.retrieve_for_debug(
                language=lang,
                error_message=inp.error_message,
                error_type=session.failure_type.value if session.failure_type else None,
                problem_text=inp.user_description or session.actual_behavior,
                evidence_messages=evidence_msgs,
                limit=5,
            )
            session.contradictions = brain.detect_memory_evidence_conflict(
                session.related_memories, evidence_msgs
            )
            if session.contradictions:
                session.limitations.append(
                    "Memory/evidence conflicts detected; current evidence takes priority."
                )
        except Exception as exc:  # noqa: BLE001
            session.limitations.append(f"Learning retrieval skipped: {exc}")

    # 4 Hypotheses
    session.hypotheses = generate_hypotheses(
        session.failure_type,
        session.evidence,
        session.localization,
        inp,
    )
    # Apply historical prior (small boost/penalty only)
    _apply_memory_priors(session, brain)
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
        if brain:
            try:
                exp = brain.learn_from_session(session)
                if exp:
                    session.learning = {"stored": True, "experience_id": exp.id, "status": exp.status.value}
            except Exception:  # noqa: BLE001
                pass
        return session

    region = None
    if top.related_locations:
        region = top.related_locations[0]
    elif session.localization:
        region = {
            "file": session.localization.file,
            "line": session.localization.line,
        }

    # Drop hypotheses that have zero supporting evidence (Phase 3 rule)
    session.hypotheses = [
        h for h in session.hypotheses
        if h.supporting_evidence_ids or h.confidence_level == ConfidenceLevel.INSUFFICIENT_EVIDENCE
    ] or session.hypotheses

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
            "Error location is not automatically the root cause. "
            "Memory is prior experience only."
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
        session.fix = validate_fix_static(session.fix)
        session.state = SessionState.FIX_VALIDATED
        session.state = SessionState.PARTIALLY_RESOLVED
    else:
        session.state = SessionState.PARTIALLY_RESOLVED

    # 7 Learn from session (store experience if valid)
    if brain:
        try:
            exp = brain.learn_from_session(session)
            if exp:
                session.learning = {
                    "stored": True,
                    "experience_id": exp.id,
                    "status": exp.status.value if hasattr(exp.status, "value") else str(exp.status),
                    "success": exp.success,
                    "usefulness": exp.usefulness,
                }
            else:
                session.learning = {"stored": False, "reason": "insufficient_or_invalid_experience"}
        except Exception as exc:  # noqa: BLE001
            session.learning = {"stored": False, "reason": str(exc)}
            session.limitations.append(f"Learning store skipped: {exc}")

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
        "RELATED_MEMORIES": (session.related_memories or [])[:3],
        "CONTRADICTIONS": session.contradictions or [],
        "LEARNING": session.learning,
        "LIMITATIONS": session.limitations,
        "RUNTIME_AVAILABLE": session.runtime_available,
        "CONSTRAINTS": [
            "Do not invent execution results",
            "Do not claim the bug is fixed without runtime confirmation",
            "Separate symptom (error location) from root cause",
            "Respect evidence source and confidence levels",
            "Heuristic-only findings cannot be CONFIRMED",
            "Suggested Fix is not a verified patch",
            "Memory is prior experience only; current evidence overrides conflicting memory",
            "Do not invent evidence or claim runtime validation",
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

    if session.related_memories:
        lines.append("## Prior Experience (memory ≠ truth)")
        lines.append(f"- 🧠 Similar previous experience found ({len(session.related_memories)})")
        for m in session.related_memories[:2]:
            rc = m.get("root_cause") or m.get("problem") or ""
            lines.append(f"  - {str(rc)[:120]}")
        if session.contradictions:
            lines.append("- Conflicts with current evidence (current evidence wins):")
            for c in session.contradictions[:3]:
                lines.append(f"  - {c}")
        lines.append("")

    if session.learning and session.learning.get("stored"):
        lines.append("🧠 Experience saved")
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

    if session.related_memories:
        lines.append("## Related Past Experiences (prior only)")
        for m in session.related_memories[:3]:
            rel = m.get("relevance") or 0
            root = m.get("root_cause") or "?"
            succ = "success" if m.get("success") else "failed/unvalidated"
            lines.append(f"- relevance={rel:.2f} | {succ} | root: {root[:120]}")
        lines.append("")

    if session.contradictions:
        lines.append("## Memory / Evidence Conflicts")
        for c in session.contradictions[:5]:
            lines.append(f"- {c}")
        lines.append("- _Current evidence takes priority over old memory._")
        lines.append("")

    if session.learning:
        lines.append("## Learning")
        lines.append(f"- {session.learning}")
        lines.append("")

    lines.append("## Limitations")
    for lim in (session.limitations or ["Evidence-based analysis only."]):
        lines.append(f"- {lim}")

    return "\n".join(lines)
