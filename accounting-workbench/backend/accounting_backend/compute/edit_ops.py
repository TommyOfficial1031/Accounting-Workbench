"""纯函数编辑操作：对 DataFrame 应用单元格/行列变更，并返回可逆的 delta inverse。

本模块只做 DataFrame 变换，不访问文件系统、网络或全局状态（AGENTS.md 分层约束）。
每个正向操作返回 (new_df, inverse_command)；inverse 为增量（仅记录被改动的数据），
避免 10 万行全量快照导致 undo 栈内存爆炸。
"""

from __future__ import annotations

from typing import Any

import pandas as pd


def apply_command(df: pd.DataFrame, cmd: dict) -> tuple[pd.DataFrame, dict]:
    """执行正向命令，返回 (新 DataFrame, inverse 命令)。"""
    op = cmd["op"]
    payload = cmd["payload"]
    if op == "set_cells":
        return set_cells(df, payload["cells"])
    if op == "paste":
        return paste(df, payload["target_row"], payload["target_col"], payload["data"])
    if op == "insert_rows":
        return insert_rows(df, payload["index"], payload["count"])
    if op == "insert_cols":
        return insert_cols(df, payload["index"], payload["count"], payload.get("names", []))
    if op == "delete_rows":
        return delete_rows(df, payload["indices"])
    if op == "delete_cols":
        return delete_cols(df, payload["indices"])
    if op == "cut_paste":
        return cut_paste(
            df,
            payload["target_row"],
            payload["target_col"],
            payload["data"],
            payload["clear_region"],
        )
    raise ValueError(f"未知编辑命令：{op}")


def apply_inverse_command(df: pd.DataFrame, inverse: dict) -> pd.DataFrame:
    """执行 inverse 命令，恢复到操作前状态。"""
    op = inverse["op"]
    payload = inverse["payload"]
    if op == "set_cells":
        result, _ = set_cells(df, payload["cells"])
        return result
    if op == "paste_inverse":
        return _paste_inverse(df, payload)
    if op == "delete_rows":
        result, _ = delete_rows(df, payload["indices"])
        return result
    if op == "delete_cols":
        result, _ = delete_cols(df, payload["indices"])
        return result
    if op == "insert_rows_inverse":
        return _insert_rows_inverse(df, payload)
    if op == "insert_cols_inverse":
        return _insert_cols_inverse(df, payload)
    if op == "cut_paste_inverse":
        return _cut_paste_inverse(df, payload)
    raise ValueError(f"未知 inverse 命令：{op}")


def set_cells(df: pd.DataFrame, cells: list[dict]) -> tuple[pd.DataFrame, dict]:
    """写单元格；inverse = 每个单元格的旧值。"""
    before = [
        {"row": c["row"], "col": c["col"], "value": _to_python(df.iat[c["row"], c["col"]])}
        for c in cells
    ]
    result = df.copy()
    for c in cells:
        result.iat[c["row"], c["col"]] = c["value"]
    return result, {"op": "set_cells", "payload": {"cells": before}}


def paste(df: pd.DataFrame, target_row: int, target_col: int, data: list[list[Any]]) -> tuple[pd.DataFrame, dict]:
    """粘贴二维数据，超出边界自动扩展；inverse 记录被覆盖单元格旧值 + 原形状。"""
    result = df.copy()
    original_rows, original_cols = df.shape
    before_cells: list[dict] = []
    for dr, row_values in enumerate(data):
        for dc, value in enumerate(row_values):
            r, c = target_row + dr, target_col + dc
            if r < original_rows and c < original_cols:
                before_cells.append({"row": r, "col": c, "value": _to_python(result.iat[r, c])})
            result = _ensure_shape(result, r, c)
            result.iat[r, c] = value
    inverse = {
        "op": "paste_inverse",
        "payload": {
            "before_cells": before_cells,
            "original_rows": original_rows,
            "original_cols": original_cols,
        },
    }
    return result, inverse


def insert_rows(df: pd.DataFrame, index: int, count: int) -> tuple[pd.DataFrame, dict]:
    """在 index 处插入 count 个空行；inverse = 删除这些行。"""
    result = df.copy()
    empty = pd.DataFrame([[None] * result.shape[1]] * count, columns=result.columns)
    result = pd.concat([result.iloc[:index], empty, result.iloc[index:]], ignore_index=True)
    return result, {"op": "delete_rows", "payload": {"indices": list(range(index, index + count))}}


