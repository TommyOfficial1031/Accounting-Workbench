"""CORS 测试。"""

from __future__ import annotations

from fastapi.testclient import TestClient

from accounting_backend.main import app


def test_cors_preflight_allows_dev_origin():
    client = TestClient(app)
    resp = client.options(
        "/api/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert resp.status_code == 200
    assert resp.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_cors_allows_tauri_origin():
    client = TestClient(app)
    resp = client.get("/api/health", headers={"Origin": "tauri://localhost"})
    assert resp.status_code == 200
    assert resp.headers["access-control-allow-origin"] == "tauri://localhost"
