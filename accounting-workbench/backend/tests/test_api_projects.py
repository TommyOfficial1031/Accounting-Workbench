"""HTTP 接口集成测试：项目管理（新建/列出/获取/保存/删除/合并）。"""

from __future__ import annotations

import csv

import pytest
from fastapi.testclient import TestClient

from accounting_backend.main import app


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr("accounting_backend.storage.paths.get_data_dir", lambda: tmp_path)
    return TestClient(app)


HEADERS = ["账单时间", "寄件所属一级网点", "目的所属省份", "公斤段", "结算重量", "现价"]


def _write_csv(path, headers, rows):
    with open(path, "w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(headers)
        for row in rows:
            writer.writerow(row)


def _create_project(client, tmp_path, name, creator, headers, rows):
    path = tmp_path / f"{name}.csv"
    _write_csv(path, headers, rows)
    resp = client.post(
        "/api/projects",
        json={"name": name, "creator": creator, "source_path": str(path)},
    )
    assert resp.status_code == 200
    return resp.json()


def test_project_crud_flow(client, tmp_path):
    detail = _create_project(
        client, tmp_path, "项目A", "张三", HEADERS,
        [["2026-10-01", "A", "广东", "0-1kg", 10, 100]],
    )
    project_id = detail["project"]["id"]

    project_dir = tmp_path / "projects" / project_id
    assert (project_dir / "data.parquet").exists()

    resp = client.get("/api/projects")
    assert resp.status_code == 200
    assert any(p["id"] == project_id for p in resp.json()["items"])

    resp = client.get(f"/api/projects/{project_id}")
    assert resp.status_code == 200
    assert resp.json()["dataset"]["row_count"] == 1

    resp = client.delete(f"/api/projects/{project_id}")
    assert resp.status_code == 200
    assert not project_dir.exists()
    listing = client.get("/api/projects").json()["items"]
    assert all(p["id"] != project_id for p in listing)


def test_analysis_config_round_trip(client, tmp_path):
    detail = _create_project(
        client, tmp_path, "项目A", "张三", HEADERS,
        [["2026-10-01", "A", "广东", "0-1kg", 10, 100]],
    )
    project_id = detail["project"]["id"]

    config = {
        "dataset_id": project_id,
        "time_range": {"start": "2026-10-01", "end": "2026-10-02", "field": "账单时间"},
        "filters": {
            "logic": "AND",
            "conditions": [
                {"field": "公斤段", "op": "eq", "value": "0-1kg"},
                {"field": "结算重量", "op": "gt", "value": 5},
            ],
        },
        "group_by": [
            {"field": "账单时间", "time_granularity": "day"},
            {"field": "寄件所属一级网点", "time_granularity": None},
        ],
        "metrics": [
            {"id": "m1", "field": "现价", "agg": "sum", "alias": "现价合计"},
            {"id": "m2", "field": "结算重量", "agg": "sum", "alias": "货量"},
        ],
        "derived_metrics": [
            {"id": "d1", "expression": "m1 / m2", "alias": "单公斤价格"},
        ],
    }
    result = {
        "columns": ["账单时间", "货量"],
        "rows": [["2026-10-01", 10]],
        "row_count": 1,
        "meta": {"unknown_date_count": 0},
    }

    resp = client.patch(
        f"/api/projects/{project_id}",
        json={"analysis_config": config, "result": result},
    )
    assert resp.status_code == 200

    resp = client.get(f"/api/projects/{project_id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["project"]["analysis_config"] == config  # 逐字段相等，含 derived_metrics
    assert body["result"] == result


def test_project_cache_missing(client, tmp_path):
    detail = _create_project(
        client, tmp_path, "项目A", "张三", HEADERS,
        [["2026-10-01", "A", "广东", "0-1kg", 10, 100]],
    )
    project_id = detail["project"]["id"]

    (tmp_path / "projects" / project_id / "data.parquet").unlink()

    resp = client.get(f"/api/projects/{project_id}")
    assert resp.status_code == 404
    body = resp.json()
    assert body["error"]["code"] == "PROJECT_CACHE_MISSING"
    assert body["error"]["details"]["source_path"]


def test_merge_projects(client, tmp_path):
    a = _create_project(
        client, tmp_path, "项目A", "张三", HEADERS,
        [["2026-10-01", "A", "广东", "0-1kg", 10, 100]],
    )
    b = _create_project(
        client, tmp_path, "项目B", "李四",
        ["账单时间", "寄件所属一级网点", "目的所属省份", "结算重量"],
        [["2026-10-02", "B", "江苏", 20]],
    )
    ids = [a["project"]["id"], b["project"]["id"]]

    resp = client.post("/api/projects/merge", json={"project_ids": ids, "dry_run": True})
    assert resp.status_code == 200
    data = resp.json()
    assert data["project"] is None
    assert data["dataset"] is None
    assert data["preview"]["total_rows"] == 2
    assert data["preview"]["columns"] == HEADERS  # 列序以 6 字段项目A为准
    assert data["sources"][0] == "项目A"  # 字段多的项目A在上
    assert data["sources_distribution"] == {"项目A": 1, "项目B": 1}

    resp = client.post(
        "/api/projects/merge", json={"project_ids": ids, "name": "合并项目"},
    )
    assert resp.status_code == 200
    merged = resp.json()
    assert merged["project"]["name"] == "合并项目"
    assert merged["dataset"]["row_count"] == 2
    assert merged["dataset"]["col_count"] == 6


def test_delete_project_survives_cache_removal_failure(client, tmp_path, monkeypatch):
    detail = _create_project(
        client, tmp_path, "项目A", "张三", HEADERS,
        [["2026-10-01", "A", "广东", "0-1kg", 10, 100]],
    )
    project_id = detail["project"]["id"]

    monkeypatch.setattr("shutil.rmtree", _raise_oserror)

    resp = client.delete(f"/api/projects/{project_id}")
    assert resp.status_code == 200  # 记录已删，rmtree 失败不抛异常
    listing = client.get("/api/projects").json()["items"]
    assert all(p["id"] != project_id for p in listing)


def test_query_fuzzy_name_creator(client, tmp_path):
    _create_project(
        client, tmp_path, "杭州网点分析", "张三", HEADERS,
        [["2026-10-01", "A", "广东", "0-1kg", 10, 100]],
    )
    _create_project(
        client, tmp_path, "宁波折扣", "李四", HEADERS,
        [["2026-10-02", "B", "江苏", "3-5kg", 20, 200]],
    )

    resp = client.get("/api/projects", params={"name": "网点"})
    assert resp.json()["total"] == 1
    assert resp.json()["items"][0]["name"] == "杭州网点分析"

    resp = client.get("/api/projects", params={"creator": "李"})
    assert resp.json()["total"] == 1
    assert resp.json()["items"][0]["name"] == "宁波折扣"


def test_query_time_range(client, tmp_path):
    _create_project(
        client, tmp_path, "项目A", "张三", HEADERS,
        [["2026-10-01", "A", "广东", "0-1kg", 10, 100]],
    )

    resp = client.get(
        "/api/projects", params={"created_from": "2000-01-01", "created_to": "2099-12-31"},
    )
    assert resp.json()["total"] == 1

    resp = client.get("/api/projects", params={"created_to": "2000-01-01"})
    assert resp.json()["total"] == 0


def test_query_pagination(client, tmp_path):
    for i in range(10):
        _create_project(
            client, tmp_path, f"项目{i}", "张三", HEADERS,
            [["2026-10-01", "A", "广东", "0-1kg", 10, 100]],
        )

    resp = client.get("/api/projects", params={"offset": 0, "limit": 8})
    assert resp.json()["total"] == 10
    assert len(resp.json()["items"]) == 8

    resp = client.get("/api/projects", params={"offset": 8, "limit": 8})
    assert len(resp.json()["items"]) == 2


def _raise_oserror(*args, **kwargs):
    raise OSError("simulated locked file")
