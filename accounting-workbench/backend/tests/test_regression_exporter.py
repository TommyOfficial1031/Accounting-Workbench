"""盈亏平衡导出文件夹的测试：文件齐全、PDF/XLSX/JPEG 都能被打开。"""

from __future__ import annotations

from pathlib import Path

import pytest
from openpyxl import load_workbook
from pypdf import PdfReader

from accounting_backend.compute.regression import manual_model, table_groups
from accounting_backend.io.regression_exporter import export_manual_folder, export_regression_folder
from accounting_backend.schemas.analysis import TimeRange
from accounting_backend.schemas.regression import (
    GroupPolicy,
    RegressionManualConfig,
    RegressionTableConfig,
)

from datetime import date

import pandas as pd

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

from accounting_backend.io.regression_exporter import (
    _group_chart,
    _plan_volume,
    _reference_lines,
    _x_max,
)


def _frame() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "账单时间": ["2026-10-08", "2026-10-09", "2026-10-10"],
            "寄件所属一级网点": ["金东三部", "金东三部", "金华婺城"],
            "目的所属省份": ["安徽省", "福建省", "安徽省"],
            "公斤段": ["0-60", "0-60", "0-60"],
            "结算重量": [100.0, 200.0, 400.0],
            "现价": [80.0, 180.0, 320.0],
            "原价": [100.0, 200.0, 400.0],
        }
    )


def _table_result():
    config = RegressionTableConfig(
        time_range=TimeRange(start=date(2026, 10, 1), end=date(2026, 10, 31)),
        picks={"寄件所属一级网点": ["金东三部", "金华婺城"]},
        policies={
            "金东三部": GroupPolicy(c_line=0.2, op_cost=0.05, d_plan=0.6, z_plan=500),
            "金华婺城": GroupPolicy(c_line=0.3, op_cost=0.08, d_plan=0.7, z_plan=800),
        },
    )
    return table_groups(_frame(), config)


def test_table_export_creates_four_kinds(tmp_path: Path) -> None:
    result = _table_result()
    payload = export_regression_folder(
        groups=result.groups,
        out_dir=tmp_path,
        stamp="2026-10-23 17：30",
        prefix="金东三部、金华婺城",
        advice=result.advice,
        totals={
            "profit_now": result.profit_now,
            "profit_plan": result.profit_plan,
            "rate_now": result.rate_now,
            "rate_plan": result.rate_plan,
            "z": result.z,
            "z_plan": result.z_plan,
            "filled_count": result.filled_count,
        },
    )
    folder = Path(payload["folder"])
    assert folder.is_dir()
    assert folder.name == "金东三部、金华婺城盈亏平衡与折扣分析 - 2026-10-23 17：30"

    names = payload["files"]
    assert "盈亏平衡与折扣分析.pdf" in names
    assert "小图网格.jpg" in names
    assert "汇算明细表.xlsx" in names
    singles = [name for name in names if name.startswith("小图-")]
    assert len(singles) == len(result.groups)  # 「小图网格.jpg」不以「小图-」开头

    for name in names:
        path = folder / name
        assert path.is_file(), name
        assert path.stat().st_size > 0

    pdf_bytes = (folder / "盈亏平衡与折扣分析.pdf").read_bytes()
    assert pdf_bytes.startswith(b"%PDF")
    assert pdf_bytes.rstrip().endswith(b"%%EOF")

    workbook = load_workbook(folder / "汇算明细表.xlsx")
    sheet = workbook["汇算明细"]
    assert sheet["A1"].value == "汇算明细表"
    assert sheet.cell(row=3, column=1).value == "分组"
    assert sheet.cell(row=3, column=11).value == "利润率"
    # 明细里折扣列按百分比格式
    assert sheet.cell(row=4, column=5).number_format == "0.0%"
    assert sheet.cell(row=4 + len(result.groups), column=1).value == "合计"


def test_manual_export_creates_four_files(tmp_path: Path) -> None:
    result = manual_model(
        RegressionManualConfig(
            p0=1.0, d=0.8, d_plan=0.7, b_now=3000, b_plan=2000, c=0.5, z_now=100_000, z_plan=120_000
        )
    )
    payload = export_manual_folder(result, tmp_path, "2026-10-23 17：30", "手动测算")
    folder = Path(payload["folder"])
    assert folder.name == "手动测算盈亏平衡与折扣分析 - 2026-10-23 17：30"
    assert sorted(payload["files"]) == sorted(
        ["盈亏平衡与折扣分析.pdf", "小图网格.jpg", "小图-01-货量-利润.jpg", "汇算明细表.xlsx"]
    )
    for name in payload["files"]:
        assert (folder / name).stat().st_size > 0

    workbook = load_workbook(folder / "汇算明细表.xlsx")
    sheet = workbook["承诺货量扫描"]
    assert sheet["A1"].value == "不同承诺货量下的保本折扣、利润与利润率"
    assert sheet.cell(row=4, column=6).value in {"盈利", "亏损", "持平", "盈利（B 兜底）"}


