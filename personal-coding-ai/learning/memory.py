"""Persistent SQLite memory store for Learning Brain."""

from __future__ import annotations

import json
import os
import sqlite3
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from learning.experience import Experience, ExperienceStatus


DEFAULT_DB_PATH = os.environ.get(
    "NOVA_MEMORY_DB",
    str(Path(__file__).resolve().parent.parent / "data" / "nova_memory.db"),
)


class MemoryStore:
    """SQLite-backed experience memory with insert/retrieve/update/search/ranking."""

    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path or DEFAULT_DB_PATH
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS experiences (
                    id TEXT PRIMARY KEY,
                    language TEXT,
                    problem TEXT,
                    error TEXT,
                    error_type TEXT,
                    evidence_summary TEXT,
                    evidence_ids TEXT,
                    root_cause TEXT,
                    root_cause_status TEXT,
                    fix TEXT,
                    fix_strategy TEXT,
                    validation TEXT,
                    success INTEGER,
                    status TEXT,
                    confidence REAL,
                    usefulness REAL,
                    tags TEXT,
                    code_structure_hints TEXT,
                    contradiction_notes TEXT,
                    session_id TEXT,
                    timestamp REAL,
                    retrieval_count INTEGER DEFAULT 0,
                    last_retrieved REAL
                )
            """)
            # Indexes for common search paths
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_exp_language ON experiences(language)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_exp_error_type ON experiences(error_type)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_exp_status ON experiences(status)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_exp_timestamp ON experiences(timestamp DESC)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_exp_usefulness ON experiences(usefulness DESC)"
            )
            # Simple FTS for problem/error/root_cause when available
            try:
                conn.execute("""
                    CREATE VIRTUAL TABLE IF NOT EXISTS experiences_fts USING fts5(
                        id UNINDEXED,
                        problem,
                        error,
                        root_cause,
                        tags,
                        content='experiences',
                        content_rowid='rowid'
                    )
                """)
            except sqlite3.OperationalError:
                pass  # FTS5 may be unavailable in some builds
            conn.commit()

    def insert(self, exp: Experience) -> bool:
        if not exp.is_valid_for_storage():
            return False
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO experiences (
                    id, language, problem, error, error_type,
                    evidence_summary, evidence_ids, root_cause, root_cause_status,
                    fix, fix_strategy, validation, success, status,
                    confidence, usefulness, tags, code_structure_hints,
                    contradiction_notes, session_id, timestamp,
                    retrieval_count, last_retrieved
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    exp.id,
                    exp.language,
                    exp.problem,
                    exp.error,
                    exp.error_type,
                    json.dumps(exp.evidence_summary, ensure_ascii=False),
                    json.dumps(exp.evidence_ids, ensure_ascii=False),
                    exp.root_cause,
                    exp.root_cause_status,
                    exp.fix,
                    exp.fix_strategy,
                    exp.validation,
                    1 if exp.success else 0,
                    exp.status.value if isinstance(exp.status, ExperienceStatus) else exp.status,
                    exp.confidence,
                    exp.usefulness,
                    json.dumps(exp.tags, ensure_ascii=False),
                    json.dumps(exp.code_structure_hints, ensure_ascii=False),
                    json.dumps(exp.contradiction_notes, ensure_ascii=False),
                    exp.session_id,
                    exp.timestamp,
                    exp.retrieval_count,
                    exp.last_retrieved,
                ),
            )
            try:
                conn.execute(
                    "INSERT OR REPLACE INTO experiences_fts(rowid, id, problem, error, root_cause, tags) "
                    "SELECT rowid, id, problem, error, root_cause, tags FROM experiences WHERE id=?",
                    (exp.id,),
                )
            except sqlite3.OperationalError:
                pass
            conn.commit()
        return True

    def get(self, exp_id: str) -> Optional[Experience]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM experiences WHERE id=?", (exp_id,)
            ).fetchone()
        if not row:
            return None
        return self._row_to_exp(row)

    def update(self, exp: Experience) -> bool:
        return self.insert(exp)

    def delete(self, exp_id: str) -> bool:
        with self._connect() as conn:
            cur = conn.execute("DELETE FROM experiences WHERE id=?", (exp_id,))
            try:
                conn.execute("DELETE FROM experiences_fts WHERE id=?", (exp_id,))
            except sqlite3.OperationalError:
                pass
            conn.commit()
            return cur.rowcount > 0

    def _row_to_exp(self, row: sqlite3.Row) -> Experience:
        def _json(val, default):
            if val is None:
                return default
            try:
                return json.loads(val)
            except (TypeError, json.JSONDecodeError):
                return default

        return Experience.from_dict({
            "id": row["id"],
            "language": row["language"],
            "problem": row["problem"],
            "error": row["error"],
            "error_type": row["error_type"],
            "evidence_summary": _json(row["evidence_summary"], []),
            "evidence_ids": _json(row["evidence_ids"], []),
            "root_cause": row["root_cause"],
            "root_cause_status": row["root_cause_status"],
            "fix": row["fix"],
            "fix_strategy": row["fix_strategy"],
            "validation": row["validation"],
            "success": bool(row["success"]),
            "status": row["status"],
            "confidence": row["confidence"],
            "usefulness": row["usefulness"],
            "tags": _json(row["tags"], []),
            "code_structure_hints": _json(row["code_structure_hints"], []),
            "contradiction_notes": _json(row["contradiction_notes"], []),
            "session_id": row["session_id"],
            "timestamp": row["timestamp"],
            "retrieval_count": row["retrieval_count"] or 0,
            "last_retrieved": row["last_retrieved"],
        })


    def find_duplicate(
        self,
        *,
        language: Optional[str] = None,
        error: Optional[str] = None,
        error_type: Optional[str] = None,
        root_cause: Optional[str] = None,
        problem: Optional[str] = None,
    ) -> Optional[Experience]:
        """Simple duplicate detection: same language + error_type + similar error/root_cause."""
        candidates = self.search(
            language=language,
            error_type=error_type,
            limit=30,
        )
        err_l = (error or "").lower().strip()
        rc_l = (root_cause or "").lower().strip()
        prob_l = (problem or "").lower().strip()[:120]
        for e in candidates:
            e_err = (e.error or "").lower().strip()
            e_rc = (e.root_cause or "").lower().strip()
            e_prob = (e.problem or "").lower().strip()[:120]
            if err_l and e_err and (err_l == e_err or err_l in e_err or e_err in err_l):
                if not root_cause or not e_rc or rc_l[:80] == e_rc[:80] or rc_l in e_rc or e_rc in rc_l:
                    return e
            if prob_l and e_prob and (prob_l == e_prob or prob_l in e_prob or e_prob in prob_l):
                if error_type and e.error_type and error_type.lower() == (e.error_type or "").lower():
                    return e
        return None

    def consolidate_or_insert(self, exp: Experience) -> Tuple[Experience, bool]:
        """Insert or update existing similar experience. Returns (exp, was_duplicate)."""
        dup = self.find_duplicate(
            language=exp.language,
            error=exp.error,
            error_type=exp.error_type,
            root_cause=exp.root_cause,
            problem=exp.problem,
        )
        if dup:
            # consolidate: bump usefulness slightly, keep best status
            dup.usefulness = max(dup.usefulness, exp.usefulness)
            dup.retrieval_count = (dup.retrieval_count or 0) + 1
            if exp.status.value in ("success", "validated") and dup.status.value not in ("success", "validated"):
                dup.status = exp.status
                dup.success = exp.success
            if exp.root_cause and (not dup.root_cause or len(exp.root_cause) > len(dup.root_cause or "")):
                dup.root_cause = exp.root_cause
            self.update(dup)
            return dup, True
        self.insert(exp)
        return exp, False

    def search(
        self,
        *,
        language: Optional[str] = None,
        error_type: Optional[str] = None,
        status: Optional[str] = None,
        success: Optional[bool] = None,
        query_text: Optional[str] = None,
        tags: Optional[List[str]] = None,
        limit: int = 20,
        min_usefulness: float = 0.0,
    ) -> List[Experience]:
        clauses: List[str] = []
        params: List[Any] = []

        if language:
            clauses.append("language = ?")
            params.append(language)
        if error_type:
            clauses.append("error_type = ?")
            params.append(error_type)
        if status:
            clauses.append("status = ?")
            params.append(status)
        if success is not None:
            clauses.append("success = ?")
            params.append(1 if success else 0)
        if min_usefulness > 0:
            clauses.append("usefulness >= ?")
            params.append(min_usefulness)

        # Candidate retrieval: pull a wider set, then filter/rank, then Top-K.
        # Never apply a tight LIMIT before text/tag filtering.
        candidate_limit = max(limit * 8, 80)
        where = (" WHERE " + " AND ".join(clauses)) if clauses else ""

        with self._connect() as conn:
            results: List[Experience] = []
            # Prefer FTS for candidate retrieval when query_text present
            if query_text:
                try:
                    fts_rows = conn.execute(
                        "SELECT e.* FROM experiences_fts f "
                        "JOIN experiences e ON e.id = f.id "
                        "WHERE experiences_fts MATCH ? "
                        + (" AND " + " AND ".join(clauses) if clauses else "")
                        + " ORDER BY rank LIMIT ?",
                        [query_text] + params + [candidate_limit],
                    ).fetchall()
                    results = [self._row_to_exp(r) for r in fts_rows]
                except (sqlite3.OperationalError, sqlite3.DatabaseError):
                    results = []
            if not results:
                sql = (
                    f"SELECT * FROM experiences{where} "
                    "ORDER BY usefulness DESC, timestamp DESC LIMIT ?"
                )
                rows = conn.execute(sql, params + [candidate_limit]).fetchall()
                results = [self._row_to_exp(r) for r in rows]

        # Post-filter by text (fallback / refine FTS)
        if query_text:
            q = query_text.lower()
            tokens = [t for t in q.replace(",", " ").split() if len(t) > 1]
            def _match(e: Experience) -> bool:
                blob = " ".join([
                    e.problem or "", e.error or "", e.root_cause or "",
                    " ".join(e.tags or []),
                ]).lower()
                if q in blob:
                    return True
                return any(t in blob for t in tokens)
            results = [e for e in results if _match(e)]

        if tags:
            tag_set = {t.lower() for t in tags}
            results = [
                e for e in results
                if tag_set.intersection({t.lower() for t in (e.tags or [])})
            ]

        return results[:limit]

    def record_retrieval(self, exp_id: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "UPDATE experiences SET retrieval_count = COALESCE(retrieval_count,0)+1, "
                "last_retrieved = ? WHERE id = ?",
                (time.time(), exp_id),
            )
            conn.commit()

    def adjust_usefulness(self, exp_id: str, delta: float, success: Optional[bool] = None) -> Optional[Experience]:
        exp = self.get(exp_id)
        if not exp:
            return None
        exp.usefulness = max(0.0, min(1.0, exp.usefulness + delta))
        if success is not None:
            exp.success = success
            exp.status = ExperienceStatus.SUCCESS if success else ExperienceStatus.FAILURE
            if success:
                exp.confidence = min(1.0, exp.confidence + 0.05)
            else:
                exp.confidence = max(0.0, exp.confidence - 0.1)
        self.update(exp)
        return exp

    def count(self) -> int:
        with self._connect() as conn:
            row = conn.execute("SELECT COUNT(*) AS c FROM experiences").fetchone()
            return int(row["c"]) if row else 0

    def clear_all(self) -> int:
        """Dangerous – for tests only."""
        with self._connect() as conn:
            cur = conn.execute("DELETE FROM experiences")
            try:
                conn.execute("DELETE FROM experiences_fts")
            except sqlite3.OperationalError:
                pass
            conn.commit()
            return cur.rowcount
