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

        where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
        sql = f"SELECT * FROM experiences{where} ORDER BY usefulness DESC, timestamp DESC LIMIT ?"
        params.append(limit)

        with self._connect() as conn:
            rows = conn.execute(sql, params).fetchall()

        results = [self._row_to_exp(r) for r in rows]

        # Optional text filter (simple contains; FTS when available)
        if query_text:
            q = query_text.lower()
            results = [
                e for e in results
                if (q in (e.problem or "").lower())
                or (q in (e.error or "").lower())
                or (q in (e.root_cause or "").lower())
                or any(q in t.lower() for t in (e.tags or []))
            ]

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
