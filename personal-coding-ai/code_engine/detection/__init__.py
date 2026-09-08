"""Multi-signal language detection."""

from __future__ import annotations

from typing import List, Optional, Tuple
import re

from code_engine.models import LanguageResult

DETECTOR_VERSION = "1.0.0"

EXT_MAP = {
    "py": "python", "pyw": "python", "pyi": "python",
    "js": "javascript", "mjs": "javascript", "cjs": "javascript",
    "ts": "typescript", "tsx": "typescript", "jsx": "javascript",
    "html": "html", "htm": "html",
    "css": "css", "scss": "css", "less": "css",
    "json": "json",
    "yaml": "yaml", "yml": "yaml",
    "md": "markdown", "markdown": "markdown",
    "java": "java", "c": "c", "cpp": "cpp", "h": "c", "hpp": "cpp",
    "cs": "csharp", "go": "go", "rs": "rust", "rb": "ruby",
    "php": "php", "sql": "sql", "sh": "bash", "bash": "bash",
    "xml": "xml", "vue": "vue", "svelte": "svelte",
}

SHEBANG = [
    (re.compile(r"^#!.*\bpython[0-9.]*\b", re.I), "python"),
    (re.compile(r"^#!.*\bnode\b", re.I), "javascript"),
    (re.compile(r"^#!.*\bbash\b|^#!.*/bin/sh\b", re.I), "bash"),
    (re.compile(r"^#!.*\bruby\b", re.I), "ruby"),
    (re.compile(r"^#!.*\bperl\b", re.I), "perl"),
]

SYNTAX_PATTERNS: List[Tuple[re.Pattern, str, float]] = [
    (re.compile(r"^\s*def\s+\w+\s*\(|^\s*class\s+\w+\s*[:\(]|^\s*import\s+\w+|^\s*from\s+\w+\s+import", re.M), "python", 0.35),
    (re.compile(r"^\s*function\s+\w+|^\s*(const|let|var)\s+\w+\s*=|=>\s*\{|require\s*\(|module\.exports", re.M), "javascript", 0.3),
    (re.compile(r"^\s*interface\s+\w+|^\s*type\s+\w+\s*=|:\s*(string|number|boolean|any)\b", re.M), "typescript", 0.35),
    (re.compile(r"<!DOCTYPE\s+html|<html[\s>]|</html>", re.I), "html", 0.5),
    (re.compile(r"^\s*[\w\-]+\s*\{[^}]*:\s*[^;]+;", re.M), "css", 0.25),
    (re.compile(r"^\s*\{[\s\S]*\}\s*$"), "json", 0.2),
    (re.compile(r"^\s*(package|func)\s+\w+", re.M), "go", 0.3),
    (re.compile(r"^\s*(fn|let\s+mut|impl)\s+", re.M), "rust", 0.3),
    (re.compile(r"<\?php", re.I), "php", 0.5),
]

KEYWORD_FREQ = {
    "python": ["def ", "import ", "from ", "class ", "self.", "None", "True", "False", "elif ", "lambda "],
    "javascript": ["function ", "const ", "let ", "var ", "=>", "return ", "typeof ", "undefined", "console."],
    "typescript": ["interface ", "type ", ": string", ": number", "implements ", "export "],
    "html": ["<div", "<span", "<html", "</", "class=", "id="],
    "css": ["color:", "margin:", "padding:", "display:", "flex", "@media"],
}


def _ext_signal(name: Optional[str]) -> Tuple[Optional[str], float, str]:
    if not name:
        return None, 0.0, ""
    i = name.rfind(".")
    if i < 0:
        return None, 0.0, ""
    ext = name[i + 1:].lower()
    lang = EXT_MAP.get(ext)
    if lang:
        return lang, 0.55, f"extension:{ext}"
    return None, 0.0, ""


def _shebang_signal(content: str) -> Tuple[Optional[str], float, str]:
    head = content[:200]
    for pat, lang in SHEBANG:
        if pat.search(head):
            return lang, 0.7, "shebang"
    return None, 0.0, ""


def _syntax_signal(content: str) -> List[Tuple[str, float, str]]:
    hits = []
    head = content[:4000]
    for pat, lang, w in SYNTAX_PATTERNS:
        if pat.search(head):
            hits.append((lang, w, f"syntax:{lang}"))
    return hits


def _keyword_signal(content: str) -> List[Tuple[str, float, str]]:
    lower = content[:8000].lower()
    scores = []
    for lang, kws in KEYWORD_FREQ.items():
        count = sum(lower.count(k.lower()) for k in kws)
        if count >= 3:
            scores.append((lang, min(0.4, 0.08 * count), f"keywords:{lang}:{count}"))
        elif count >= 1:
            scores.append((lang, 0.1, f"keywords:{lang}:{count}"))
    return scores


def detect(file_name: Optional[str], content: str, mime: Optional[str] = None) -> LanguageResult:
    scores: dict[str, float] = {}
    signals: List[str] = []

    def add(lang: Optional[str], weight: float, sig: str):
        if not lang or weight <= 0:
            return
        scores[lang] = scores.get(lang, 0.0) + weight
        if sig and sig not in signals:
            signals.append(sig)

    lang, w, s = _ext_signal(file_name)
    add(lang, w, s)

    lang, w, s = _shebang_signal(content or "")
    add(lang, w, s)

    if mime:
        if "javascript" in mime or "ecmascript" in mime:
            add("javascript", 0.4, "mime:javascript")
        elif "json" in mime:
            add("json", 0.5, "mime:json")
        elif "html" in mime:
            add("html", 0.5, "mime:html")
        elif "css" in mime:
            add("css", 0.5, "mime:css")
        elif "python" in mime:
            add("python", 0.4, "mime:python")

    for lang, w, s in _syntax_signal(content or ""):
        add(lang, w, s)
    for lang, w, s in _keyword_signal(content or ""):
        add(lang, w, s)

    if not scores:
        return LanguageResult(language="text", confidence=0.2, signals=["fallback:text"], detector_version=DETECTOR_VERSION)

    best = max(scores.items(), key=lambda x: x[1])
    # normalize confidence roughly to 0..1
    conf = min(0.98, best[1] / 1.2)
    # if close runners-up, lower confidence
    sorted_scores = sorted(scores.values(), reverse=True)
    if len(sorted_scores) > 1 and sorted_scores[0] - sorted_scores[1] < 0.15:
        conf = min(conf, 0.55)

    return LanguageResult(
        language=best[0],
        confidence=round(conf, 3),
        signals=signals,
        detector_version=DETECTOR_VERSION,
    )
