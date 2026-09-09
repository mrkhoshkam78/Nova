"""Experience model for Learning Brain."""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Any, Dict, List, Optional
import time
import uuid
import re


class ExperienceStatus(str, Enum):
    SUCCESS = "success"
    FAILURE = "failure"
    PARTIAL = "partial"
    UNVALIDATED = "unvalidated"
    VALIDATED = "validated"  # static/reasoning validated, not runtime-confirmed
    INVALID = "invalid"  # incomplete / not stored as truth


SENSITIVE_PATTERNS = [
    re.compile(r"(?i)(api[_-]?key|apikey|secret|password|passwd|token|bearer|credential|private[_-]?key)\s*[:=]\s*['\"]?[^\s'\"]+", re.I),
    re.compile(r"(?i)sk-[a-zA-Z0-9]{20,}"),
    re.compile(r"(?i)ghp_[a-zA-Z0-9]{20,}"),
    re.compile(r"(?i)xox[baprs]-[a-zA-Z0-9-]{10,}"),
]


def sanitize_text(text: Optional[str], max_len: int = 4000) -> Optional[str]:
    if not text:
        return text
    out = text
    for pat in SENSITIVE_PATTERNS:
        out = pat.sub("[REDACTED]", out)
    if len(out) > max_len:
        out = out[:max_len] + "…"
    return out


@dataclass
class Experience:
    id: str = ""
    language: Optional[str] = None
    problem: str = ""
    error: Optional[str] = None
    error_type: Optional[str] = None
    evidence_summary: List[str] = field(default_factory=list)
    evidence_ids: List[str] = field(default_factory=list)
    root_cause: Optional[str] = None
    root_cause_status: Optional[str] = None  # confirmed | probable | unresolved
    fix: Optional[str] = None
    fix_strategy: Optional[str] = None
    validation: Optional[str] = None  # static | reasoning | runtime | none
    success: bool = False
    status: ExperienceStatus = ExperienceStatus.UNVALIDATED
    confidence: float = 0.0
    usefulness: float = 0.5  # adjusted by success/failure feedback
    tags: List[str] = field(default_factory=list)
    code_structure_hints: List[str] = field(default_factory=list)
    contradiction_notes: List[str] = field(default_factory=list)
    session_id: Optional[str] = None
    timestamp: float = field(default_factory=time.time)
    retrieval_count: int = 0
    last_retrieved: Optional[float] = None

    def __post_init__(self):
        if not self.id:
            self.id = "exp_" + uuid.uuid4().hex[:12]
        # sanitize sensitive data
        self.problem = sanitize_text(self.problem) or ""
        self.error = sanitize_text(self.error)
        self.root_cause = sanitize_text(self.root_cause)
        self.fix = sanitize_text(self.fix)
        self.validation = sanitize_text(self.validation)
        self.evidence_summary = [sanitize_text(s) or "" for s in (self.evidence_summary or [])][:20]

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["status"] = self.status.value if isinstance(self.status, ExperienceStatus) else self.status
        return d

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Experience":
        st = data.get("status", "unvalidated")
        if isinstance(st, str):
            try:
                st = ExperienceStatus(st)
            except ValueError:
                st = ExperienceStatus.UNVALIDATED
        return cls(
            id=data.get("id") or "",
            language=data.get("language"),
            problem=data.get("problem") or "",
            error=data.get("error"),
            error_type=data.get("error_type"),
            evidence_summary=data.get("evidence_summary") or [],
            evidence_ids=data.get("evidence_ids") or [],
            root_cause=data.get("root_cause"),
            root_cause_status=data.get("root_cause_status"),
            fix=data.get("fix"),
            fix_strategy=data.get("fix_strategy"),
            validation=data.get("validation"),
            success=bool(data.get("success")),
            status=st,
            confidence=float(data.get("confidence") or 0.0),
            usefulness=float(data.get("usefulness") or 0.5),
            tags=data.get("tags") or [],
            code_structure_hints=data.get("code_structure_hints") or [],
            contradiction_notes=data.get("contradiction_notes") or [],
            session_id=data.get("session_id"),
            timestamp=float(data.get("timestamp") or time.time()),
            retrieval_count=int(data.get("retrieval_count") or 0),
            last_retrieved=data.get("last_retrieved"),
        )

    def is_valid_for_storage(self) -> bool:
        """Only store experiences with enough substance; incomplete ones are not truth."""
        if not self.problem and not self.error:
            return False
        if self.status == ExperienceStatus.INVALID:
            return False
        # require at least some evidence or a root cause statement
        if not self.evidence_summary and not self.root_cause:
            return False
        return True
