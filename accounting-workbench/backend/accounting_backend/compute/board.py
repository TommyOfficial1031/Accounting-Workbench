"""一键算（看板）的纯计算：筛选 → 分组 → 6 个公斤段的量/价/折扣。

与前端原型 `buildBoardMerged()` 同口径：
``综合折扣 = Σ现价 ÷ Σ原价``、``综合单价 = Σ现价 ÷ Σ结算重量``；
简单平均只统计「有货量」的单元格，避免 0 货量把均值拉低。
"""

from __future__ import annotations

import math
from typing import Optional

import pandas as pd

from accounting_backend.compute.time_dimension import apply_time_range
from accounting_backend.errors import AccountingError
from accounting_backend.schemas.board import (
    BOARD_BANDS,
    DIM_FIELD,
    BoardCell,
    BoardConfig,
    BoardDimSources,
    BoardResult,
    BoardRow,
)


def _safe_div(numerator: float, denominator: float) -> Optional[float]:
    """分母为 0 时返回 None（禁止 inf/NaN 泄漏到接口）。"""
    if denominator is None or not math.isfinite(denominator) or abs(denominator) < 1e-12:
        return None
    return numerator / denominator


def _cell(vol: float, price: float, orig: float) -> BoardCell:
    """把三元组包装成单元格（附带折扣/单价）。"""
    return BoardCell(
        vol=vol,
        price=price,
        orig=orig,
        disc=_safe_div(price, orig),
        unit=_safe_div(price, vol),
    )


def _filter(df: pd.DataFrame, config: BoardConfig) -> pd.DataFrame:
    """应用时间范围与三种口径筛选。"""
    for field in ("结算重量", "现价", "原价", "公斤段"):
        if field not in df.columns:
            raise AccountingError("MISSING_FIELDS", f"缺少字段：{field}", {"missing": [field]})

    ranged, _unknown = apply_time_range(df, config.time_range)
    view = ranged

    if "是否剔除" in view.columns and config.exclude:
        view = view[view["是否剔除"].astype(str) == config.exclude]
    if "物品来源" in view.columns and config.source:
        view = view[view["物品来源"].astype(str) == config.source]
    if config.nets:
        view = view[view[DIM_FIELD["网点"]].astype(str).isin([str(net) for net in config.nets])]
    for dim, values in config.dim_values.items():
        field = DIM_FIELD.get(dim)
        if field and values and field in view.columns:
            view = view[view[field].astype(str).isin([str(value) for value in values])]
    return view


def build_board(df: pd.DataFrame, config: BoardConfig) -> BoardResult:
    """按分组维度汇总 6 个公斤段，返回看板需要的全部数值。"""
    view = _filter(df, config)
    if view.empty:
        raise AccountingError("NO_DATA", "当前筛选条件下没有数据")

    bands = [band for band in BOARD_BANDS]
    dims = [dim for dim in config.dims if dim in DIM_FIELD] or ["省份"]
    group_fields = [DIM_FIELD[dim] for dim in dims]

    view = view.assign(**{"_band": view["公斤段"].astype(str)})
    for field in ("结算重量", "现价", "原价"):
        view[field] = pd.to_numeric(view[field], errors="coerce").fillna(0.0)

    # (分组标签, 公斤段) -> 三元组
    buckets: dict[tuple[str, str], list[float]] = {}
    for key, group in view.groupby(group_fields, dropna=False, sort=True):
        values = key if isinstance(key, tuple) else (key,)
        label = " · ".join(str(value) for value in values)
        for band, band_rows in group.groupby("_band", sort=False):
            slot = buckets.setdefault((label, str(band)), [0.0, 0.0, 0.0])
            slot[0] += float(band_rows["结算重量"].sum())
            slot[1] += float(band_rows["现价"].sum())
            slot[2] += float(band_rows["原价"].sum())

    labels = sorted({label for label, _band in buckets})
    rows: list[BoardRow] = []
    band_totals = [[0.0, 0.0, 0.0] for _ in bands]
    for label in labels:
        cells: list[BoardCell] = []
        for index, band in enumerate(bands):
            vol, price, orig = buckets.get((label, band), [0.0, 0.0, 0.0])
            cells.append(_cell(vol, price, orig))
            band_totals[index][0] += vol
            band_totals[index][1] += price
            band_totals[index][2] += orig
        rows.append(BoardRow(label=label, cells=cells))

    sum_vol = sum(item[0] for item in band_totals)
    sum_price = sum(item[1] for item in band_totals)
    sum_orig = sum(item[2] for item in band_totals)
    discs = [cell.disc for row in rows for cell in row.cells if cell.disc is not None and cell.vol > 0]
    units = [cell.unit for row in rows for cell in row.cells if cell.unit is not None and cell.vol > 0]

    return BoardResult(
        rows=rows,
        bands=bands,
        band_totals=[_cell(*item) for item in band_totals],
        sum_vol=sum_vol,
        sum_price=sum_price,
        sum_orig=sum_orig,
        weighted_disc=_safe_div(sum_price, sum_orig),
        weighted_unit=_safe_div(sum_price, sum_vol),
        simple_disc=(sum(discs) / len(discs)) if discs else None,
        simple_unit=(sum(units) / len(units)) if units else None,
        dim_label=" × ".join(dims),
        row_count=len(rows),
        scanned=int(len(df)),
        filtered=int(len(view)),
    )


def board_dim_sources(df: pd.DataFrame, config: BoardConfig) -> BoardDimSources:
    """维度候选值：网点 = 库里的全部网点；省份 = 已选网点实际覆盖到的省份。"""
    if DIM_FIELD["网点"] not in df.columns or DIM_FIELD["省份"] not in df.columns:
        raise AccountingError("MISSING_FIELDS", "缺少网点或省份字段")

    from collections import Counter

    all_nets = sorted({str(value) for value in df[DIM_FIELD["网点"]].dropna().unique()})
    nets = [str(net) for net in config.nets] or all_nets

    scoped = df[df[DIM_FIELD["网点"]].astype(str).isin(nets)]
    weights = pd.to_numeric(scoped["结算重量"], errors="coerce").fillna(0.0)
    covered = Counter()
    for province, weight in zip(scoped[DIM_FIELD["省份"]].astype(str), weights):
        covered[province] += float(weight)
    provinces = sorted(province for province, weight in covered.items() if weight > 0)
    return BoardDimSources(nets=nets, provinces=provinces)
