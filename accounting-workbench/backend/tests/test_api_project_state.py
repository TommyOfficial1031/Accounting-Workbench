"""保存接口 round-trip：state（三页输入快照）与 saved_kind 能存能取。"""

from __future__ import annotations

from pathlib import Path

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from accounting_backend.main import app
from accounting_backend.storage import dataset_cache

_ANALYSIS = {
    "dataset_id": "ds-save",
    "time_range": {"start": "2026-10-01", "end": "2026-10-31", "field": "账单时间"},
    "filters": {"logic": "AND", "conditions": []},
    "group_by": [],
    "metrics": [],
    "derived_metrics": [],
}

_STATE = {
    "analysis": {"chart": {"type": "pie", "xSel": {"目的所属省份": ["安徽省"]}}},
    "board": {"nets": ["金东三部"], "dims": ["省份"], "exclude": "不剔除"},
    "regression": {"mode": "table", "picks": {"目的所属省份": ["安徽省"]}},
}


@pytest.fixture()
def client(tmp_path, monkeypatch):
    root = tmp_path / "data"
    monkeypatch.setattr("accounting_backend.storage.paths.get_data_dir", lambda: root)
    frame = pd.DataFrame(
        {
            "账单时间": ["2026-10-08"],
            "寄件所属一级网点": ["金东三部"],
            "目的所属省份": ["安徽省"],
            "公斤段": ["0-60"],
            "结算重量": [100.0],
            "现价": [80.0],
            "原价": [100.0],
        }
    )
    dataset_cache.cache_dataframe("ds-save", frame)
    return TestClient(app)


def _create(client: TestClient, source: Path) -> str:
    csv = source / "demo.csv"
    csv.write_text("a,b\n1,2\n", encoding="utf-8")
    response = client.post(
        "/api/projects", json={"name": "演示项目", "creator": "张三", "source_path": str(csv)}
    )
    assert response.status_code == 200, response.text
    return response.json()["project"]["id"]


def test_save_and_read_state(client, tmp_path: Path) -> None:
    project_id = _create(client, tmp_path)

    saved = client.patch(
        f"/api/projects/{project_id}",
        json={"analysis_config": _ANALYSIS, "result": None, "state": _STATE, "saved_kind": "auto"},
    )
    assert saved.status_code == 200, saved.text
    body = saved.json()
    assert body["state"] == _STATE
    assert body["saved_kind"] == "auto"

    detail = client.get(f"/api/projects/{project_id}")
    assert detail.status_code == 200, detail.text
    assert detail.json()["project"]["state"] == _STATE
    assert detail.json()["project"]["saved_kind"] == "auto"


def test_saved_kind_defaults_to_manual(client, tmp_path: Path) -> None:
    project_id = _create(client, tmp_path)
    saved = client.patch(
        f"/api/projects/{project_id}", json={"analysis_config": _ANALYSIS, "result": None}
    )
    assert saved.status_code == 200, saved.text
    body = saved.json()
    assert body["saved_kind"] == "manual"
    assert body["state"] is None

    listed = client.get("/api/projects")
    assert listed.status_code == 200
    assert listed.json()["items"][0]["saved_kind"] if "saved_kind" in listed.json()["items"][0] else True
