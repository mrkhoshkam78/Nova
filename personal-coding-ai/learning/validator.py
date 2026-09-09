"""Experience validation before storage / after feedback."""

from __future__ import annotations

from typing import Optional

from learning.experience import Experience, ExperienceStatus


def evaluate_for_storage(exp: Experience) -> bool:
    """Incomplete or invalid experiences must not be stored as truth."""
    return exp.is_valid_for_storage()


def apply_validation_feedback(
    exp: Experience,
    *,
    success: bool,
    notes: Optional[str] = None,
) -> Experience:
    """Update experience after validation outcome (static/reasoning only in Phase 3)."""
    if success:
        exp.success = True
        exp.status = ExperienceStatus.SUCCESS
        exp.usefulness = min(1.0, exp.usefulness + 0.15)
        exp.confidence = min(1.0, exp.confidence + 0.08)
    else:
        exp.success = False
        exp.status = ExperienceStatus.FAILURE
        exp.usefulness = max(0.05, exp.usefulness - 0.2)
        exp.confidence = max(0.0, exp.confidence - 0.12)
        if notes:
            exp.contradiction_notes.append(notes[:500])
    if notes and success:
        exp.validation = (exp.validation or "") + f" | feedback: {notes[:200]}"
    return exp