def insert_cols(df: pd.DataFrame, index: int, count: int, names: list[str]) -> tuple[pd.DataFrame, dict]:
    """在 index 处插入 count 个空列；inverse = 删除这些列。"""
    result = df.copy()
    for i in range(count):
        name = names[i] if i < len(names) else f"列{result.shape[1] + 1}"
        result.insert(index + i, name, None)
    return result, {"op": "delete_cols", "payload": {"indices": list(range(index, index + count))}}


def delete_rows(df: pd.DataFrame, indices: list[int]) -> tuple[pd.DataFrame, dict]:
    """删除指定行（升序）；inverse = 在原始位置重插被删行。"""
    sorted_indices = sorted(indices)
    removed = df.iloc[sorted_indices]
    inverse = {
        "op": "insert_rows_inverse",
        "payload": {"indices": sorted_indices, "data": removed.to_dict(orient="split")},
    }
    result = df.drop(index=sorted_indices).reset_index(drop=True)
    return result, inverse


def delete_cols(df: pd.DataFrame, indices: list[int]) -> tuple[pd.DataFrame, dict]:
    """删除指定列（升序）；inverse = 在原始位置重插被删列。"""
    sorted_indices = sorted(indices)
    removed = df.iloc[:, sorted_indices]
    inverse = {
        "op": "insert_cols_inverse",
        "payload": {"indices": sorted_indices, "data": removed.to_dict(orient="split")},
    }
    result = df.drop(columns=[df.columns[i] for i in sorted_indices]).reset_index(drop=True)
    return result, inverse


def cut_paste(
    df: pd.DataFrame,
    target_row: int,
    target_col: int,
    data: list[list[Any]],
    clear_region: dict,
) -> tuple[pd.DataFrame, dict]:
    """剪切后粘贴：清空 clear_region + 写入 data，生成单个 composite inverse。"""
    result = df.copy()
    original_rows, original_cols = df.shape
    region_before: list[dict] = []
    for r in range(clear_region["row_start"], clear_region["row_end"] + 1):
        for c in range(clear_region["col_start"], clear_region["col_end"] + 1):
            if r < original_rows and c < original_cols:
                region_before.append({"row": r, "col": c, "value": _to_python(result.iat[r, c])})
                result.iat[r, c] = None

    paste_before: list[dict] = []
    for dr, row_values in enumerate(data):
        for dc, value in enumerate(row_values):
            r, c = target_row + dr, target_col + dc
            if r < original_rows and c < original_cols:
                paste_before.append({"row": r, "col": c, "value": _to_python(result.iat[r, c])})
            result = _ensure_shape(result, r, c)
            result.iat[r, c] = value

    inverse = {
        "op": "cut_paste_inverse",
        "payload": {
            "region_before": region_before,
            "paste_before": paste_before,
            "original_rows": original_rows,
            "original_cols": original_cols,
        },
    }
    return result, inverse


def _paste_inverse(df: pd.DataFrame, payload: dict) -> pd.DataFrame:
    result = df.iloc[: payload["original_rows"], : payload["original_cols"]].copy()
    for c in payload["before_cells"]:
        result.iat[c["row"], c["col"]] = c["value"]
    return result


def _cut_paste_inverse(df: pd.DataFrame, payload: dict) -> pd.DataFrame:
    result = df.iloc[: payload["original_rows"], : payload["original_cols"]].copy()
    for c in payload["region_before"]:
        result.iat[c["row"], c["col"]] = c["value"]
    for c in payload["paste_before"]:
        result.iat[c["row"], c["col"]] = c["value"]
    return result


def _insert_rows_inverse(df: pd.DataFrame, payload: dict) -> pd.DataFrame:
    result = df.copy()
    data_df = pd.DataFrame(payload["data"]["data"], columns=payload["data"]["columns"])
    for offset, index in enumerate(payload["indices"]):
        result = pd.concat(
            [result.iloc[:index], data_df.iloc[[offset]], result.iloc[index:]],
            ignore_index=True,
        )
    return result


def _insert_cols_inverse(df: pd.DataFrame, payload: dict) -> pd.DataFrame:
    result = df.copy()
    data = payload["data"]
    columns = data["columns"]
    rows = data["data"]
    for offset, index in enumerate(payload["indices"]):
        col_values = [row[offset] for row in rows]
        result.insert(index, columns[offset], col_values)
    return result


def _ensure_shape(df: pd.DataFrame, row: int, col: int) -> pd.DataFrame:
    """扩展 DataFrame 到能容纳 (row, col)，返回（可能新的）DataFrame。"""
    while df.shape[1] <= col:
        df.insert(df.shape[1], f"列{df.shape[1] + 1}", None)
    if df.shape[0] <= row:
        df = df.reindex(range(row + 1))
    return df


def _to_python(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if hasattr(value, "item"):
        return value.item()
    return value
