"""新接口冒烟：/api/board、/api/regression/manual、/api/regression/table。"""

from __future__ import annotations

from datetime import date

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from accounting_backend.main import app
from accounting_backend.storage import dataset_cache


@pytest.fixture()
def client(tmp_path, monkeypatch):
    """把数据目录指到临时目录，避免污染真实用户数据。"""
    monkeypatch.setattr("accounting_backend.storage.paths.get_data_dir", lambda: tmp_path)

    frame = pd.DataFrame(
        {
            "账单时间": ["2026-10-08", "2026-10-09"],
            "寄件所属一级网点": ["金东三部", "金华婺城"],
            "目的所属省份": ["安徽省", "福建省"],
            "公斤段": ["0-60", "150-300"],
            "是否剔除": ["不剔除", "不剔除"],
            "物品来源": ["普通物品", "普通物品"],
            "结算重量": [100.0, 200.0],
            "现价": [80.0, 150.0],
            "原价": [100.0, 200.0],
        }
    )
    dataset_cache.cache_dataframe("ds-test", frame)
    return TestClient(app)


def test_board_endpoint(client) -> None:
    response = client.post(
        "/api/board",
        json={
            "dataset_id": "ds-test",
            "time_range": {"start": "2026-10-01", "end": "2026-10-31", "field": "账单时间"},
            "dims": ["网点"],
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["sum_vol"] == pytest.approx(300)
    assert len(body["bands"]) == 6
    assert len(body["rows"]) == 2


def test_board_sources_endpoint(client) -> None:
    response = client.post(
        "/api/board/sources", json={"dataset_id": "ds-test", "nets": ["金华婺城"]}
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["nets"] == ["金华婺城"]
    assert body["provinces"] == ["福建省"]


def test_manual_endpoint(client) -> None:
    response = client.post(
        "/api/regression/manual",
        json={
            "config": {
                "p0": 1.0,
                "d": 0.8,
                "d_plan": 0.7,
                "b_now": 3000,
                "b_plan": 2000,
                "c": 0.5,
                "z_now": 100000,
                "z_plan": 120000,
            }
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["profit_plan"] == pytest.approx(26_000)
    assert len(body["steps"]) == 5


def test_table_endpoint(client) -> None:
    response = client.post(
        "/api/regression/table",
        json={
            "dataset_id": "ds-test",
            "time_range": {"start": "2026-10-01", "end": "2026-10-31", "field": "账单时间"},
            "dims": ["寄件所属一级网点"],
            "picks": {"寄件所属一级网点": ["金东三部"]},
            "policies": {
                "金东三部": {"c_line": 0.2, "op_cost": 0.05, "d_plan": 0.6, "z_plan": 500}
            },
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body["groups"]) == 1
    group = body["groups"][0]
    assert group["label"] == "金东三部"
    assert group["z"] == pytest.approx(100)
    assert group["profit_plan"] == pytest.approx((0.6 - 0.25) * 500)
    assert body["filled_count"] == 1


def test_table_endpoint_missing_dataset(client) -> None:
    response = client.post(
        "/api/regression/table",
        json={
            "dataset_id": "not-exist",
            "time_range": {"start": "2026-10-01", "end": "2026-10-31", "field": "账单时间"},
        },
    )
    assert response.status_code >= 400
