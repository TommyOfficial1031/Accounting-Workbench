"""HTTP 接口集成测试：导入 + 预览（字段名契约与前端 types/api.ts 对齐）。"""

from __future__ import annotations

import csv

import pytest
from fastapi.testclient import TestClient

from accounting_backend.main import app


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr("accounting_backend.storage.paths.get_data_dir", lambda: tmp_path)
    return TestClient(app)


def _write_csv(path, headers, rows):
    with open(path, "w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(headers)
        for row in rows:
            writer.writerow(row)


def test_import_endpoint(client, tmp_path):
    csv_path = tmp_path / "sample.csv"
    _write_csv(
        csv_path,
        [
            "账单时间", "寄件所属一级网点", "目的所属省份", "公斤段",
            "物品来源", "是否剔除", "结算重量", "现价", "原价",
            "产品类型", "订单来源", "转运费",
        ],
        [["2026-10-01", "A", "广东", "0-1kg", "电商", "否", 10, 100, 120, "标准", "电商", 5]],
    )

    resp = client.post("/api/import", json={"path": str(csv_path), "encoding": "utf-8"})
    assert resp.status_code == 200
    data = resp.json()

    # ImportResponse 字段名契约
    assert set(data) == {"dataset", "preview", "warnings", "fixed_rules"}

    dataset = data["dataset"]
    assert set(dataset) == {
        "id", "name", "source_path", "sheet_name", "columns",
        "row_count", "col_count", "created_at",
        "predefined_hit_count", "fixed_rules_available",
    }
    assert dataset["predefined_hit_count"] == 12
    assert dataset["fixed_rules_available"] is True

    column = dataset["columns"][0]
    assert set(column) == {"name", "dtype", "category", "is_predefined"}

    rule = data["fixed_rules"][0]
    assert set(rule) == {
        "name", "available", "missing_fields", "group_by", "metrics", "derived_metrics",
    }
    metric = rule["metrics"][0]
    assert set(metric) == {"field", "agg", "alias"}

    preview = data["preview"]
    assert set(preview) == {"columns", "rows", "offset", "total_rows"}


def test_preview_endpoint_pagination(client, tmp_path):
    csv_path = tmp_path / "sample.csv"
    _write_csv(
        csv_path,
        ["账单时间", "寄件所属一级网点", "结算重量"],
        [[f"2026-10-{i:02d}", "A", i] for i in range(1, 21)],
    )

    resp = client.post("/api/import", json={"path": str(csv_path), "encoding": "utf-8"})
    dataset_id = resp.json()["dataset"]["id"]

    page = client.get(
        f"/api/dataset/{dataset_id}/preview", params={"offset": 5, "limit": 3}
    )
    assert page.status_code == 200
    data = page.json()
    assert data["offset"] == 5
    assert data["total_rows"] == 20
    assert len(data["rows"]) == 3
    # 第 6 行（索引 5）的结算重量 = 6
    assert data["rows"][0][2] == 6


def test_import_invalid_file_returns_4xx(client, tmp_path):
    bad = tmp_path / "broken.xlsx"
    bad.write_bytes(b"not a real xlsx file")
    resp = client.post("/api/import", json={"path": str(bad), "encoding": None})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "IMPORT_FAILED"
