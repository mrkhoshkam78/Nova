"""Learning Brain – extract, store, retrieve, and feed experiences into debug reasoning."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from learning.experience import Experience, ExperienceStatus
from learning.memory import MemoryStore
from learning.retrieval import retrieve_relevant, compute_relevance
from learning.patterns import extract_tags_from_text
from learning.validator import evaluate_for_storage, apply_validation_feedback


class LearningBrain:
    """Independent Learning Brain for Nova Debug Intelligence (Phase 3).

    Memory = Prior Experience. Evidence = Current Truth.
    Never lets memory override strong current evidence.
    """

    def __init__(self, db_path: Optional[str] = None):
        self.store = MemoryStore(db_path=db_path)

    # ------------------------------------------------------------------ extract
    def extract_from_session(self, session: Any) -> Optional[Experience]:
        """Build an Experience from a completed DebugSession (dict or object)."""
        if session is None:
            return None

        def g(obj, *keys, default=None):
            if isinstance(obj, dict):
                for k in keys:
                    if k in obj and obj[k] is not None:
                        return obj[k]
                return default
            for k in keys:
                if hasattr(obj, k):
                    v = getattr(obj, k)
                    if v is not None:
                        return v
            return default

        evidence_list = g(session, "evidence", default=[]) or []
        evidence_summary: List[str] = []
        evidence_ids: List[str] = []
        for e in evidence_list[:12]:
            if isinstance(e, dict):
                msg = e.get("message") or ""
                eid = e.get("id") or ""
            else:
                msg = getattr(e, "message", "") or ""
                eid = getattr(e, "id", "") or ""
            if msg:
                evidence_summary.append(msg[:300])
            if eid:
                evidence_ids.append(eid)

        root = g(session, "root_cause")
        root_stmt = None
        root_status = None
        if root:
            if isinstance(root, dict):
                root_stmt = root.get("summary") or root.get("statement")
                root_status = root.get("status") or (
                    "probable" if (root.get("confidence") or 0) >= 0.55 else "unresolved"
                )
                # map confidence_level if present
                cl = root.get("confidence_level")
                if cl in ("CONFIRMED", "confirmed"):
                    root_status = "confirmed"
                elif cl in ("HIGH_PROBABILITY", "high_probability"):
                    root_status = "probable"
                elif cl in ("INSUFFICIENT_EVIDENCE", "insufficient_evidence"):
                    root_status = "unresolved"
            else:
                root_stmt = getattr(root, "summary", None) or getattr(root, "statement", None)
                root_status = getattr(root, "status", None)

        fix_obj = g(session, "fix")
        fix_text = None
        fix_strategy = None
        if fix_obj:
            if isinstance(fix_obj, dict):
                fix_text = fix_obj.get("patch_hint") or fix_obj.get("strategy")
                fix_strategy = fix_obj.get("strategy")
            else:
                fix_text = getattr(fix_obj, "patch_hint", None) or getattr(fix_obj, "strategy", None)
                fix_strategy = getattr(fix_obj, "strategy", None)

        failure_type = g(session, "failure_type")
        if hasattr(failure_type, "value"):
            failure_type = failure_type.value
        failure_type = str(failure_type) if failure_type else None

        inp = g(session, "input") or {}
        if not isinstance(inp, dict):
            inp = {
                "error_message": getattr(inp, "error_message", None),
                "user_description": getattr(inp, "user_description", None),
                "source_code": getattr(inp, "source_code", None),
            }

        problem = (
            g(inp, "user_description", "userDescription")
            or g(session, "actual_behavior")
            or g(inp, "error_message", "errorMessage")
            or "Debug session"
        )
        error_msg = g(inp, "error_message", "errorMessage") or g(session, "actual_behavior")

        language = None
        files = g(inp, "files") or []
        if files and isinstance(files, list) and files:
            language = (files[0].get("language") if isinstance(files[0], dict) else None)
        if not language:
            # heuristic from code
            code = g(inp, "source_code", "sourceCode") or ""
            if "def " in code or "import " in code:
                language = "python"
            elif "function " in code or "const " in code or "=>" in code:
                language = "javascript"

        conf = 0.0
        if root and isinstance(root, dict):
            conf = float(root.get("confidence") or 0)
        elif root:
            conf = float(getattr(root, "confidence", 0) or 0)

        state = g(session, "state")
        if hasattr(state, "value"):
            state = state.value
        state = str(state or "")

        # Phase 3: no runtime sandbox → never claim definitive SUCCESS from static-only analysis.
        # PARTIALLY_RESOLVED means a reasoned candidate exists, not that the bug is fixed.
        success = state == "RESOLVED" and conf >= 0.7
        status = ExperienceStatus.UNVALIDATED
        if state == "INSUFFICIENT_EVIDENCE":
            status = ExperienceStatus.PARTIAL
        elif state == "RESOLVED" and conf >= 0.7:
            status = ExperienceStatus.SUCCESS
        elif state in ("PARTIALLY_RESOLVED", "FIX_VALIDATED", "FIX_GENERATED", "ROOT_CAUSE_SELECTED"):
            status = ExperienceStatus.PARTIAL
            success = False
        elif conf < 0.4:
            status = ExperienceStatus.PARTIAL

        tags = extract_tags_from_text(" ".join(filter(None, [problem, error_msg, root_stmt or "", failure_type or ""])))
        if failure_type:
            tags.append(failure_type.lower())

        exp = Experience(
            language=language,
            problem=str(problem)[:2000],
            error=str(error_msg)[:1000] if error_msg else None,
            error_type=failure_type,
            evidence_summary=evidence_summary,
            evidence_ids=evidence_ids,
            root_cause=root_stmt,
            root_cause_status=root_status,
            fix=fix_text,
            fix_strategy=fix_strategy,
            validation="reasoning" if conf >= 0.4 else "none",
            success=success,
            status=status,
            confidence=conf,
            usefulness=0.55 if success else 0.4,
            tags=list(dict.fromkeys(tags)),
            session_id=g(session, "id"),
        )
        if not evaluate_for_storage(exp):
            return None
        return exp

    def learn_from_session(self, session: Any) -> Optional[Experience]:
        """Extract + persist if valid."""
        exp = self.extract_from_session(session)
        if exp is None:
            return None
        if self.store.insert(exp):
            return exp
        return None

    def learn_from_validation(
        self,
        exp_id: str,
        *,
        success: bool,
        notes: Optional[str] = None,
    ) -> Optional[Experience]:
        exp = self.store.get(exp_id)
        if not exp:
            return None
        exp = apply_validation_feedback(exp, success=success, notes=notes)
        self.store.update(exp)
        return exp

    # ------------------------------------------------------------------ retrieve
    def retrieve_for_debug(
        self,
        *,
        language: Optional[str] = None,
        error_message: Optional[str] = None,
        error_type: Optional[str] = None,
        problem_text: Optional[str] = None,
        evidence_messages: Optional[List[str]] = None,
        code_hints: Optional[List[str]] = None,
        limit: int = 5,
    ) -> List[Dict[str, Any]]:
        """Return ranked related memories as plain dicts for debug pipeline."""
        ranked = retrieve_relevant(
            self.store,
            language=language,
            error_message=error_message,
            error_type=error_type,
            problem_text=problem_text,
            evidence_messages=evidence_messages,
            code_hints=code_hints,
            limit=limit,
            min_relevance=0.28,
        )
        out = []
        for exp, scores in ranked:
            d = exp.to_dict()
            d["relevance_scores"] = scores
            d["relevance"] = scores.get("overall", 0.0)
            out.append(d)
        return out

    def detect_memory_evidence_conflict(
        self,
        memories: List[Dict[str, Any]],
        current_evidence_messages: List[str],
    ) -> List[str]:
        """If a past memory strongly contradicts current evidence, record it."""
        conflicts: List[str] = []
        current_blob = " ".join(current_evidence_messages).lower()
        for m in memories:
            root = (m.get("root_cause") or "").lower()
            if not root:
                continue
            # simple contradiction heuristics
            if "null" in root and "not null" in current_blob:
                conflicts.append(
                    f"Memory {m.get('id')} suggested nullability root cause, "
                    "but current evidence indicates non-null path."
                )
            if m.get("success") is False and m.get("fix"):
                # failed past fix – warn not to re-apply blindly
                conflicts.append(
                    f"Past experience {m.get('id')} tried a similar fix and failed; "
                    "do not re-propose without new evidence."
                )
        return conflicts

    def memory_prior_boost(
        self,
        memories: List[Dict[str, Any]],
        hypothesis_statement: str,
    ) -> float:
        """Small prior boost/penalty from historical match. Never dominates evidence."""
        if not memories or not hypothesis_statement:
            return 0.0
        h_tokens = set(hypothesis_statement.lower().split())
        boost = 0.0
        for m in memories[:3]:
            root = (m.get("root_cause") or "").lower()
            if not root:
                continue
            overlap = len(h_tokens & set(root.split())) / max(1, len(h_tokens))
            rel = float(m.get("relevance") or 0)
            if overlap > 0.25 and rel > 0.4:
                if m.get("success"):
                    boost += 0.04 * rel
                else:
                    boost -= 0.06 * rel  # failed experience penalty
        return max(-0.12, min(0.10, boost))

    def stats(self) -> Dict[str, Any]:
        return {
            "total_experiences": self.store.count(),
            "db_path": self.store.db_path,
        }
