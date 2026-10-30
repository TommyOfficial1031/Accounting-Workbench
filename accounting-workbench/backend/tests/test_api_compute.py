"""HTTP 接口集成测试：计算 + 错误路径（错误契约 {error:{code,message,details}}）。"""

from __future__ import annotations

import csv

import pytest
from fastapi.testclient import TestClient

from accounting_backend.main import app


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr("accounting_backend.storage.paths.get_data_dir", lambda: tmp_path)
    return TestClient(app)


@pytest.fixture()
def dataset_id(client, tmp_path):
    csv_path = tmp_path / "sample.csv"
    with open(csv_path, "w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(["账单时间", "寄件所属一级网点", "目的所属省份", "公斤段", "结算重量", "现价", "原价"])
        writer.writerow(["2026-10-01", "A", "广东", "0-1kg", 10, 100, 120])
        writer.writerow(["2026-10-01", "A", "广东", "1-2kg", 5, 40, 50])
        writer.writerow(["2026-10-01", "B", "广西", "0-1kg", 8, 60, 70])
    resp = client.post("/api/import", json={"path": str(csv_path), "encoding": "utf-8"})
    return resp.json()["dataset"]["id"]


def _config(dataset_id):
    return {
        "dataset_id": dataset_id,
        "time_range": {"start": "2026-10-01", "end": "2026-10-02", "field": "账单时间"},
        "filters": {"logic": "AND", "conditions": []},
        "group_by": [
            {"field": "账单时间", "time_granularity": None},
            {"field": "寄件所属一级网点", "time_granularity": None},
            {"field": "目的所属省份", "time_granularity": None},
            {"field": "公斤段", "time_granularity": None},
        ],
        "metrics": [{"id": "m1", "field": "结算重量", "agg": "sum", "alias": "货量"}],
        "derived_metrics": [{"id": "d1", "expression": "货量 * 2", "alias": "货量翻倍"}],
    }


def test_compute_endpoint(client, dataset_id):
    resp = client.post("/api/compute", json=_config(dataset_id))
    assert resp.status_code == 200
    data = resp.json()

    # ComputeResult 字段名契约
    assert set(data) == {"columns", "rows", "row_count", "meta"}
    assert data["columns"] == [
        "账单时间", "寄件所属一级网点", "目的所属省份", "公斤段",
        "货量", "货量翻倍",
    ]
    assert data["row_count"] == 3
    assert data["meta"]["unknown_date_count"] == 0


def test_compute_error_unknown_derived_metric(client, dataset_id):
    config = _config(dataset_id)
    config["derived_metrics"] = [{"id": "d1", "expression": "不存在 / 2", "alias": "x"}]

    resp = client.post("/api/compute", json=config)
    assert resp.status_code == 400
    body = resp.json()
    assert "error" in body
    assert body["error"]["code"] == "INVALID_DERIVED_EXPRESSION"
    assert "message" in body["error"]
