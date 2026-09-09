"""Evidence pipeline: normalize, dedupe, rank."""

from __future__ import annotations

from typing import List, Dict, Any, Optional
from code_engine.models import Evidence, Finding, Severity, AnalysisSource, FindingCategory, SourceLocation


def _key(ev: Evidence) -> str:
    loc = ""
    if ev.location:
        loc = f"{ev.location.file}:{ev.location.line}:{ev.location.column}"
    return f"{ev.message}|{loc}|{ev.source}"


def dedupe_evidence(items: List[Evidence]) -> List[Evidence]:
    seen = set()
    out = []
    for e in items:
        k = _key(e)
        if k in seen:
            continue
        seen.add(k)
        out.append(e)
    return out


def normalize_evidence_list(raw: List[Evidence]) -> List[Evidence]:
    return dedupe_evidence(raw)


def findings_to_evidence(findings: List[Finding]) -> List[Evidence]:
    out = []
    for f in findings:
        out.append(Evidence(
            id="",
            source=f.evidence_source,
            message=f.message,
            reliability=f.severity,
            category=f.category,
            location=f.location,
            related_symbols=f.related_symbols,
            confidence=f.confidence,
        ))
    return out


def merge_evidence(*groups: List[Evidence]) -> List[Evidence]:
    all_ev: List[Evidence] = []
    for g in groups:
        all_ev.extend(g)
    return normalize_evidence_list(all_ev)


# Priority for ranking: parser > scope/static > dependency > heuristic
SOURCE_RANK = {
    AnalysisSource.PARSER: 100,
    AnalysisSource.SCOPE: 80,
    AnalysisSource.STATIC: 70,
    AnalysisSource.DEPENDENCY: 65,
    AnalysisSource.STRUCTURE: 50,
    AnalysisSource.RUNTIME: 90,
    AnalysisSource.HEURISTIC: 30,
    AnalysisSource.USER: 40,
}


def rank_evidence(items: List[Evidence]) -> List[Evidence]:
    def score(e: Evidence) -> float:
        src = e.source if isinstance(e.source, AnalysisSource) else AnalysisSource.HEURISTIC
        base = SOURCE_RANK.get(src, 20)
        sev_bonus = {
            Severity.CONFIRMED: 20,
            Severity.HIGH: 15,
            Severity.LIKELY: 10,
            Severity.POSSIBLE: 5,
            Severity.WEAK: 0,
            Severity.INFO: 0,
        }.get(e.reliability if isinstance(e.reliability, Severity) else Severity.POSSIBLE, 0)
        return base + sev_bonus + (e.confidence * 10)

    return sorted(items, key=score, reverse=True)
