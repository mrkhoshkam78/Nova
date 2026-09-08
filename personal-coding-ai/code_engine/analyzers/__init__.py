"""Language-specific analyzers with shared interface concept."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Set, Tuple
import ast as py_ast
import re

from code_engine.models import (
    Finding,
    Evidence,
    SourceLocation,
    SymbolInfo,
    StructureInfo,
    Severity,
    AnalysisSource,
    FindingCategory,
    Capability,
)
from code_engine.parsers import capability_for, parse


class BaseAnalyzer:
    language: str = "text"

    def get_capabilities(self) -> Capability:
        return capability_for(self.language)

    def analyze_syntax(self, source: str, file_name: Optional[str] = None) -> List[Finding]:
        return []

    def analyze_scope(self, source: str, file_name: Optional[str] = None, ast_obj: Any = None) -> Tuple[List[Finding], List[SymbolInfo]]:
        return [], []

    def analyze_imports(self, source: str, file_name: Optional[str] = None, ast_obj: Any = None) -> Tuple[List[Finding], List[Dict[str, Any]]]:
        return [], []

    def analyze_structure(self, source: str, file_name: Optional[str] = None, ast_obj: Any = None) -> StructureInfo:
        return StructureInfo()

    def analyze(self, source: str, file_name: Optional[str] = None, parse_result: Any = None) -> Dict[str, Any]:
        return {
            "findings": [],
            "symbols": [],
            "structure": StructureInfo(),
            "evidence": [],
            "imports": [],
        }


class PythonAnalyzer(BaseAnalyzer):
    language = "python"

    def analyze_syntax(self, source: str, file_name: Optional[str] = None) -> List[Finding]:
        pr = parse("python", source, file_name)
        from code_engine.parsers import findings_from_parse
        return findings_from_parse(pr, file_name)

    def analyze_scope(self, source: str, file_name: Optional[str] = None, ast_obj: Any = None) -> Tuple[List[Finding], List[SymbolInfo]]:
        findings: List[Finding] = []
        symbols: List[SymbolInfo] = []
        if ast_obj is None:
            try:
                ast_obj = py_ast.parse(source, filename=file_name or "<unknown>")
            except SyntaxError:
                return findings, symbols

        # Collect definitions and loads
        class ScopeVisitor(py_ast.NodeVisitor):
            def __init__(self):
                self.scopes: List[Dict[str, SymbolInfo]] = [{}]  # stack
                self.all_symbols: List[SymbolInfo] = []
                self.loads: List[Tuple[str, int]] = []  # name, lineno
                self.duplicates: List[Tuple[str, int, int]] = []

            def _current(self):
                return self.scopes[-1]

            def _define(self, name: str, kind: str, node: py_ast.AST):
                lineno = getattr(node, "lineno", None)
                loc = SourceLocation(file=file_name, line=lineno, column=getattr(node, "col_offset", None))
                if name in self._current():
                    prev = self._current()[name]
                    self.duplicates.append((name, prev.location.line if prev.location else 0, lineno or 0))
                sym = SymbolInfo(name=name, kind=kind, location=loc, scope_id=str(len(self.scopes) - 1), is_declaration=True)
                self._current()[name] = sym
                self.all_symbols.append(sym)

            def visit_FunctionDef(self, node: py_ast.FunctionDef):
                self._define(node.name, "function", node)
                self.scopes.append({})
                for arg in node.args.args:
                    self._define(arg.arg, "param", arg)
                self.generic_visit(node)
                self.scopes.pop()

            def visit_AsyncFunctionDef(self, node: py_ast.AsyncFunctionDef):
                self.visit_FunctionDef(node)  # type: ignore

            def visit_ClassDef(self, node: py_ast.ClassDef):
                self._define(node.name, "class", node)
                self.scopes.append({})
                self.generic_visit(node)
                self.scopes.pop()

            def visit_Name(self, node: py_ast.Name):
                if isinstance(node.ctx, py_ast.Store):
                    self._define(node.id, "variable", node)
                elif isinstance(node.ctx, py_ast.Load):
                    self.loads.append((node.id, getattr(node, "lineno", 0) or 0))
                self.generic_visit(node)

            def visit_Import(self, node: py_ast.Import):
                for alias in node.names:
                    name = alias.asname or alias.name.split(".")[0]
                    self._define(name, "import", node)
                self.generic_visit(node)

            def visit_ImportFrom(self, node: py_ast.ImportFrom):
                for alias in node.names:
                    if alias.name == "*":
                        continue
                    name = alias.asname or alias.name
                    self._define(name, "import", node)
                self.generic_visit(node)

            def visit_arg(self, node: py_ast.arg):
                # handled in function
                pass

        v = ScopeVisitor()
        v.visit(ast_obj)

        # Resolve loads against scopes (simple global+local approximation)
        defined_names: Set[str] = set()
        for s in v.all_symbols:
            defined_names.add(s.name)
            s.is_used = False

        builtins = {
            "print", "len", "range", "str", "int", "float", "list", "dict", "set", "tuple",
            "True", "False", "None", "type", "isinstance", "hasattr", "getattr", "setattr",
            "open", "super", "enumerate", "zip", "map", "filter", "sorted", "sum", "min", "max",
            "abs", "round", "Exception", "ValueError", "TypeError", "KeyError", "IndexError",
            "AttributeError", "ImportError", "RuntimeError", "StopIteration", "object",
            "__name__", "__file__", "__all__", "self", "cls",
        }

        for name, lineno in v.loads:
            if name in builtins:
                continue
            found = False
            for s in v.all_symbols:
                if s.name == name and s.is_declaration:
                    s.is_used = True
                    found = True
                    break
            if not found and name not in defined_names:
                findings.append(Finding(
                    id="",
                    category=FindingCategory.REFERENCE,
                    severity=Severity.LIKELY,
                    confidence=0.7,
                    message=f"Possible undefined reference: '{name}'",
                    evidence_source=AnalysisSource.SCOPE,
                    file=file_name,
                    location=SourceLocation(file=file_name, line=lineno),
                    related_symbols=[name],
                ))

        for name, line1, line2 in v.duplicates:
            findings.append(Finding(
                id="",
                category=FindingCategory.DECLARATION,
                severity=Severity.POSSIBLE,
                confidence=0.65,
                message=f"Duplicate declaration of '{name}' (lines {line1} and {line2})",
                evidence_source=AnalysisSource.SCOPE,
                file=file_name,
                location=SourceLocation(file=file_name, line=line2),
                related_symbols=[name],
            ))

        # unused
        for s in v.all_symbols:
            if s.kind in ("variable", "function", "import") and not s.is_used and s.name and not s.name.startswith("_"):
                if s.kind == "param":
                    continue
                findings.append(Finding(
                    id="",
                    category=FindingCategory.SCOPE,
                    severity=Severity.INFO,
                    confidence=0.5,
                    message=f"Possibly unused {s.kind}: '{s.name}'",
                    evidence_source=AnalysisSource.SCOPE,
                    file=file_name,
                    location=s.location,
                    related_symbols=[s.name],
                ))

        return findings, v.all_symbols

    def analyze_imports(self, source: str, file_name: Optional[str] = None, ast_obj: Any = None) -> Tuple[List[Finding], List[Dict[str, Any]]]:
        findings: List[Finding] = []
        imports: List[Dict[str, Any]] = []
        if ast_obj is None:
            try:
                ast_obj = py_ast.parse(source, filename=file_name or "<unknown>")
            except SyntaxError:
                return findings, imports

        for node in py_ast.walk(ast_obj):
            if isinstance(node, py_ast.Import):
                for alias in node.names:
                    imports.append({
                        "module": alias.name,
                        "name": alias.asname or alias.name,
                        "line": node.lineno,
                        "kind": "import",
                    })
            elif isinstance(node, py_ast.ImportFrom):
                mod = node.module or ""
                for alias in node.names:
                    imports.append({
                        "module": mod,
                        "name": alias.asname or alias.name,
                        "line": node.lineno,
                        "kind": "from",
                        "level": node.level,
                    })
        return findings, imports

    def analyze_structure(self, source: str, file_name: Optional[str] = None, ast_obj: Any = None) -> StructureInfo:
        info = StructureInfo()
        if ast_obj is None:
            try:
                ast_obj = py_ast.parse(source, filename=file_name or "<unknown>")
            except SyntaxError:
                return info

        for node in py_ast.walk(ast_obj):
            if isinstance(node, (py_ast.FunctionDef, py_ast.AsyncFunctionDef)):
                entry = {
                    "name": node.name,
                    "line": node.lineno,
                    "end_line": getattr(node, "end_lineno", None),
                    "args": [a.arg for a in node.args.args],
                    "async": isinstance(node, py_ast.AsyncFunctionDef),
                }
                # method vs function: crude – if parent is ClassDef
                info.functions.append(entry)
            elif isinstance(node, py_ast.ClassDef):
                info.classes.append({
                    "name": node.name,
                    "line": node.lineno,
                    "end_line": getattr(node, "end_lineno", None),
                    "bases": [py_ast.unparse(b) if hasattr(py_ast, "unparse") else getattr(b, "id", str(b)) for b in node.bases],
                })
            elif isinstance(node, py_ast.Call):
                func_name = None
                if isinstance(node.func, py_ast.Name):
                    func_name = node.func.id
                elif isinstance(node.func, py_ast.Attribute):
                    func_name = node.func.attr
                if func_name:
                    info.call_sites.append({
                        "name": func_name,
                        "line": getattr(node, "lineno", None),
                    })
        # imports filled by analyze_imports
        return info

    def analyze(self, source: str, file_name: Optional[str] = None, parse_result: Any = None) -> Dict[str, Any]:
        ast_obj = parse_result.ast if parse_result and getattr(parse_result, "ast_available", False) else None
        syn = self.analyze_syntax(source, file_name) if not (parse_result and parse_result.syntax_errors) else []
        if parse_result and parse_result.syntax_errors:
            from code_engine.parsers import findings_from_parse
            syn = findings_from_parse(parse_result, file_name)

        scope_findings, symbols = self.analyze_scope(source, file_name, ast_obj)
        imp_findings, imports = self.analyze_imports(source, file_name, ast_obj)
        structure = self.analyze_structure(source, file_name, ast_obj)
        structure.imports = imports

        # Heuristic extras (lower priority)
        heur: List[Finding] = []
        lines = source.split("\n")
        for i, line in enumerate(lines, 1):
            if re.search(r"except\s*:", line):
                heur.append(Finding(
                    id="", category=FindingCategory.LOGIC, severity=Severity.LIKELY,
                    confidence=0.75, message="Bare except: catches all exceptions",
                    evidence_source=AnalysisSource.HEURISTIC, file=file_name,
                    location=SourceLocation(file=file_name, line=i),
                ))
            if re.search(r"==\s*None|!=\s*None", line):
                heur.append(Finding(
                    id="", category=FindingCategory.STYLE, severity=Severity.LIKELY,
                    confidence=0.8, message="Use 'is None' / 'is not None' instead of ==/!=",
                    evidence_source=AnalysisSource.HEURISTIC, file=file_name,
                    location=SourceLocation(file=file_name, line=i),
                    fix_hint="value is None",
                ))

        all_findings = syn + scope_findings + imp_findings + heur
        evidence = [
            Evidence(
                id="",
                source=f.evidence_source,
                message=f.message,
                reliability=f.severity,
                category=f.category,
                location=f.location,
                related_symbols=f.related_symbols,
                confidence=f.confidence,
            )
            for f in all_findings
        ]
        return {
            "findings": all_findings,
            "symbols": symbols,
            "structure": structure,
            "evidence": evidence,
            "imports": imports,
        }


class JavaScriptAnalyzer(BaseAnalyzer):
    language = "javascript"

    def analyze_imports(self, source: str, file_name: Optional[str] = None, ast_obj: Any = None) -> Tuple[List[Finding], List[Dict[str, Any]]]:
        findings: List[Finding] = []
        imports: List[Dict[str, Any]] = []
        # ES modules
        for m in re.finditer(r"""^\s*import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"]([^'"]+)['"]""", source, re.M):
            imports.append({"module": m.group(1), "line": source[:m.start()].count("\n") + 1, "kind": "import"})
        # require
        for m in re.finditer(r"""require\s*\(\s*['"]([^'"]+)['"]\s*\)""", source):
            imports.append({"module": m.group(1), "line": source[:m.start()].count("\n") + 1, "kind": "require"})
        return findings, imports

    def analyze_structure(self, source: str, file_name: Optional[str] = None, ast_obj: Any = None) -> StructureInfo:
        info = StructureInfo()
        for m in re.finditer(r"""(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?(?:function|\([^)]*\)\s*=>))""", source):
            name = m.group(1) or m.group(2)
            line = source[:m.start()].count("\n") + 1
            info.functions.append({"name": name, "line": line})
        for m in re.finditer(r"""class\s+(\w+)""", source):
            info.classes.append({"name": m.group(1), "line": source[:m.start()].count("\n") + 1})
        _, imports = self.analyze_imports(source, file_name)
        info.imports = imports
        return info

    def analyze_syntax(self, source: str, file_name: Optional[str] = None) -> List[Finding]:
        pr = parse("javascript", source, file_name)
        from code_engine.parsers import findings_from_parse
        return findings_from_parse(pr, file_name)

    def analyze(self, source: str, file_name: Optional[str] = None, parse_result: Any = None) -> Dict[str, Any]:
        syn = self.analyze_syntax(source, file_name)
        _, imports = self.analyze_imports(source, file_name)
        structure = self.analyze_structure(source, file_name)
        heur: List[Finding] = []
        lines = source.split("\n")
        for i, line in enumerate(lines, 1):
            if re.search(r"\bvar\s+", line):
                heur.append(Finding(
                    id="", category=FindingCategory.STYLE, severity=Severity.POSSIBLE,
                    confidence=0.6, message="Prefer const/let over var",
                    evidence_source=AnalysisSource.HEURISTIC, file=file_name,
                    location=SourceLocation(file=file_name, line=i),
                ))
            if re.search(r"==(?!=)", line) and "===" not in line:
                heur.append(Finding(
                    id="", category=FindingCategory.LOGIC, severity=Severity.LIKELY,
                    confidence=0.75, message="Use === instead of ==",
                    evidence_source=AnalysisSource.HEURISTIC, file=file_name,
                    location=SourceLocation(file=file_name, line=i),
                ))
            if re.search(r"\beval\s*\(", line):
                heur.append(Finding(
                    id="", category=FindingCategory.SECURITY, severity=Severity.CONFIRMED,
                    confidence=0.95, message="eval() is dangerous",
                    evidence_source=AnalysisSource.HEURISTIC, file=file_name,
                    location=SourceLocation(file=file_name, line=i),
                ))
        all_findings = syn + heur
        evidence = [
            Evidence(
                id="", source=f.evidence_source, message=f.message,
                reliability=f.severity, category=f.category,
                location=f.location, confidence=f.confidence,
            ) for f in all_findings
        ]
        return {
            "findings": all_findings,
            "symbols": [],
            "structure": structure,
            "evidence": evidence,
            "imports": imports,
        }


class JsonAnalyzer(BaseAnalyzer):
    language = "json"

    def analyze(self, source: str, file_name: Optional[str] = None, parse_result: Any = None) -> Dict[str, Any]:
        from code_engine.parsers import findings_from_parse, parse as do_parse
        pr = parse_result or do_parse("json", source, file_name)
        findings = findings_from_parse(pr, file_name)
        evidence = [
            Evidence(id="", source=f.evidence_source, message=f.message,
                     reliability=f.severity, category=f.category, location=f.location, confidence=f.confidence)
            for f in findings
        ]
        return {"findings": findings, "symbols": [], "structure": StructureInfo(), "evidence": evidence, "imports": []}


class GenericAnalyzer(BaseAnalyzer):
    language = "text"

    def analyze(self, source: str, file_name: Optional[str] = None, parse_result: Any = None) -> Dict[str, Any]:
        findings: List[Finding] = []
        if len(source) > 50000:
            findings.append(Finding(
                id="", category=FindingCategory.OTHER, severity=Severity.INFO,
                confidence=0.5, message="Very large file; analysis is shallow",
                evidence_source=AnalysisSource.HEURISTIC, file=file_name,
            ))
        if re.search(r"password\s*=\s*['\"][^'\"]+['\"]|api[_-]?key\s*=\s*['\"][^'\"]+['\"]", source, re.I):
            findings.append(Finding(
                id="", category=FindingCategory.SECURITY, severity=Severity.LIKELY,
                confidence=0.7, message="Possible hard-coded secret",
                evidence_source=AnalysisSource.HEURISTIC, file=file_name,
            ))
        evidence = [
            Evidence(id="", source=f.evidence_source, message=f.message,
                     reliability=f.severity, category=f.category, location=f.location, confidence=f.confidence)
            for f in findings
        ]
        return {"findings": findings, "symbols": [], "structure": StructureInfo(), "evidence": evidence, "imports": []}


def get_analyzer(language: str) -> BaseAnalyzer:
    lang = (language or "").lower()
    if lang == "python":
        return PythonAnalyzer()
    if lang in ("javascript", "typescript"):
        return JavaScriptAnalyzer()
    if lang == "json":
        return JsonAnalyzer()
    return GenericAnalyzer()