def test_folder_name_sanitizes(tmp_path: Path) -> None:
    result = _table_result()
    payload = export_regression_folder(
        groups=result.groups,
        out_dir=tmp_path,
        stamp="2026-10-23 17：30",
        prefix="a/b:c",
        advice="",
        totals={},
    )
    # 前缀里的非法字符只影响小图文件名，文件夹名按规范拼
    assert Path(payload["folder"]).is_dir()
    for name in payload["files"]:
        assert "/" not in name and ":" not in name


def test_every_card_gets_its_own_chart(tmp_path: Path) -> None:
    """第 11 轮 A③：卡片数与导出图数必须一致（10 张卡片 → 10 张单图 + 3 个汇总文件）。"""
    frame = pd.DataFrame(
        {
            "账单时间": [f"2026-10-{index:02d}" for index in range(1, 11)],
            "寄件所属一级网点": [f"网点{index}" for index in range(10)],
            "目的所属省份": ["安徽省"] * 10,
            "公斤段": ["0-60"] * 10,
            "结算重量": [100.0] * 10,
            "现价": [80.0] * 10,
            "原价": [100.0] * 10,
        }
    )
    config = RegressionTableConfig(
        time_range=TimeRange(start=date(2026, 10, 1), end=date(2026, 10, 31)),
        picks={"寄件所属一级网点": [f"网点{index}" for index in range(10)]},
    )
    result = table_groups(frame, config)
    assert len(result.groups) == 10

    payload = export_regression_folder(
        groups=result.groups,
        out_dir=tmp_path,
        stamp="2026-10-29 20：00",
        prefix="10 组",
        advice=result.advice,
        totals={"z": result.z, "profit_now": result.profit_now, "filled_count": 0},
    )
    names = payload["files"]
    singles = [name for name in names if name.startswith("小图-")]
    assert len(singles) == 10
    assert len(names) == 10 + 3  # PDF + 小图网格 + 汇算明细表
    # PDF 页数 = 1（结论）+ ceil(10 / 3) + 1（明细）
    reader = PdfReader(str(Path(payload["folder"]) / "盈亏平衡与折扣分析.pdf"))
    assert len(reader.pages) == 1 + 4 + 1

# ── 第 13 轮：导出图必须有图例 + 计划货量说明（用户 2026-10-29 反馈）──


def test_reference_lines_are_labelled_and_positioned() -> None:
    """保本线与计划货量竖线都要带 label（进图例），竖线画在真正的计划货量上。"""
    fig, ax = plt.subplots(figsize=(4, 3))
    try:
        _reference_lines(ax, 400, 1000)
        handles, labels = ax.get_legend_handles_labels()
        assert "保本线" in labels
        assert "计划货量" in labels
        plan_lines = [
            line
            for line in ax.lines
            if line.get_label() == "计划货量"
        ]
        assert len(plan_lines) == 1
        assert plan_lines[0].get_xdata()[0] == 400
        # 竖线顶端还有一行「计划货量 400 kg」的小字
        texts = [text.get_text() for text in ax.texts]
        assert any("计划货量" in item and "400" in item for item in texts)
    finally:
        plt.close(fig)


def test_group_chart_labels_both_lines_for_legend() -> None:
    """表格取数模式的单图：调整前 / 调整后 / 保本线 / 计划货量 四条都能进图例。"""
    result = table_groups(
        _frame(),
        RegressionTableConfig(
            time_range=TimeRange(start=date(2026, 10, 1), end=date(2026, 10, 31)),
            picks={"寄件所属一级网点": ["金东三部"]},
            policies={"金东三部": GroupPolicy(c_line=0.2, op_cost=0.05, d_plan=0.6, z_plan=500)},
        ),
    )
    group = result.groups[0]
    fig, ax = plt.subplots(figsize=(4.6, 3.2))
    try:
        _group_chart(ax, group, _x_max(result.groups))
        _, labels = ax.get_legend_handles_labels()
        assert labels == ["调整前", "调整后", "保本线", "计划货量"]
    finally:
        plt.close(fig)


def test_manual_plan_volume_comes_from_factor_one_step() -> None:
    """手动模式的计划货量 = 扫描表里 factor=1 的那一档（不是 3 × 计划货量）。"""
    result = manual_model(
        RegressionManualConfig(p0=1.0, d=0.8, d_plan=0.7, c=0.5, z_now=100_000, z_plan=120_000)
    )
    assert _plan_volume(result) == pytest.approx(120_000)