"""导出文件记录（SQLite，与项目元数据同一个库）。

只做读写，不含业务判断（AGENTS.md 分层约束）。
"""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from typing import Optional

from accounting_backend.storage.paths import ensure_dirs, get_projects_db_path

_DDL = """
CREATE TABLE IF NOT EXISTS export_records (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,              -- file = 单个文件；folder = 导出文件夹
    path TEXT NOT NULL,
    project_id TEXT,
    project_name TEXT,
    creator TEXT,
    exported_at TEXT NOT NULL,       -- YYYY-MM-DD HH:MM:SS
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_exports_exported_at ON export_records(exported_at);
CREATE INDEX IF NOT EXISTS idx_exports_project ON export_records(project_id);
"""


def _connect() -> sqlite3.Connection:
    ensure_dirs()
    conn = sqlite3.connect(str(get_projects_db_path()))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    return conn


@contextmanager
def _connection():
    conn = _connect()
    try:
        conn.executescript(_DDL)
        yield conn
        conn.commit()
    finally:
        conn.close()


def add_record(record: dict) -> dict:
    """插入一条导出记录并原样返回。"""
    with _connection() as conn:
        conn.execute(
            """
            INSERT INTO export_records
                (id, name, kind, path, project_id, project_name, creator,
                 exported_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                record["id"],
                record["name"],
                record["kind"],
                record["path"],
                record.get("project_id"),
                record.get("project_name"),
                record.get("creator"),
                record["exported_at"],
                record["created_at"],
            ),
        )
    return record


def list_records(limit: int = 200, query: Optional[str] = None) -> list[dict]:
    """按导出时间倒序列出记录；query 匹配文件名 / 项目名 / 创建人 / 路径。"""
    sql = "SELECT * FROM export_records"
    params: list[object] = []
    if query:
        like = f"%{query}%"
        sql += (
            " WHERE name LIKE ? OR project_name LIKE ? OR creator LIKE ? OR path LIKE ?"
        )
        params.extend([like, like, like, like])
    sql += " ORDER BY exported_at DESC, created_at DESC LIMIT ?"
    params.append(limit)
    with _connection() as conn:
        return [dict(row) for row in conn.execute(sql, params)]


def delete_record(record_id: str) -> bool:
    """删除一条记录，返回是否真的删掉了（只删记录，不动磁盘文件）。"""
    with _connection() as conn:
        cursor = conn.execute("DELETE FROM export_records WHERE id = ?", (record_id,))
        return cursor.rowcount > 0


def clear_records() -> int:
    """清空全部记录，返回删除条数（只删记录，不动磁盘文件）。"""
    with _connection() as conn:
        cursor = conn.execute("DELETE FROM export_records")
        return cursor.rowcount
