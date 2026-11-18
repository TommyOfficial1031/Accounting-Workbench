"""导出接口冒烟：真写文件夹，文件都在。"""

from __future__ import annotations

from datetime import date
from pathlib import Path

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from accounting_backend.main import app
from accounting_backend.storage import dataset_cache

_TIME_RANGE = {"start": "2026-10-01", "end": "2026-10-31", "field": "账单时间"}


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr("accounting_backend.storage.paths.get_data_dir", lambda: tmp_path / "data")
    frame = pd.DataFrame(
        {
            "账单时间": ["2026-10-08", "2026-10-09"],
            "寄件所属一级网点": ["金东三部", "金华婺城"],
            "目的所属省份": ["安徽省", "福建省"],
            "公斤段": ["0-60", "150-300"],
            "结算重量": [100.0, 200.0],
            "现价": [80.0, 150.0],
            "原价": [100.0, 200.0],
        }
    )
    dataset_cache.cache_dataframe("ds-export", frame)
    # 先算一次表格结果，导出接口用它的返回体
    table = TestClient(app).post(
        "/api/regression/table",
        json={
            "dataset_id": "ds-export",
            "time_range": _TIME_RANGE,
            "dims": ["寄件所属一级网点"],
            "picks": {"寄件所属一级网点": ["金东三部", "金华婺城"]},
            "policies": {
                "金东三部": {"c_line": 0.2, "op_cost": 0.05, "d_plan": 0.6, "z_plan": 500},
            },
        },
    )
    assert table.status_code == 200, table.text
    return TestClient(app), table.json(), tmp_path


def test_export_table_writes_folder(client, tmp_path: Path) -> None:
    api, result, _ = client
    response = api.post(
        "/api/regression/export/table",
        json={
            "result": result,
            "out_dir": str(tmp_path),
            "stamp": "2026-10-23 17：30",
            "prefix": "金东三部、金华婺城",
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    folder = Path(body["folder"])
    assert folder.is_dir()
    assert folder.parent == tmp_path
    for name in body["files"]:
        assert (folder / name).stat().st_size > 0

    assert "盈亏平衡与折扣分析.pdf" in body["files"]
    assert "小图网格.jpg" in body["files"]
    assert "汇算明细表.xlsx" in body["files"]
    assert any(name.startswith("小图-") and name.endswith(".jpg") for name in body["files"])


def test_export_manual_writes_folder(client, tmp_path: Path) -> None:
    api, _result, _ = client
    response = api.post(
        "/api/regression/export/manual",
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
            },
            "out_dir": str(tmp_path),
            "stamp": "2026-10-23 17：30",
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    folder = Path(body["folder"])
    assert folder.name == "手动测算盈亏平衡与折扣分析 - 2026-10-23 17：30"
    assert sorted(body["files"]) == sorted(
        ["盈亏平衡与折扣分析.pdf", "小图网格.jpg", "小图-01-货量-利润.jpg", "汇算明细表.xlsx"]
    )
