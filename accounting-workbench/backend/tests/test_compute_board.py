"""看板（一键算）的数值自洽性测试。"""

from __future__ import annotations

from datetime import date

import pandas as pd
import pytest

from accounting_backend.compute.board import BOARD_BANDS, board_dim_sources, build_board
from accounting_backend.errors import AccountingError
from accounting_backend.schemas.analysis import TimeRange
from accounting_backend.schemas.board import BoardConfig


def _frame() -> pd.DataFrame:
    """2 个网点 × 2 个省份 × 2 个公斤段，数字便于手算。"""
    rows = []
    specs = [
        ("金东三部", "安徽省", "0-60", 100.0, 80.0, 100.0),
        ("金东三部", "安徽省", "150-300", 200.0, 150.0, 200.0),
        ("金东三部", "福建省", "0-60", 50.0, 45.0, 50.0),
        ("金华婺城", "安徽省", "0-60", 400.0, 320.0, 400.0),
    ]
    for net, province, band, weight, price, orig in specs:
        rows.append(
            {
                "账单时间": "2026-10-08",
                "寄件所属一级网点": net,
                "目的所属省份": province,
                "公斤段": band,
                "是否剔除": "不剔除",
                "物品来源": "普通物品",
                "结算重量": weight,
                "现价": price,
                "原价": orig,
            }
        )
    return pd.DataFrame(rows)


def _config(**kwargs) -> BoardConfig:
    base = {"time_range": TimeRange(start=date(2026, 10, 1), end=date(2026, 10, 31))}
    base.update(kwargs)
    return BoardConfig(**base)


def test_bands_and_totals() -> None:
    result = build_board(_frame(), _config())
    assert result.bands == BOARD_BANDS
    assert len(result.bands) == 6
    # 合计：货量 750，现价 595，原价 750
    assert result.sum_vol == pytest.approx(750)
    assert result.sum_price == pytest.approx(595)
    assert result.sum_orig == pytest.approx(750)
    # 加权折扣 / 单价必须等于底层重算结果
    assert result.weighted_disc == pytest.approx(595 / 750)
    assert result.weighted_unit == pytest.approx(595 / 750)


def test_share_sums_to_one() -> None:
    result = build_board(_frame(), _config())
    share = sum(cell.vol for row in result.rows for cell in row.cells) / result.sum_vol
    assert share == pytest.approx(1.0)


def test_simple_average_ignores_empty_cells() -> None:
    """简单平均只统计有货量的单元格（0-60 与 150-300）。"""
    result = build_board(_frame(), _config())
    discs = [cell.disc for row in result.rows for cell in row.cells if cell.vol > 0]
    assert result.simple_disc == pytest.approx(sum(discs) / len(discs))
    assert all(cell.disc is None for row in result.rows for cell in row.cells if cell.vol == 0)


def test_dimension_labels() -> None:
    single = build_board(_frame(), _config(dims=["省份"]))
    assert sorted(row.label for row in single.rows) == ["安徽省", "福建省"]
    assert single.dim_label == "省份"

    both = build_board(_frame(), _config(dims=["网点", "省份"]))
    assert "金东三部 · 安徽省" in [row.label for row in both.rows]
    assert both.dim_label == "网点 × 省份"


def test_net_filter_changes_totals() -> None:
    only_one = build_board(_frame(), _config(nets=["金华婺城"]))
    assert only_one.sum_vol == pytest.approx(400)
    assert only_one.row_count == 1


def test_time_range_changes_totals() -> None:
    frame = _frame()
    frame.loc[0, "账单时间"] = "2026-09-05"
    current = build_board(frame, _config())
    previous = build_board(
        frame, _config(time_range=TimeRange(start=date(2026, 9, 1), end=date(2026, 9, 30)))
    )
    assert current.sum_vol == pytest.approx(650)
    assert previous.sum_vol == pytest.approx(100)


def test_dim_sources_follow_selected_nets() -> None:
    sources = board_dim_sources(_frame(), _config(nets=["金华婺城"]))
    assert sources.nets == ["金华婺城"]
    assert sources.provinces == ["安徽省"]

    union = board_dim_sources(_frame(), _config())
    assert set(union.provinces) == {"安徽省", "福建省"}
    assert len(sources.provinces) < len(union.provinces)


def test_dim_value_filter() -> None:
    result = build_board(_frame(), _config(dim_values={"省份": ["福建省"]}))
    assert result.sum_vol == pytest.approx(50)


def test_missing_fields_raise() -> None:
    frame = _frame().drop(columns=["原价"])
    with pytest.raises(AccountingError) as exc:
        build_board(frame, _config())
    assert exc.value.code == "MISSING_FIELDS"


def test_no_data_raises() -> None:
    frame = _frame()
    config = _config(time_range=TimeRange(start=date(2020, 1, 1), end=date(2020, 1, 2)))
    with pytest.raises(AccountingError) as exc:
        build_board(frame, config)
    assert exc.value.code == "NO_DATA"
