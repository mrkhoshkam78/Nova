"""Debug Intelligence data models – independent of Chat/UI state."""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Any, Dict, List, Optional
import time
import uuid


class FailureType(str, Enum):
    """Hierarchical-compatible failure classification (Phase 3).

    Top-level values keep backward compatibility; finer-grained values
    (Reference, Scope, Type, Nullability, …) are preferred when evidence
    is specific enough.
    """
    SYNTAX = "Syntax"
    BUILD = "Build"
    RUNTIME = "Runtime"
    REFERENCE = "Reference"      # NameError / ReferenceError – unresolved identifier
    SCOPE = "Scope"              # wrong scope / shadowed / missing declaration
    TYPE = "Type"                # TypeError / type mismatch
    NULLABILITY = "Nullability"  # None/null/undefined access
    LOGIC = "Logic"
    STATE = "State"
    ASYNC = "Async"
    DEPENDENCY = "Dependency"
    CONFIGURATION = "Configuration"
    API = "API"
    PERFORMANCE = "Performance"
    SECURITY = "Security"
    INDEX = "Index"              # IndexError / out of range
    ATTRIBUTE = "Attribute"      # AttributeError
    UNKNOWN = "Unknown"


class ConfidenceLevel(str, Enum):
    CONFIRMED = "CONFIRMED"
    HIGH_PROBABILITY = "HIGH_PROBABILITY"
    POSSIBLE = "POSSIBLE"
    INSUFFICIENT_EVIDENCE = "INSUFFICIENT_EVIDENCE"


class SessionState(str, Enum):
    IDLE = "IDLE"
    INPUT_COLLECTED = "INPUT_COLLECTED"
    CLASSIFIED = "CLASSIFIED"
    EVIDENCE_COLLECTED = "EVIDENCE_COLLECTED"
    LOCALIZED = "LOCALIZED"
    HYPOTHESIZED = "HYPOTHESIZED"
    RANKED = "RANKED"
    ROOT_CAUSE_SELECTED = "ROOT_CAUSE_SELECTED"
    FIX_GENERATED = "FIX_GENERATED"
    FIX_VALIDATED = "FIX_VALIDATED"
    RESOLVED = "RESOLVED"
    PARTIALLY_RESOLVED = "PARTIALLY_RESOLVED"
    INSUFFICIENT_EVIDENCE = "INSUFFICIENT_EVIDENCE"
    ANALYSIS_FAILED = "ANALYSIS_FAILED"


class FixStatus(str, Enum):
    SUGGESTED = "suggested"
    SYNTAX_VALIDATED = "syntax_validated"
    STATIC_VALIDATED = "static_validated"
    RUNTIME_CONFIRMED = "runtime_confirmed"  # only if real sandbox exists
    REJECTED = "rejected"


@dataclass
class DebugInput:
    source_code: Optional[str] = None
    language: Optional[str] = None  # explicit language for pipeline / code engine
    files: List[Dict[str, Any]] = field(default_factory=list)  # {name, content, language}
    error_message: Optional[str] = None
    stack_trace: Optional[str] = None
    user_description: Optional[str] = None
    expected_behavior: Optional[str] = None
    actual_behavior: Optional[str] = None
    code_structure: Optional[Dict[str, Any]] = None
    evidence: Optional[List[Dict[str, Any]]] = None  # pre-supplied evidence if any


@dataclass
class EvidenceItem:
    id: str
    source: str  # parser | static | scope | dependency | stack_trace | user_error | heuristic | runtime
    message: str
    reliability: str  # confirmed | high | possible | weak
    file: Optional[str] = None
    line: Optional[int] = None
    column: Optional[int] = None
    kind: str = "finding"
    related_symbols: List[str] = field(default_factory=list)
    confidence: float = 0.5
    analysis_result_id: Optional[str] = None

    def __post_init__(self):
        if not self.id:
            self.id = "ev_" + uuid.uuid4().hex[:10]

    def to_dict(self) -> Dict[str, Any]:
        return {k: v for k, v in asdict(self).items() if v is not None and v != []}


