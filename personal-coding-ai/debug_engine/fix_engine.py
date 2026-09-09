"""Fix generation and validation – only for selected root cause; never claim runtime fix without sandbox."""

from __future__ import annotations

from typing import List, Optional

from debug_engine.models import (
    SuggestedFix,
    FixStatus,
    RootCauseCandidate,
    FailureType,
    Hypothesis,
    EvidenceItem,
)


def generate_fix(
    root: RootCauseCandidate,
    failure_type: FailureType,
    hypotheses: List[Hypothesis],
    evidence: List[EvidenceItem],
    runtime_available: bool = False,
) -> Optional[SuggestedFix]:
    if not root or root.confidence < 0.40:
        return None

    strategy = "Add defensive checks and validate inputs on the path to the failure point."
    patch = "// Validate inputs at boundaries\n// Add null/empty guards before use\n"

    summary = (root.summary or "").lower()
    if failure_type == FailureType.SYNTAX:
        strategy = "Correct syntax so the file parses; then re-run analysis."
        patch = "# Fix syntax at the reported parser location, then re-analyze.\n"
    elif failure_type == FailureType.DEPENDENCY:
        strategy = "Install missing package or correct the import path."
        patch = "# pip install <package>  OR  fix import path / module name\n"
    elif any(k in summary for k in ("null", "undefined", "none", "empty")):
        strategy = "Guard against null/undefined/None before property or index access."
        patch = (
            "if (value == null) {\n"
            "  // handle missing value\n"
            "  return;\n"
            "}\n"
        )
    elif "bare except" in summary or "except:" in summary:
        strategy = "Catch specific exceptions instead of bare except."
        patch = "except (ValueError, KeyError) as e:\n    # handle specifically\n    raise\n"
    elif "== none" in summary or "is none" in summary:
        strategy = "Use identity comparison for None."
        patch = "if value is None:\n    ...\n"

    notes = [
        "Suggested fix is derived from static/evidence analysis only.",
    ]
    status = FixStatus.SUGGESTED
    if not runtime_available:
        notes.append("No runtime sandbox: fix cannot be confirmed by re-execution.")

    return SuggestedFix(
        strategy=strategy,
        patch_hint=patch,
        related_hypothesis_id=root.hypothesis_id,
        related_root_cause=root.summary,
        regression_risk="Medium — review callers of the changed path.",
        status=status,
        validation_notes=notes,
        note="Suggested Fix based on evidence. Not validated by execution." if not runtime_available else "Fix candidate; runtime validation available.",
    )


def validate_fix_static(
    fix: SuggestedFix,
    syntax_ok: Optional[bool] = None,
    static_ok: Optional[bool] = None,
) -> SuggestedFix:
    """Update fix status after re-analysis if available. Never mark runtime_confirmed without real sandbox."""
    if syntax_ok is True:
        fix.status = FixStatus.SYNTAX_VALIDATED
        fix.validation_notes.append("Syntax re-check passed on proposed region (static).")
    if static_ok is True and fix.status in (FixStatus.SUGGESTED, FixStatus.SYNTAX_VALIDATED):
        fix.status = FixStatus.STATIC_VALIDATED
        fix.validation_notes.append("Static re-analysis improved after conceptual patch.")
    if syntax_ok is False:
        fix.status = FixStatus.REJECTED
        fix.validation_notes.append("Syntax still failing after suggested change direction.")
    return fix
