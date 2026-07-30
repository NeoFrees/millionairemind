"""Append-only audit log on SQLite.

No UPDATE and no DELETE statements exist in this module — that is the point.
Every agent action, risk verdict, order and approval lands here so the full
decision trail is replayable after the fact.
"""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_SCHEMA = """
CREATE TABLE IF NOT EXISTS audit (
  seq       INTEGER PRIMARY KEY AUTOINCREMENT,
  at        TEXT    NOT NULL,
  agent     TEXT    NOT NULL,
  action    TEXT    NOT NULL,
  subject   TEXT,
  severity  TEXT    NOT NULL DEFAULT 'info',
  detail    TEXT,
  payload   TEXT
);
CREATE INDEX IF NOT EXISTS audit_at_idx ON audit(at);
CREATE INDEX IF NOT EXISTS audit_subject_idx ON audit(subject);
"""


class AuditLog:
    def __init__(self, db_path: str) -> None:
        self.path = db_path
        if db_path != ":memory:":
            Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.executescript(_SCHEMA)
        self._conn.commit()

    def write(
        self,
        agent: str,
        action: str,
        subject: str | None = None,
        detail: str = "",
        severity: str = "info",
        payload: dict[str, Any] | None = None,
    ) -> int:
        cur = self._conn.execute(
            "INSERT INTO audit (at, agent, action, subject, severity, detail, payload)"
            " VALUES (?,?,?,?,?,?,?)",
            (
                datetime.now(timezone.utc).isoformat(),
                agent,
                action,
                subject,
                severity,
                detail,
                json.dumps(payload or {}, default=str),
            ),
        )
        self._conn.commit()
        return int(cur.lastrowid or 0)

    def tail(self, limit: int = 100, subject: str | None = None) -> list[dict]:
        if subject:
            rows = self._conn.execute(
                "SELECT * FROM audit WHERE subject = ? ORDER BY seq DESC LIMIT ?",
                (subject, limit),
            ).fetchall()
        else:
            rows = self._conn.execute(
                "SELECT * FROM audit ORDER BY seq DESC LIMIT ?", (limit,)
            ).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            try:
                d["payload"] = json.loads(d.get("payload") or "{}")
            except json.JSONDecodeError:
                d["payload"] = {}
            out.append(d)
        return out

    def count(self) -> int:
        return int(self._conn.execute("SELECT COUNT(*) FROM audit").fetchone()[0])

    def close(self) -> None:
        self._conn.close()
