"""Error localization – finds relevant region; never equates location with root cause."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

from debug_engine.models import EvidenceItem, FailureRegion, DebugInput


def parse_stack_trace(stack: Optional[str]) -> List[Dict[str, Any]]:
    if not stack:
        return []
    frames = []
    for idx, line in enumerate(String_split(stack)):
        line = line.strip()
        if not line:
            continue
        # JS: at fn (file:line:col)
        m = re.search(
            r"at\s+(?:(.+?)\s+\()?((?:https?:\/\/|file:\/\/|\/)?[^):\s]+):(\d+)(?::(\d+))?\)?",
            line,
        )
        if m:
            file_path = m.group(2)
            frames.append({
                "raw": line,
                "function": m.group(1),
                "file": file_path,
                "line": int(m.group(3)),
                "column": int(m.group(4)) if m.group(4) else None,
                "external": bool(re.search(r"node_modules|node:internal|webpack|vendor/", file_path or "")),
                "index": idx,
            })
            continue
        # Python: File "x.py", line N, in fn
        m = re.search(r'File\s+"([^"]+)",\s+line\s+(\d+)(?:,\s+in\s+(\S+))?', line, re.I)
        if m:
            frames.append({
                "raw": line,
                "function": m.group(3),
                "file": m.group(1),
                "line": int(m.group(2)),
                "column": None,
                "external": bool(re.search(r"site-packages|lib/python", m.group(1) or "")),
                "index": idx,
            })
    return frames


def String_split(s: str) -> List[str]:
    return str(s).splitlines()


def localize(
    inp: DebugInput,
    evidence: List[EvidenceItem],
) -> FailureRegion:
    """Select best failure region from stack + parser + static evidence. Not root cause."""
    frames = parse_stack_trace(inp.stack_trace)
    app_frames = [f for f in frames if not f.get("external")]

    # Prefer first application stack frame
    if app_frames:
        f = app_frames[0]
        related = [e.id for e in evidence if e.kind in ("application_frame", "stack_trace") or (e.line == f["line"] and e.file)]
        return FailureRegion(
            file=f.get("file"),
            line=f.get("line"),
            column=f.get("column"),
            message=f.get("raw"),
            evidence_ids=related[:5],
            note="Error location from stack frame is a starting point, not the root cause.",
        )

    # Parser / syntax errors
    parser_ev = [e for e in evidence if e.source in ("parser",) or e.kind in ("parser_hint", "syntax")]
    if parser_ev:
        e = sorted(parser_ev, key=lambda x: {"confirmed": 3, "high": 2}.get(x.reliability, 1), reverse=True)[0]
        return FailureRegion(
            file=e.file,
            line=e.line,
            column=e.column,
            message=e.message,
            evidence_ids=[e.id],
            note="Parser-reported location is where syntax fails; root cause may be earlier edit.",
        )

    # Strongest static/scope finding with location
    located = [e for e in evidence if e.line is not None and e.reliability in ("confirmed", "high")]
    if not located:
        located = [e for e in evidence if e.line is not None]
    if located:
        rank = {"confirmed": 3, "high": 2, "possible": 1, "weak": 0}
        e = sorted(located, key=lambda x: rank.get(x.reliability, 0), reverse=True)[0]
        return FailureRegion(
            file=e.file,
            line=e.line,
            column=e.column,
            message=e.message,
            evidence_ids=[e.id],
            note="Static finding location is a symptom region, not automatically the root cause.",
        )

    return FailureRegion(
        note="No precise failure region localized; need stack trace or parser findings.",
    )
