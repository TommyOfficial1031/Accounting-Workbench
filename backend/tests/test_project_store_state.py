"""项目库新增字段：saved_kind（手动/自动保存）与 state（三页输入快照）+ 排序口径。"""

from __future__ import annotations

import pytest

from accounting_backend.storage import project_store


@pytest.fixture(autouse=True)
def _isolated_db(tmp_path, monkeypatch):
    """每个用例用独立的临时数据目录。"""
    monkeypatch.setattr("accounting_backend.storage.paths.get_data_dir", lambda: tmp_path)
    project_store.init_db()


def _record(project_id: str, name: str, created: str, updated: str, **extra) -> dict:
    base = {
        "id": project_id,
        "name": name,
        "creator": "张三",
        "created_at": created,
        "updated_at": updated,
        "source_path": "C:/demo.xlsx",
        "source_type": "xlsx",
        "row_count": 10,
        "col_count": 5,
        "analysis_config": None,
        "has_result": False,
    }
    base.update(extra)
    return base


def test_default_saved_kind_is_manual() -> None:
    project_store.create_project(_record("p1", "第一个", "2026-10-01 09:00:00", "2026-10-01 09:00:00"))
    row = project_store.get_project("p1")
    assert row is not None
    assert row["saved_kind"] == "manual"
    assert row["state"] is None


def test_state_round_trip() -> None:
    state = {
        "analysis": {"filters": [], "chart": {"type": "line"}},
        "board": {"nets": ["金东三部"], "dims": ["省份"]},
        "regression": {"mode": "table", "picks": {"目的所属省份": ["安徽省"]}},
    }
    project_store.create_project(
        _record("p2", "带状态", "2026-10-02 09:00:00", "2026-10-02 09:00:00", state=state)
    )
    row = project_store.get_project("p2")
    assert row is not None
    assert row["state"] == state

    # 保存时更新 state 与 saved_kind
    new_state = {"board": {"nets": []}, "analysis": {"filters": []}, "regression": {"mode": "manual"}}
    project_store.save_project(
        "p2",
        analysis_config=None,
        has_result=True,
        updated_at="2026-10-05 10:00:00",
        state=new_state,
        saved_kind="auto",
    )
    row = project_store.get_project("p2")
    assert row is not None
    assert row["state"] == new_state
    assert row["saved_kind"] == "auto"
    assert row["has_result"] is True


def test_saved_kind_kept_when_not_passed() -> None:
    """不传 saved_kind 时不覆盖原值（自动保存标记不会被手动保存冲掉）。"""
    project_store.create_project(
        _record("p3", "自动保存的", "2026-10-03 09:00:00", "2026-10-03 09:00:00", saved_kind="auto")
    )
    project_store.save_project(
        "p3", analysis_config=None, has_result=False, updated_at="2026-10-04 09:00:00"
    )
    row = project_store.get_project("p3")
    assert row is not None
    assert row["saved_kind"] == "auto"


def test_order_by_created_at_desc() -> None:
    """项目管理：按创建时间倒序（最新建的在最上）。"""
    project_store.create_project(_record("a", "旧项目", "2026-09-01 08:00:00", "2026-10-20 08:00:00"))
    project_store.create_project(_record("b", "新项目", "2026-10-10 08:00:00", "2026-10-11 08:00:00"))
    rows = project_store.query_projects(order_by="created_at")
    assert [row["id"] for row in rows] == ["b", "a"]


def test_order_by_updated_at_desc() -> None:
    """历史记录：按最后保存时间倒序（含退出自动保存）。"""
    project_store.create_project(_record("a", "旧项目", "2026-09-01 08:00:00", "2026-10-20 08:00:00"))
    project_store.create_project(_record("b", "新项目", "2026-10-10 08:00:00", "2026-10-11 08:00:00"))
    rows = project_store.query_projects(order_by="updated_at")
    assert [row["id"] for row in rows] == ["a", "b"]
    # 默认排序就是最后保存时间
    assert [row["id"] for row in project_store.query_projects()] == ["a", "b"]


def test_invalid_order_by_falls_back_to_updated_at() -> None:
    project_store.create_project(_record("a", "甲", "2026-09-01 08:00:00", "2026-10-20 08:00:00"))
    project_store.create_project(_record("b", "乙", "2026-10-10 08:00:00", "2026-10-11 08:00:00"))
    rows = project_store.query_projects(order_by="hacked; DROP TABLE projects")
    assert [row["id"] for row in rows] == ["a", "b"]
