"""HTTP 集成测试：编辑 + 编辑后计算。"""

from __future__ import annotations

import csv

import pytest
from fastapi.testclient import TestClient

from accounting_backend.main import app
from accounting_backend.services import edit_service


@pytest.fixture(autouse=True)
def _clear_sessions():
    edit_service._sessions.clear()
    yield
    edit_service._sessions.clear()


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr("accounting_backend.storage.paths.get_data_dir", lambda: tmp_path)
    return TestClient(app)


def _import(client, tmp_path):
    path = tmp_path / "sample.csv"
    with open(path, "w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(["账单时间", "货量"])
        writer.writerow(["2026-10-01", 10])
        writer.writerow(["2026-10-02", 20])
    resp = client.post("/api/import", json={"path": str(path), "encoding": "utf-8"})
    return resp.json()["dataset"]["id"]


def _compute_payload(dataset_id):
    return {
        "dataset_id": dataset_id,
        "time_range": {"start": "2026-10-01", "end": "2026-10-02", "field": "账单时间"},
        "filters": {"logic": "AND", "conditions": []},
        "group_by": [],
        "metrics": [{"id": "m1", "field": "货量", "agg": "sum", "alias": "货量合计"}],
        "derived_metrics": [],
    }


def test_edit_cell_then_compute_uses_new_value(client, tmp_path):
    dataset_id = _import(client, tmp_path)
    resp = client.patch(
        f"/api/dataset/{dataset_id}",
        json={
            "op": "set_cells",
            "payload": {"cells": [{"row": 0, "col": 1, "value": 999}]},
            "idempotency_key": "k1",
        },
    )
    assert resp.status_code == 200

    resp = client.post("/api/compute", json=_compute_payload(dataset_id))
    assert resp.status_code == 200
    assert resp.json()["rows"][0][0] == 1019  # 999 + 20


def test_undo_and_reset(client, tmp_path):
    dataset_id = _import(client, tmp_path)

    client.patch(f"/api/dataset/{dataset_id}", json={"op": "set_cells", "payload": {"cells": [{"row": 0, "col": 1, "value": 999}]}})
    client.patch(f"/api/dataset/{dataset_id}", json={"op": "undo"})
    page = client.get(f"/api/dataset/{dataset_id}/preview", params={"offset": 0, "limit": 10}).json()
    assert page["rows"][0][1] == 10  # undo 恢复

    client.patch(f"/api/dataset/{dataset_id}", json={"op": "set_cells", "payload": {"cells": [{"row": 0, "col": 1, "value": 5}]}})
    client.patch(f"/api/dataset/{dataset_id}", json={"op": "reset"})
    page = client.get(f"/api/dataset/{dataset_id}/preview", params={"offset": 0, "limit": 10}).json()
    assert page["rows"][0][1] == 10  # reset 恢复导入初始


def test_edit_response_shape(client, tmp_path):
    dataset_id = _import(client, tmp_path)
    resp = client.patch(
        f"/api/dataset/{dataset_id}",
        json={"op": "set_cells", "payload": {"cells": [{"row": 0, "col": 1, "value": 999}]}},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["row_count"] == 2
    assert body["col_count"] == 2
    assert body["can_undo"] is True
    assert body["can_redo"] is False