@dataclass
class FailureRegion:
    file: Optional[str] = None
    line: Optional[int] = None
    column: Optional[int] = None
    message: Optional[str] = None
    evidence_ids: List[str] = field(default_factory=list)
    note: str = "Error location is a starting point, not the root cause."

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class Hypothesis:
    id: str
    cause: str
    supporting_evidence_ids: List[str] = field(default_factory=list)
    contradicting_evidence_ids: List[str] = field(default_factory=list)
    related_files: List[str] = field(default_factory=list)
    related_locations: List[Dict[str, Any]] = field(default_factory=list)
    causal_path: List[str] = field(default_factory=list)
    severity: str = "medium"  # low | medium | high | critical
    confidence: float = 0.3
    confidence_level: ConfidenceLevel = ConfidenceLevel.POSSIBLE
    scores: Dict[str, float] = field(default_factory=dict)
    label: str = ""

    def __post_init__(self):
        if not self.id:
            self.id = "hyp_" + uuid.uuid4().hex[:10]
        if not self.label:
            self.label = self.cause[:80]

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["confidence_level"] = self.confidence_level.value if isinstance(self.confidence_level, ConfidenceLevel) else self.confidence_level
        return d


@dataclass
class RootCauseCandidate:
    hypothesis_id: str
    summary: str
    confidence: float
    confidence_level: ConfidenceLevel
    causal_chain: List[str] = field(default_factory=list)
    supporting_evidence_ids: List[str] = field(default_factory=list)
    region: Optional[Dict[str, Any]] = None
    note: str = ""

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["confidence_level"] = self.confidence_level.value if isinstance(self.confidence_level, ConfidenceLevel) else self.confidence_level
        return d


@dataclass
class SuggestedFix:
    strategy: str
    patch_hint: str
    related_hypothesis_id: str
    related_root_cause: str
    regression_risk: str = "medium"
    status: FixStatus = FixStatus.SUGGESTED
    validation_notes: List[str] = field(default_factory=list)
    note: str = "Suggested fix based on static evidence. Not confirmed by execution."

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["status"] = self.status.value if isinstance(self.status, FixStatus) else self.status
        return d


@dataclass
class DebugSession:
    id: str
    state: SessionState = SessionState.IDLE
    created_at: float = field(default_factory=time.time)
    finished_at: Optional[float] = None
    input: DebugInput = field(default_factory=DebugInput)
    failure_type: FailureType = FailureType.UNKNOWN
    expected_behavior: str = "Not specified"
    actual_behavior: str = "Failure observed"
    evidence: List[EvidenceItem] = field(default_factory=list)
    analysis_results: List[Dict[str, Any]] = field(default_factory=list)  # from code_engine
    localization: Optional[FailureRegion] = None
    hypotheses: List[Hypothesis] = field(default_factory=list)
    root_cause: Optional[RootCauseCandidate] = None
    fix: Optional[SuggestedFix] = None
    limitations: List[str] = field(default_factory=list)
    runtime_available: bool = False
    # Phase 3 – Learning Brain
    related_memories: List[Dict[str, Any]] = field(default_factory=list)
    contradictions: List[str] = field(default_factory=list)
    learning: Optional[Dict[str, Any]] = None
    version: str = "3.0.0"

    def __post_init__(self):
        if not self.id:
            self.id = "dbg_" + uuid.uuid4().hex[:12]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "state": self.state.value if isinstance(self.state, SessionState) else self.state,
            "created_at": self.created_at,
            "finished_at": self.finished_at,
            "failure_type": self.failure_type.value if isinstance(self.failure_type, FailureType) else self.failure_type,
            "expected_behavior": self.expected_behavior,
            "actual_behavior": self.actual_behavior,
            "evidence": [e.to_dict() for e in self.evidence],
            "analysis_results": self.analysis_results,
            "localization": self.localization.to_dict() if self.localization else None,
            "hypotheses": [h.to_dict() for h in self.hypotheses],
            "root_cause": self.root_cause.to_dict() if self.root_cause else None,
            "fix": self.fix.to_dict() if self.fix else None,
            "limitations": self.limitations,
            "runtime_available": self.runtime_available,
            "related_memories": self.related_memories,
            "contradictions": self.contradictions,
            "learning": self.learning,
            "version": self.version,
        }
