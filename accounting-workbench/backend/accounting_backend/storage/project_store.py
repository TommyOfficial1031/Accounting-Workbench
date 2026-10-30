"""SQLite-backed project metadata store.

Uses the standard-library ``sqlite3`` module with WAL journaling so concurrent
read/write requests from the frontend are safe. This module only reads and
writes; no business logic (AGENTS.md 分层约束).
"""

from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from typing import Any, Optional

from accounting_backend.storage.paths import ensure_dirs, get_projects_db_path

_SCHEMA_VERSION = "3"

_DDL = """
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    creator TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    source_path TEXT,
    source_type TEXT,
    row_count INTEGER,
    col_count INTEGER,
    analysis_config TEXT,
    has_result INTEGER DEFAULT 0,
    last_opened_at TEXT,
    saved_kind TEXT DEFAULT 'manual',
    state TEXT
);
CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name);
CREATE INDEX IF NOT EXISTS idx_projects_creator ON projects(creator);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at);
CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


def _connect() -> sqlite3.Connection:
    ensure_dirs()
    conn = sqlite3.connect(str(get_projects_db_path()))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    return conn


def _migrate(conn: sqlite3.Connection) -> None:
    """Idempotently add columns introduced after schema v1."""
    columns = {row[1] for row in conn.execute("PRAGMA table_info(projects)")}
    if "last_opened_at" not in columns:
        conn.execute("ALTER TABLE projects ADD COLUMN last_opened_at TEXT")
    if "saved_kind" not in columns:
        # manual = 用户点保存；auto = 没点保存就退出的自动保存
        conn.execute("ALTER TABLE projects ADD COLUMN saved_kind TEXT DEFAULT 'manual'")
    if "state" not in columns:
        # 分析 / 一键算 / 盈亏平衡 三个界面的输入快照（只存输入，不存结果）
        conn.execute("ALTER TABLE projects ADD COLUMN state TEXT")


def _ensure_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(_DDL)
    _migrate(conn)
    conn.execute(
        "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)",
        (_SCHEMA_VERSION,),
    )


@contextmanager
def _connection():
    conn = _connect()
    try:
        _ensure_schema(conn)
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    """Create tables, indexes, and the schema-version meta row if absent."""
    with _connection():
        pass


def _serialize_config(config: Any) -> Optional[str]:
    if config is None:
        return None
    if isinstance(config, str):
        return config
    return json.dumps(config, ensure_ascii=False)


def _row_to_dict(row: sqlite3.Row) -> dict:
    record = dict(row)
    raw = record.get("analysis_config")
    record["analysis_config"] = json.loads(raw) if raw else None
    raw_state = record.get("state")
    record["state"] = json.loads(raw_state) if raw_state else None
    record["saved_kind"] = record.get("saved_kind") or "manual"
    record["has_result"] = bool(record.get("has_result"))
    return record


def create_project(record: dict) -> dict:
    """Insert a new project record and return it unchanged."""
    with _connection() as conn:
        conn.execute(
            """
            INSERT INTO projects
                (id, name, creator, created_at, updated_at, source_path,
                 source_type, row_count, col_count, analysis_config, has_result,
                 last_opened_at, saved_kind, state)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                record["id"],
                record["name"],
                record["creator"],
                record["created_at"],
                record["updated_at"],
                record.get("source_path"),
                record.get("source_type"),
                record.get("row_count"),
                record.get("col_count"),
                _serialize_config(record.get("analysis_config")),
                int(record.get("has_result", False)),
                record.get("last_opened_at"),
                record.get("saved_kind") or "manual",
                _serialize_config(record.get("state")),
            ),
        )
    return record


_ORDER_COLUMNS = {"last_opened_at", "created_at", "updated_at"}


def _build_filters(
    name: Optional[str],
    creator: Optional[str],
    created_from: Optional[str],
    created_to: Optional[str],
) -> tuple[str, list]:
    clauses: list[str] = []
    params: list = []
    if name:
        clauses.append("name LIKE ? COLLATE NOCASE")
        params.append(f"%{name}%")
    if creator:
        clauses.append("creator LIKE ? COLLATE NOCASE")
        params.append(f"%{creator}%")
    if created_from:
        clauses.append("created_at >= ?")
        params.append(created_from)
    if created_to:
        clauses.append("created_at <= ?")
        params.append(created_to)
    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    return where, params


def query_projects(
    name: Optional[str] = None,
    creator: Optional[str] = None,
    created_from: Optional[str] = None,
    created_to: Optional[str] = None,
    order_by: str = "updated_at",
    offset: int = 0,
    limit: Optional[int] = None,
) -> list[dict]:
    """Return filtered project records, newest first by ``order_by``."""
    if order_by not in _ORDER_COLUMNS:
        order_by = "updated_at"
    where, params = _build_filters(name, creator, created_from, created_to)
    sql = f"SELECT * FROM projects {where} ORDER BY {order_by} DESC"
    if limit is not None:
        sql += " LIMIT ? OFFSET ?"
        params.extend([limit, offset])
    with _connection() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [_row_to_dict(row) for row in rows]


def count_projects(
    name: Optional[str] = None,
    creator: Optional[str] = None,
    created_from: Optional[str] = None,
    created_to: Optional[str] = None,
) -> int:
    """Return the total number of projects matching the filters."""
    where, params = _build_filters(name, creator, created_from, created_to)
    with _connection() as conn:
        row = conn.execute(f"SELECT COUNT(*) AS n FROM projects {where}", params).fetchone()
    return int(row["n"])


def touch_opened(project_id: str, timestamp: str) -> None:
    """Update a project's last-opened timestamp."""
    with _connection() as conn:
        conn.execute(
            "UPDATE projects SET last_opened_at = ? WHERE id = ?",
            (timestamp, project_id),
        )


def get_project(project_id: str) -> Optional[dict]:
    """Return one project record by id, or None."""
    with _connection() as conn:
        row = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
    return _row_to_dict(row) if row else None


def save_project(
    project_id: str,
    analysis_config: Any,
    has_result: bool,
    updated_at: str,
    state: Any = None,
    saved_kind: Optional[str] = None,
) -> Optional[dict]:
    """Update analysis_config / has_result / state / updated_at for a project.

    saved_kind 传 auto 表示「没点保存就退出」的自动保存；只有显式传入才覆盖原值，
    避免用户手动保存后被自动保存的旧标记覆盖。
    """
    with _connection() as conn:
        params: list = [
            _serialize_config(analysis_config),
            int(has_result),
            _serialize_config(state),
            updated_at,
        ]
        sql = (
            "UPDATE projects SET analysis_config = ?, has_result = ?, state = ?, "
            "updated_at = ?"
        )
        if saved_kind is not None:
            sql += ", saved_kind = ?"
            params.append(saved_kind)
        sql += " WHERE id = ?"
        params.append(project_id)
        cur = conn.execute(sql, params)
    if cur.rowcount == 0:
        return None
    return get_project(project_id)


def delete_project(project_id: str) -> bool:
    """Delete a project record; return True if a row was removed."""
    with _connection() as conn:
        cur = conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
    return cur.rowcount > 0
