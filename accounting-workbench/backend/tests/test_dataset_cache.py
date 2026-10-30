"""数据集缓存归一化测试（混合类型列写 parquet 不崩溃）。"""

from __future__ import annotations

import pandas as pd

from accounting_backend.storage import paths
from accounting_backend.storage.dataset_cache import cache_dataframe, load_dataframe


def test_mixed_type_column_normalized(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, "get_data_dir", lambda: tmp_path)
    df = pd.DataFrame({"金额": [123.45, "N/A", None, 678.9, "abc"]})

    path = cache_dataframe("混合数据", df)  # 中文 dataset_id，模拟中文路径
    assert path.endswith(".parquet")

    loaded = load_dataframe("混合数据")
    values = [None if (v is None or pd.isna(v)) else v for v in loaded["金额"].tolist()]
    # 混合 object 列统一为 str（数值也转成字符串），空值保留为 null
    assert values[0] == "123.45"
    assert values[1] == "N/A"
    assert values[2] is None
    assert values[3] == "678.9"
    assert values[4] == "abc"


def test_pure_object_column_unchanged(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, "get_data_dir", lambda: tmp_path)
    df = pd.DataFrame({"名称": ["a", "b", "c"]})
    cache_dataframe("obj", df)
    loaded = load_dataframe("obj")
    assert loaded["名称"].tolist() == ["a", "b", "c"]
