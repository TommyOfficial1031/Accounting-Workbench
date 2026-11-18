"""导出文件记录接口测试：登记 / 列表 / 过滤 / 删除 / 清空。"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from accounting_backend.main import app


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr("accounting_backend.storage.paths.get_data_dir", lambda: tmp_path)
    return TestClient(app)


def _record(**overrides):
    payload = {
        "name": "网点货量分析_20261025_101010.xlsx",
        "kind": "file",
        "path": r"C:\Users\me\Desktop\网点货量分析_20261025_101010.xlsx",
        "project_id": "p1",
        "project_name": "10月华东区网管账单",
        "creator": "张三",
    }
    payload.update(overrides)
    return payload


def test_create_and_list(client):
    resp = client.post("/api/exports", json=_record())
    assert resp.status_code == 201
    body = resp.json()
    assert set(body) == {
        "id", "name", "kind", "path", "project_id", "project_name",
        "creator", "exported_at", "created_at",
    }
    assert body["exported_at"].startswith("20")

    listed = client.get("/api/exports")
    assert listed.status_code == 200
    data = listed.json()
    assert data["total"] == 1
    assert data["items"][0]["path"] == body["path"]


def test_list_query_filters_by_name_or_project(client):
    client.post("/api/exports", json=_record())
    client.post(
        "/api/exports",
        json=_record(name="盈亏平衡 - 浙北", kind="folder", path=r"C:\out\盈亏平衡 - 浙北"),
    )

    assert client.get("/api/exports", params={"query": "盈亏"}).json()["total"] == 1
    assert client.get("/api/exports", params={"query": "张三"}).json()["total"] == 2
    assert client.get("/api/exports", params={"query": "没有这个"}).json()["total"] == 0


def test_delete_one_and_clear(client):
    first = client.post("/api/exports", json=_record()).json()
    client.post("/api/exports", json=_record(name="second"))

    deleted = client.delete(f"/api/exports/{first['id']}")
    assert deleted.status_code == 200
    assert deleted.json()["deleted"] is True
    assert client.get("/api/exports").json()["total"] == 1

    cleared = client.delete("/api/exports")
    assert cleared.json()["deleted"] == 1
    assert client.get("/api/exports").json()["total"] == 0


def test_delete_missing_returns_false(client):
    resp = client.delete("/api/exports/nope")
    assert resp.status_code == 200
    assert resp.json()["deleted"] is False
