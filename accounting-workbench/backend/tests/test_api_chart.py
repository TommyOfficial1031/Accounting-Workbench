"""HTTP 接口集成测试：图表渲染（PDF/JPEG + 错误路径）。"""

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
            "columns": ["账单时间", "公斤段", "货量", "现价"],
            "rows": [
                ["2026-01-05", "0-1kg", 10, 100],
                ["2026-01-20", "0-1kg", 20, 200],
                ["2026-01-05", "1-2kg", 5, 50],
            ],
            "row_count": 3,
            "meta": {},
        },
        "chart": {
            "chart_type": "bar",
            "x_axis": "账单时间",
            "y_axis": "货量",
            "title": "网点货量分析",
        },
        "format": "pdf",
        "render_opts": {"figsize": [10, 6], "dpi": 100},
    }
    payload.update(overrides)
    return payload


def test_render_pdf(client):
    resp = client.post("/api/chart/render", json=_payload(format="pdf"))
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.headers["content-disposition"].startswith("attachment; filename=")
    assert resp.content[:4] == b"%PDF"


def test_render_jpeg(client):
    resp = client.post("/api/chart/render", json=_payload(format="jpeg"))
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "image/jpeg"
    assert resp.content[:2] == b"\xff\xd8"


def test_render_invalid_format(client):
    resp = client.post("/api/chart/render", json=_payload(format="png"))
    assert resp.status_code == 400
    body = resp.json()
    assert body["error"]["code"] == "INVALID_EXPORT_FORMAT"
    assert "message" in body["error"]


def test_render_invalid_config_pie_with_series(client):
    payload = _payload(format="pdf")
    payload["chart"]["chart_type"] = "pie"
    payload["chart"]["series"] = "公斤段"

    resp = client.post("/api/chart/render", json=payload)
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "INVALID_CHART_CONFIG"


def test_render_rejects_removed_scatter_type(client):
    """散点图已于 2026-10-30（第 14 轮）下线：请求里再传 scatter 直接 422。"""
    payload = _payload(format="pdf")
    payload["chart"]["chart_type"] = "scatter"

    resp = client.post("/api/chart/render", json=payload)
    assert resp.status_code == 422
    assert "scatter" in resp.text


def test_render_writes_to_path_when_given(client, tmp_path):
    """传 path 时：后端直接写盘并返回 JSON（桌面端先弹保存框后走这条）。"""
    target = tmp_path / "out" / "分析图表_20260101_120000.pdf"
    resp = client.post("/api/chart/render", json=_payload(format="pdf", path=str(target)))

    assert resp.status_code == 200
    body = resp.json()
    assert body["path"] == str(target)
    assert body["bytes"] > 0
    assert target.exists()
    assert target.read_bytes()[:4] == b"%PDF"


def test_render_path_write_failure_returns_structured_error(client, tmp_path):
    """路径写不进去时返回 EXPORT_WRITE_FAILED，而不是裸 500。"""
    blocker = tmp_path / "not-a-dir"
    blocker.write_text("x", encoding="utf-8")
    target = blocker / "chart.pdf"  # 父路径是文件，mkdir 会失败

    resp = client.post("/api/chart/render", json=_payload(format="pdf", path=str(target)))
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "EXPORT_WRITE_FAILED"


def test_render_combined_x_axis(client):
    """多维度组合 X 轴：前端把组合列烘焙进结果表，后端只认列名（含 x_dims 也能吃）。"""
    payload = _payload(format="pdf")
    payload["result"] = {
        "columns": ["寄件所属一级网点·目的所属省份·公斤段", "货量"],
        "rows": [
            ["金华婺城·浙江省·0-60", 10],
            ["金华婺城·广东省·0-60", 20],
            ["义乌铁路口岸·浙江省·0-60", 5],
            ["义乌铁路口岸·广东省·0-60", 7],
        ],
        "row_count": 4,
        "meta": {},
    }
    payload["chart"] = {
        "chart_type": "bar",
        "x_axis": "寄件所属一级网点·目的所属省份·公斤段",
        "y_axis": "货量",
        "x_dims": [
            {"field": "寄件所属一级网点", "values": ["金华婺城", "义乌铁路口岸"]},
            {"field": "目的所属省份", "values": ["浙江省", "广东省"]},
            {"field": "公斤段", "values": ["0-60"]},
        ],
    }

    resp = client.post("/api/chart/render", json=payload)
    assert resp.status_code == 200, resp.text
    assert resp.content[:4] == b"%PDF"
