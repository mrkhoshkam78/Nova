"""Lightweight pattern extraction from experiences (no ML training)."""

from __future__ import annotations

import re
from collections import Counter
from typing import List, Optional

from learning.experience import Experience


def extract_tags_from_text(text: str) -> List[str]:
    tags: List[str] = []
    lower = (text or "").lower()
    patterns = [
        (r"null|undefined|none\b", "nullability"),
        (r"typeerror|type\s*error", "type"),
        (r"referenceerror|not defined|undefined variable", "reference"),
        (r"syntaxerror|parse error|unexpected token", "syntax"),
        (r"scope|closure|hoist", "scope"),
        (r"import|module not found|require\(", "dependency"),
        (r"async|await|promise|race", "async"),
        (r"timeout|performance|slow", "performance"),
        (r"permission|xss|injection|secret", "security"),
        (r"config|env|setting", "configuration"),
        (r"indexerror|keyerror|attributeerror", "runtime"),
    ]
    for pat, tag in patterns:
        if re.search(pat, lower):
            tags.append(tag)
    return list(dict.fromkeys(tags))


def common_failure_patterns(experiences: List[Experience], top_n: int = 10) -> List[tuple]:
    counter: Counter = Counter()
    for e in experiences:
        if e.error_type:
            counter[e.error_type] += 1
        for t in e.tags or []:
            counter[t] += 1
    return counter.most_common(top_n)
