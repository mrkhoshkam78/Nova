"""Code Intelligence Pipeline – orchestration."""

from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

from code_engine.models import (
    AnalysisResult,
    LanguageResult,
    Capability,
    content_hash,
    StructureInfo,
)
from code_engine.normalization import normalize, NormalizedSource
from code_engine.detection import detect
from code_engine.parsers import parse, capability_for
from code_engine.analyzers import get_analyzer
from code_engine.evidence import merge_evidence, rank_evidence, findings_to_evidence

# Simple in-memory cache keyed by content hash + language
_CACHE: Dict[str, AnalysisResult] = {}
_CACHE_MAX = 64


def _cache_get(key: str) -> Optional[AnalysisResult]:
    return _CACHE.get(key)


def _cache_set(key: str, result: AnalysisResult) -> None:
    if len(_CACHE) >= _CACHE_MAX:
        # drop oldest arbitrarily
        try:
            _CACHE.pop(next(iter(_CACHE)))
        except StopIteration:
            pass
    _CACHE[key] = result


def analyze_source(
    content: str | bytes,
    file_name: Optional[str] = None,
    mime: Optional[str] = None,
    language_hint: Optional[str] = None,
    use_cache: bool = True,
) -> AnalysisResult:
    t0 = time.perf_counter()
    norm = normalize(content, file_name=file_name)
    limitations: List[str] = []

    if norm.is_binary:
        lr = LanguageResult(language="binary", confidence=1.0, signals=["binary"])
        return AnalysisResult(
            id="",
            language=lr,
            content_hash=norm.content_hash,
            file_name=file_name,
            limitations=["Binary file – analysis skipped"],
            duration_ms=(time.perf_counter() - t0) * 1000,
        )

    if norm.is_empty:
        lr = LanguageResult(language="empty", confidence=1.0, signals=["empty"])
        return AnalysisResult(
            id="",
            language=lr,
            content_hash=norm.content_hash,
            file_name=file_name,
            limitations=["Empty file"],
            duration_ms=(time.perf_counter() - t0) * 1000,
        )

    lang_result = detect(file_name, norm.content, mime=mime)
    if language_hint and lang_result.confidence < 0.7:
        lang_result = LanguageResult(
            language=language_hint,
            confidence=max(lang_result.confidence, 0.6),
            signals=lang_result.signals + [f"hint:{language_hint}"],
            detector_version=lang_result.detector_version,
        )

    if lang_result.confidence < 0.4:
        limitations.append(
            f"Low language confidence ({lang_result.confidence}); analysis limited."
        )

    cache_key = f"{norm.content_hash}:{lang_result.language}"
    if use_cache:
        cached = _cache_get(cache_key)
        if cached:
            cached.duration_ms = (time.perf_counter() - t0) * 1000
            return cached

    cap = capability_for(lang_result.language)
    parse_result = parse(lang_result.language, norm.content, file_name)

    analyzer = get_analyzer(lang_result.language)
    analysis = analyzer.analyze(norm.content, file_name, parse_result)

    findings = analysis.get("findings") or []
    evidence = analysis.get("evidence") or []
    if not evidence and findings:
        evidence = findings_to_evidence(findings)
    evidence = rank_evidence(merge_evidence(evidence))

    if not parse_result.ast_available and lang_result.language in ("javascript", "typescript", "python"):
        if lang_result.language != "python" or parse_result.status != "ok":
            limitations.append(
                f"AST not available for {lang_result.language} "
                f"(parser status={parse_result.status}). Lightweight analysis only."
            )

    result = AnalysisResult(
        id="",
        language=lang_result,
        content_hash=norm.content_hash,
        file_name=file_name,
        capabilities=cap,
        parse=parse_result,
        findings=findings,
        evidence=evidence,
        symbols=analysis.get("symbols") or [],
        structure=analysis.get("structure") or StructureInfo(),
        limitations=limitations,
        duration_ms=(time.perf_counter() - t0) * 1000,
    )

    if use_cache and parse_result.status != "error":
        _cache_set(cache_key, result)

    return result


def build_llm_context(result: AnalysisResult, max_findings: int = 20) -> Dict[str, Any]:
    """Selective context for LLM – never dump whole source by default."""
    return {
        "CODE_ENGINE_VERSION": result.version,
        "FILE": result.file_name,
        "LANGUAGE": result.language.to_dict() if result.language else None,
        "CAPABILITIES": result.capabilities.to_dict() if result.capabilities else None,
        "PARSE_STATUS": result.parse.status if result.parse else None,
        "AST_AVAILABLE": result.parse.ast_available if result.parse else False,
        "CONTENT_HASH": result.content_hash,
        "FINDINGS": [f.to_dict() for f in (result.findings or [])[:max_findings]],
        "EVIDENCE": [e.to_dict() for e in (result.evidence or [])[:max_findings]],
        "STRUCTURE_SUMMARY": {
            "functions": len(result.structure.functions) if result.structure else 0,
            "classes": len(result.structure.classes) if result.structure else 0,
            "imports": len(result.structure.imports) if result.structure else 0,
        } if result.structure else None,
        "LIMITATIONS": result.limitations,
        "CONSTRAINTS": [
            "Do not invent execution results",
            "Respect evidence source and confidence",
            "AST_AVAILABLE=false means no real structural proof from parser",
            "Heuristic findings are lower reliability than parser findings",
        ],
    }


def clear_cache() -> None:
    _CACHE.clear()
