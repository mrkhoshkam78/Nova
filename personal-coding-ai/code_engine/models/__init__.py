"""Standard data models for Code Intelligence Engine."""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Any, Dict, List, Optional
import hashlib
import time
import uuid


class Severity(str, Enum):
    CONFIRMED = "confirmed"
    HIGH = "high"
    LIKELY = "likely"
    POSSIBLE = "possible"
    WEAK = "weak"
    INFO = "info"


class AnalysisSource(str, Enum):
    PARSER = "parser"
    STATIC = "static"
    HEURISTIC = "heuristic"
    RUNTIME = "runtime"
    SCOPE = "scope"
    DEPENDENCY = "dependency"
    STRUCTURE = "structure"
    USER = "user"


class FindingCategory(str, Enum):
    SYNTAX = "syntax"
    SCOPE = "scope"
    REFERENCE = "reference"
    IMPORT = "import"
    DECLARATION = "declaration"
    STYLE = "style"
    SECURITY = "security"
    PERFORMANCE = "performance"
    LOGIC = "logic"
    STRUCTURE = "structure"
    OTHER = "other"


@dataclass
class SourceLocation:
    file: Optional[str] = None
    line: Optional[int] = None
    column: Optional[int] = None
    end_line: Optional[int] = None
    end_column: Optional[int] = None
    offset: Optional[int] = None
    length: Optional[int] = None

    def to_dict(self) -> Dict[str, Any]:
        return {k: v for k, v in asdict(self).items() if v is not None}


@dataclass
class Evidence:
    id: str
    source: AnalysisSource
    message: str
    reliability: Severity = Severity.POSSIBLE
    category: FindingCategory = FindingCategory.OTHER
    location: Optional[SourceLocation] = None
    related_symbols: List[str] = field(default_factory=list)
    raw: Optional[Dict[str, Any]] = None
    confidence: float = 0.5

    def __post_init__(self):
        if not self.id:
            self.id = "ev_" + uuid.uuid4().hex[:12]

    def to_dict(self) -> Dict[str, Any]:
        d = {
            "id": self.id,
            "source": self.source.value if isinstance(self.source, AnalysisSource) else self.source,
            "message": self.message,
            "reliability": self.reliability.value if isinstance(self.reliability, Severity) else self.reliability,
            "category": self.category.value if isinstance(self.category, FindingCategory) else self.category,
            "confidence": self.confidence,
            "related_symbols": self.related_symbols,
        }
        if self.location:
            d["location"] = self.location.to_dict()
        if self.raw:
            d["raw"] = self.raw
        return d


@dataclass
class Finding:
    id: str
    category: FindingCategory
    severity: Severity
    confidence: float
    message: str
    evidence_source: AnalysisSource
    file: Optional[str] = None
    location: Optional[SourceLocation] = None
    related_symbols: List[str] = field(default_factory=list)
    evidence_ids: List[str] = field(default_factory=list)
    fix_hint: Optional[str] = None

    def __post_init__(self):
        if not self.id:
            self.id = "find_" + uuid.uuid4().hex[:12]

    def to_dict(self) -> Dict[str, Any]:
        d = {
            "id": self.id,
            "category": self.category.value if isinstance(self.category, FindingCategory) else self.category,
            "severity": self.severity.value if isinstance(self.severity, Severity) else self.severity,
            "confidence": self.confidence,
            "message": self.message,
            "evidence_source": self.evidence_source.value if isinstance(self.evidence_source, AnalysisSource) else self.evidence_source,
            "file": self.file,
            "related_symbols": self.related_symbols,
            "evidence_ids": self.evidence_ids,
        }
        if self.location:
            d["location"] = self.location.to_dict()
        if self.fix_hint:
            d["fix_hint"] = self.fix_hint
        return d


@dataclass
class Capability:
    language: str
    has_parser: bool = False
    has_ast: bool = False
    has_scope: bool = False
    has_imports: bool = False
    has_symbols: bool = False
    has_control_flow: bool = False
    has_data_flow: bool = False
    parser_name: Optional[str] = None
    notes: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class LanguageResult:
    language: str
    confidence: float
    signals: List[str] = field(default_factory=list)
    detector_version: str = "1.0.0"

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class ParseResult:
    status: str  # "ok" | "error" | "unsupported" | "partial"
    language: str
    ast_available: bool = False
    syntax_errors: List[Dict[str, Any]] = field(default_factory=list)
    source_locations: List[SourceLocation] = field(default_factory=list)
    parser_capability: Optional[Capability] = None
    ast: Optional[Any] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        d = {
            "status": self.status,
            "language": self.language,
            "ast_available": self.ast_available,
            "syntax_errors": self.syntax_errors,
            "metadata": self.metadata,
        }
        if self.parser_capability:
            d["parser_capability"] = self.parser_capability.to_dict()
        return d


@dataclass
class SymbolInfo:
    name: str
    kind: str
    location: Optional[SourceLocation] = None
    scope_id: Optional[str] = None
    is_declaration: bool = True
    references: List[SourceLocation] = field(default_factory=list)
    is_used: bool = False

    def to_dict(self) -> Dict[str, Any]:
        d = {
            "name": self.name,
            "kind": self.kind,
            "is_declaration": self.is_declaration,
            "is_used": self.is_used,
            "scope_id": self.scope_id,
        }
        if self.location:
            d["location"] = self.location.to_dict()
        if self.references:
            d["references"] = [r.to_dict() for r in self.references]
        return d


@dataclass
class StructureInfo:
    functions: List[Dict[str, Any]] = field(default_factory=list)
    classes: List[Dict[str, Any]] = field(default_factory=list)
    methods: List[Dict[str, Any]] = field(default_factory=list)
    modules: List[str] = field(default_factory=list)
    imports: List[Dict[str, Any]] = field(default_factory=list)
    exports: List[Dict[str, Any]] = field(default_factory=list)
    call_sites: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class AnalysisResult:
    id: str
    language: LanguageResult
    content_hash: str
    file_name: Optional[str] = None
    capabilities: Optional[Capability] = None
    parse: Optional[ParseResult] = None
    findings: List[Finding] = field(default_factory=list)
    evidence: List[Evidence] = field(default_factory=list)
    symbols: List[SymbolInfo] = field(default_factory=list)
    structure: Optional[StructureInfo] = None
    limitations: List[str] = field(default_factory=list)
    duration_ms: float = 0.0
    created_at: float = field(default_factory=time.time)
    version: str = "1.0.0"

    def __post_init__(self):
        if not self.id:
            self.id = "ar_" + uuid.uuid4().hex[:12]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "language": self.language.to_dict() if self.language else None,
            "content_hash": self.content_hash,
            "file_name": self.file_name,
            "capabilities": self.capabilities.to_dict() if self.capabilities else None,
            "parse": self.parse.to_dict() if self.parse else None,
            "findings": [f.to_dict() for f in self.findings],
            "evidence": [e.to_dict() for e in self.evidence],
            "symbols": [s.to_dict() for s in self.symbols],
            "structure": self.structure.to_dict() if self.structure else None,
            "limitations": self.limitations,
            "duration_ms": self.duration_ms,
            "created_at": self.created_at,
            "version": self.version,
        }


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", errors="replace")).hexdigest()[:32]
