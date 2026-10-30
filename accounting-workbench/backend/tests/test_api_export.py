"""HTTP 接口集成测试：导出表格。"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from accounting_backend.main import app


@pytest.fixture()
def client():
    return TestClient(app)


def _payload(**overrides):
    payload = {
        "result": {
            "columns": ["账单时间", "货量"],
            "rows": [["2026-10-01", 15.0], ["2026-10-02", 8.0]],
            "row_count": 2,
            "meta": {},
        },
        "format": "xlsx",
    }
    payload.update(overrides)
    return payload


def test_export_to_path(client, tmp_path):
    out = tmp_path / "out.xlsx"
    resp = client.post("/api/export", json=_payload(path=str(out)))
    assert resp.status_code == 200
    assert resp.json() == {"success": True, "path": str(out)}
    assert out.exists()


@pytest.mark.parametrize("format", ["xlsx", "xls", "csv"])
def test_export_bytes(client, format):
    resp = client.post("/api/export", json=_payload(format=format, filename="结果"))
    assert resp.status_code == 200
    assert "content-disposition" in resp.headers
    assert "attachment; filename=" in resp.headers["content-disposition"]
    assert len(resp.content) > 0


def test_export_xls_row_limit(client, tmp_path):
    rows = [["2026-10-01", 1.0]] * 65537
    payload = {
        "result": {
            "columns": ["账单时间", "货量"],
            "rows": rows,
            "row_count": 65537,
            "meta": {},
        },
        "format": "xls",
        "path": str(tmp_path / "out.xls"),
    }
    resp = client.post("/api/export", json=payload)
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "XLS_ROW_LIMIT_EXCEEDED"
