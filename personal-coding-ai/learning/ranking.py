"""Memory ranking helpers (used by retrieval + brain)."""

from __future__ import annotations

from typing import Dict, List, Tuple

from learning.experience import Experience


def rank_memories(
    scored: List[Tuple[Experience, Dict[str, float]]],
) -> List[Tuple[Experience, Dict[str, float]]]:
    """Stable rank: overall relevance, then usefulness, then success."""
    return sorted(
        scored,
        key=lambda x: (
            x[1].get("overall", 0.0),
            x[0].usefulness,
            1 if x[0].success else 0,
            x[0].timestamp,
        ),
        reverse=True,
    )
