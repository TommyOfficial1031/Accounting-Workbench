"""项目存储层测试：SQLite CRUD + WAL + meta 版本。"""

from __future__ import annotations

import sqlite3

import pytest

from accounting_backend.storage import paths
from accounting_backend.storage import project_store


@pytest.fixture()
def data_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, "get_data_dir", lambda: tmp_path)
    return tmp_path


def _record(**overrides):
    record = {
        "id": "p1",
        "name": "项目A",
        "creator": "张三",
        "created_at": "2026-10-01 10:00:00",
        "updated_at": "2026-10-01 10:00:00",
        "source_path": "/tmp/a.csv",
        "source_type": "csv",
        "row_count": 3,
        "col_count": 4,
        "analysis_config": None,
        "has_result": False,
    }
    record.update(overrides)
    return record


def test_crud(data_dir):
    project_store.create_project(_record())
    got = project_store.get_project("p1")
    assert got["name"] == "项目A"
    assert got["creator"] == "张三"
    assert got["has_result"] is False

    project_store.save_project(
        "p1",
        {"time_range": {"start": "2026-10-01", "end": "2026-10-02", "field": "账单时间"}},
        True,
        "2026-10-02 09:00:00",
    )
    updated = project_store.get_project("p1")
    assert updated["has_result"] is True
    assert updated["analysis_config"]["time_range"]["start"] == "2026-10-01"
    assert updated["updated_at"] == "2026-10-02 09:00:00"

    assert len(project_store.query_projects()) == 1

    assert project_store.delete_project("p1") is True
    assert project_store.get_project("p1") is None
    assert project_store.delete_project("p1") is False


def test_wal_mode(data_dir):
    project_store.create_project(_record(id="w1"))
    conn = sqlite3.connect(str(paths.get_projects_db_path()))
    mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
    conn.close()
    assert mode == "wal"


def test_meta_version(data_dir):
    project_store.create_project(_record(id="m1"))
    conn = sqlite3.connect(str(paths.get_projects_db_path()))
    version = conn.execute("SELECT value FROM meta WHERE key='schema_version'").fetchone()[0]
    conn.close()
    assert version == "3"


def test_migration_v1_to_v3_preserves_data(data_dir):
    import sqlite3

    db_path = paths.get_projects_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.executescript(
        """
        CREATE TABLE projects (
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
            has_result INTEGER DEFAULT 0
        );
        CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        INSERT INTO meta (key, value) VALUES ('schema_version', '1');
        INSERT INTO projects (id, name, creator, created_at, updated_at, has_result)
            VALUES ('p1', '旧项目', '张三', '2026-10-01 10:00:00', '2026-10-01 10:00:00', 0);
        """
    )
    conn.commit()
    conn.close()

    project_store.init_db()  # 触发 v1 → v2 迁移

    record = project_store.get_project("p1")
    assert record["name"] == "旧项目"  # 数据完整
    assert record["last_opened_at"] is None  # 新列存在且为 NULL

    conn = sqlite3.connect(str(db_path))
    columns = {row[1] for row in conn.execute("PRAGMA table_info(projects)")}
    version = conn.execute("SELECT value FROM meta WHERE key='schema_version'").fetchone()[0]
    conn.close()
    assert "last_opened_at" in columns
    assert version == "3"


def test_migration_idempotent(data_dir):
    project_store.init_db()
    project_store.init_db()  # 已迁移，不重复 ALTER，不报错
    project_store.create_project(_record(id="p1"))
    assert project_store.get_project("p1")["name"] == "项目A"


def test_query_order_by_last_opened(data_dir):
    project_store.create_project(
        _record(id="p1", name="A", last_opened_at="2026-10-01 10:00:00")
    )
    project_store.create_project(
        _record(id="p2", name="B", last_opened_at="2026-10-02 10:00:00")
    )
    records = project_store.query_projects(order_by="last_opened_at")
    assert [r["id"] for r in records] == ["p2", "p1"]  # p2 最近打开，排最前
