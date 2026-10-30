"""编辑纯函数测试（edit_ops）。"""

from __future__ import annotations

import pandas as pd

from accounting_backend.compute.edit_ops import apply_command, apply_inverse_command


def _df():
    return pd.DataFrame(
        {"账单时间": ["2026-10-01", "2026-10-02"], "货量": [10, 20], "现价": [100, 200]}
    )


def test_set_cells_and_inverse():
    df = _df()
    new_df, inverse = apply_command(
        df, {"op": "set_cells", "payload": {"cells": [{"row": 0, "col": 1, "value": 99}]}}
    )
    assert new_df.iat[0, 1] == 99
    pd.testing.assert_frame_equal(apply_inverse_command(new_df, inverse), df)


def test_paste_expands_and_inverse():
    df = _df()
    new_df, inverse = apply_command(
        df,
        {
            "op": "paste",
            "payload": {"target_row": 1, "target_col": 1, "data": [[30, 300], [40, 400]]},
        },
    )
    assert new_df.shape == (3, 3)  # 超出边界自动扩展
    # 扩展经 reindex 加 NaN 行，使 int 列升 float64，dtype 属预期副作用，仅校验值
    pd.testing.assert_frame_equal(apply_inverse_command(new_df, inverse), df, check_dtype=False)


def test_delete_rows_roundtrip():
    df = _df()
    new_df, inverse = apply_command(df, {"op": "delete_rows", "payload": {"indices": [0]}})
    assert new_df.shape[0] == 1
    pd.testing.assert_frame_equal(apply_inverse_command(new_df, inverse), df)


def test_delete_cols_roundtrip():
    df = _df()
    new_df, inverse = apply_command(df, {"op": "delete_cols", "payload": {"indices": [1]}})
    assert list(new_df.columns) == ["账单时间", "现价"]
    pd.testing.assert_frame_equal(apply_inverse_command(new_df, inverse), df)


def test_insert_rows_roundtrip():
    df = _df()
    new_df, inverse = apply_command(df, {"op": "insert_rows", "payload": {"index": 1, "count": 2}})
    assert new_df.shape[0] == 4
    # 插入空行使数值列变 object，dtype 属预期变化，仅校验值
    pd.testing.assert_frame_equal(apply_inverse_command(new_df, inverse), df, check_dtype=False)


def test_insert_cols_roundtrip():
    df = _df()
    new_df, inverse = apply_command(
        df, {"op": "insert_cols", "payload": {"index": 1, "count": 1, "names": ["新列"]}}
    )
    assert list(new_df.columns) == ["账单时间", "新列", "货量", "现价"]
    pd.testing.assert_frame_equal(apply_inverse_command(new_df, inverse), df)


def test_cut_paste_roundtrip():
    df = _df()
    new_df, inverse = apply_command(
        df,
        {
            "op": "cut_paste",
            "payload": {
                "target_row": 1,
                "target_col": 1,
                "data": [[50]],
                "clear_region": {"row_start": 0, "row_end": 0, "col_start": 0, "col_end": 0},
            },
        },
    )
    assert new_df.iat[1, 1] == 50  # 新位置写入
    assert new_df.iat[0, 0] is None  # 原位置清空
    pd.testing.assert_frame_equal(apply_inverse_command(new_df, inverse), df)  # 一步恢复
