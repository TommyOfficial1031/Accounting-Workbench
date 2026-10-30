"""`GET /api/dataset/{id}/time-range` 的接口测试（第 11 轮 C）。

覆盖：正常识别（账单时间）/ 没有「账单时间」时退回第一个日期列 /
没有时间列 / 整列为空 / 数据集不存在。
"""

from __future__ import annotations

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from accounting_backend.main import app
from accounting_backend.storage import dataset_cache


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr("accounting_backend.storage.paths.get_data_dir", lambda: tmp_path)
    return TestClient(app)


def _cache(dataset_id: str, frame: pd.DataFrame) -> None:
    dataset_cache.cache_dataframe(dataset_id, frame)
    # 清掉上一次测试留下的工作副本（同名 dataset id 会读到旧 frame）
    from accounting_backend.services import edit_service

    edit_service.reset(dataset_id)


def test_time_range_from_bill_time(client) -> None:
    _cache(
        "ds-time",
        pd.DataFrame(
            {
                "账单时间": ["2026-10-08", "2026-10-01", "2026-10-20", None],
                "结算重量": [1.0, 2.0, 3.0, 4.0],
            }
        ),
    )
    response = client.get("/api/dataset/ds-time/time-range")
    assert response.status_code == 200, response.text
    assert response.json() == {
        "field": "账单时间",
        "start": "2026-10-01",
        "end": "2026-10-20",
        "rows": 3,
    }


def test_time_range_falls_back_to_first_date_column(client) -> None:
    _cache(
        "ds-fallback",
        pd.DataFrame(
            {
                "运单号": ["A", "B"],
                "发货日期": ["2026/9/1", "2026/12/31"],
                "结算重量": [1.0, 2.0],
            }
        ),
    )
    body = client.get("/api/dataset/ds-fallback/time-range").json()
    assert body["field"] == "发货日期"
    assert body["start"] == "2026-09-01"
    assert body["end"] == "2026-12-31"
    assert body["rows"] == 2


def test_numeric_columns_are_not_dates(client) -> None:
    """数值列不能被当成日期（pd.to_datetime(100) = 1970 纳秒，会把范围识别成 1970）。"""
    _cache(
        "ds-numeric",
        pd.DataFrame({"运单号": ["A", "B"], "结算重量": [100.0, 200.0], "件数": [1, 2]}),
    )
    body = client.get("/api/dataset/ds-numeric/time-range").json()
    assert body == {"field": None, "start": None, "end": None, "rows": 0}


def test_all_empty_dates_return_nulls(client) -> None:
    _cache(
        "ds-empty",
        pd.DataFrame({"账单时间": [None, None], "结算重量": [1.0, 2.0]}),
    )
    body = client.get("/api/dataset/ds-empty/time-range").json()
    assert body["field"] == "账单时间"
    assert body["start"] is None
    assert body["end"] is None
    assert body["rows"] == 0


def test_unknown_dataset_returns_404(client) -> None:
    response = client.get("/api/dataset/ds-missing/time-range")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "DATASET_NOT_FOUND"
