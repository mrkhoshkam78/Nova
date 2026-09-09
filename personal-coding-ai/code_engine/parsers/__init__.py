"""Parser manager – real parsers only. No fake AST."""

from __future__ import annotations

from typing import Any, Dict, List, Optional
import ast as py_ast
import json
import re

from code_engine.models import (
    Capability,
    ParseResult,
    SourceLocation,
    AnalysisSource,
    Severity,
    FindingCategory,
    Evidence,
    Finding,
)


def capability_for(language: str) -> Capability:
    lang = (language or "").lower()
    if lang == "python":
        return Capability(
            language="python",
            has_parser=True,
            has_ast=True,
            has_scope=True,
            has_imports=True,
            has_symbols=True,
            has_control_flow=False,
            has_data_flow=False,
            parser_name="python-ast (stdlib)",
            notes=["Full AST via stdlib ast module", "Syntax errors reported with lineno"],
        )
    if lang in ("javascript", "typescript"):
        return Capability(
            language=lang,
            has_parser=False,
            has_ast=False,
            has_scope=False,
            has_imports=True,  # lightweight regex
            has_symbols=False,
            has_control_flow=False,
            has_data_flow=False,
            parser_name=None,
            notes=[
                "No real JS/TS parser available in this environment without external deps.",
                "AST_AVAILABLE = false",
                "Falls back to lightweight structural + heuristic analysis.",
            ],
        )
    if lang == "json":
        return Capability(
            language="json",
            has_parser=True,
            has_ast=False,
            has_scope=False,
            has_imports=False,
            has_symbols=False,
            parser_name="json.loads",
            notes=["Structural validation only"],
        )
    if lang in ("html", "css"):
        return Capability(
            language=lang,
            has_parser=False,
            has_ast=False,
            has_scope=False,
            has_imports=False,
            has_symbols=False,
            parser_name=None,
            notes=["Lightweight structural checks only; no full DOM/CSSOM parser"],
        )
    return Capability(
        language=lang or "unknown",
        has_parser=False,
        has_ast=False,
        notes=["Unsupported language for deep parsing"],
    )


def parse_python(source: str, file_name: Optional[str] = None) -> ParseResult:
    cap = capability_for("python")
    try:
        tree = py_ast.parse(source, filename=file_name or "<unknown>")
        return ParseResult(
            status="ok",
            language="python",
            ast_available=True,
            syntax_errors=[],
            parser_capability=cap,
            ast=tree,
            metadata={"node_count": sum(1 for _ in py_ast.walk(tree))},
        )
    except SyntaxError as e:
        err = {
            "message": e.msg or str(e),
            "line": e.lineno,
            "column": e.offset,
            "text": e.text,
            "filename": e.filename or file_name,
        }
        return ParseResult(
            status="error",
            language="python",
            ast_available=False,
            syntax_errors=[err],
            parser_capability=cap,
            ast=None,
            metadata={},
        )
    except Exception as e:
        return ParseResult(
            status="error",
            language="python",
            ast_available=False,
            syntax_errors=[{"message": str(e), "line": None, "column": None}],
            parser_capability=cap,
            ast=None,
        )


def parse_json(source: str, file_name: Optional[str] = None) -> ParseResult:
    cap = capability_for("json")
    try:
        data = json.loads(source)
        return ParseResult(
            status="ok",
            language="json",
            ast_available=False,
            syntax_errors=[],
            parser_capability=cap,
            ast=None,
            metadata={"type": type(data).__name__},
        )
    except json.JSONDecodeError as e:
        return ParseResult(
            status="error",
            language="json",
            ast_available=False,
            syntax_errors=[{
                "message": e.msg,
                "line": e.lineno,
                "column": e.colno,
            }],
            parser_capability=cap,
        )


def parse_javascript_lightweight(source: str, file_name: Optional[str] = None) -> ParseResult:
    """No real AST. Report capability honestly and do brace/paren balance + obvious syntax hints."""
    cap = capability_for("javascript")
    errors: List[Dict[str, Any]] = []
    # unbalanced braces/parens/brackets
    pairs = [("{", "}"), ("(", ")"), ("[", "]")]
    for open_c, close_c in pairs:
        if source.count(open_c) != source.count(close_c):
            errors.append({
                "message": f"Unbalanced '{open_c}' / '{close_c}'",
                "line": None,
                "column": None,
            })
    # crude unterminated string
    # (skip for now – high false positive)
    status = "partial" if not errors else "error"
    if not errors:
        status = "ok"
    return ParseResult(
        status=status,
        language="javascript",
        ast_available=False,
        syntax_errors=errors,
        parser_capability=cap,
        ast=None,
        metadata={"note": "AST_AVAILABLE = false"},
    )


def parse(language: str, source: str, file_name: Optional[str] = None) -> ParseResult:
    lang = (language or "").lower()
    if lang == "python":
        return parse_python(source, file_name)
    if lang == "json":
        return parse_json(source, file_name)
    if lang in ("javascript", "typescript"):
        return parse_javascript_lightweight(source, file_name)
    if lang in ("html", "css"):
        return ParseResult(
            status="ok",
            language=lang,
            ast_available=False,
            syntax_errors=[],
            parser_capability=capability_for(lang),
            metadata={"note": "No full parser; structural heuristics only"},
        )
    return ParseResult(
        status="unsupported",
        language=lang or "unknown",
        ast_available=False,
        syntax_errors=[],
        parser_capability=capability_for(lang),
        metadata={"note": "No parser registered for this language"},
    )


def findings_from_parse(parse_result: ParseResult, file_name: Optional[str] = None) -> List[Finding]:
    out: List[Finding] = []
    for err in parse_result.syntax_errors:
        loc = SourceLocation(
            file=file_name,
            line=err.get("line"),
            column=err.get("column"),
        )
        out.append(Finding(
            id="",
            category=FindingCategory.SYNTAX,
            severity=Severity.CONFIRMED,
            confidence=0.95,
            message=err.get("message") or "Syntax error",
            evidence_source=AnalysisSource.PARSER,
            file=file_name,
            location=loc,
        ))
    return out
