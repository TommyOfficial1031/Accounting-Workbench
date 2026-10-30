"""数据集取值接口的冒烟测试。"""

from __future__ import annotations

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from accounting_backend.main import app
from accounting_backend.storage import dataset_cache


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr("accounting_backend.storage.paths.get_data_dir", lambda: tmp_path)
    frame = pd.DataFrame(
        {
            "寄件所属一级网点": ["金东三部", "金华婺城", "金东三部"],
            "公斤段": ["0-60", "150-300", "0-60"],
            "目的所属省份": ["安徽省", "浙江省", "安徽省"],
        }
    )
    dataset_cache.cache_dataframe("ds-values", frame)
    # 同名 dataset id 会命中上一次测试的工作副本，先清掉
    from accounting_backend.services import edit_service

    edit_service.reset("ds-values")
    return TestClient(app)


def test_values_dedup_and_sort(client) -> None:
    response = client.post(
        "/api/values",
        json={"dataset_id": "ds-values", "fields": ["寄件所属一级网点", "公斤段"]},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["values"]["寄件所属一级网点"] == ["金东三部", "金华婺城"]
    assert body["values"]["公斤段"] == ["0-60", "150-300"]
    # 没传级联字段时不给映射（老调用方零影响）
    assert body["cascade"] == {}


def test_values_cascade_per_parent(client) -> None:
    """第 11 轮 A①：每省各自的公斤段集合（浙江省只有 150-300）。"""
    response = client.post(
        "/api/values",
        json={
            "dataset_id": "ds-values",
            "fields": ["目的所属省份", "公斤段"],
            "parent_field": "目的所属省份",
            "child_field": "公斤段",
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["cascade"] == {"安徽省": ["0-60"], "浙江省": ["150-300"]}


def test_values_limit(client) -> None:
    response = client.post(
        "/api/values", json={"dataset_id": "ds-values", "fields": ["公斤段"], "limit": 1}
    )
    assert response.json()["values"]["公斤段"] == ["0-60"]


def test_values_unknown_field(client) -> None:
    response = client.post(
        "/api/values", json={"dataset_id": "ds-values", "fields": ["不存在"]}
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "MISSING_FIELDS"
