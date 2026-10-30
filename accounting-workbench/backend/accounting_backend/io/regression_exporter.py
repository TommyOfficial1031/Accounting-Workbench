"""把盈亏平衡分析导出成一个文件夹（PDF + 网格 JPEG + 单图 JPEG + 汇算明细 XLSX）。

布局与前端原型一致：

* ``盈亏平衡与折扣分析.pdf``：多页 —— 第 1 页「分析结论 + 调整盈亏情况分析」，
  之后每页 3 张分组小图，最后一页「汇算明细表」；
* ``小图网格.jpg``：所有分组小图按 3 列拼一张；
* ``小图-NN-<组名>.jpg``：每个分组一张；
* ``汇算明细表.xlsx``：表头 + 明细 + 合计，折扣/利润率按百分比格式。

本模块只做格式转换（AGENTS.md backend 「io/ 只做格式转换」）。
"""

from __future__ import annotations

import math
import re
from pathlib import Path
from typing import Optional, Sequence

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
from matplotlib.ticker import FuncFormatter
from openpyxl import Workbook
from openpyxl.styles import Font
from openpyxl.utils import get_column_letter

from accounting_backend.chart.builder import format_tick
from accounting_backend.chart.fonts import cjk_font, get_cjk_font, register_fonts
from accounting_backend.errors import AccountingError
from accounting_backend.schemas.regression import (
    RegressionGroup,
    RegressionManualResult,
    RegressionStep,
)

FOLDER_SUFFIX = "盈亏平衡与折扣分析"
_BAD_CHARS = re.compile(r'[\\/:*?"<>|]')
PALETTE = ["#0071e3", "#ff9500", "#34c759", "#ff3b30", "#8b5cf6", "#0ea5e9"]
#: 参考线颜色：调整前 = 中性灰虚线（与手动模式导出一致）、保本线 = 红、计划货量 = 灰
_LINE_BEFORE = "#6e6e73"
_LINE_ZERO = "#ff3b30"
_LINE_PLAN = "#8e8e93"


def safe_name(text: str) -> str:
    """Windows 文件名不能出现半角特殊字符，统一替换成下划线。"""
    return _BAD_CHARS.sub("_", text).strip() or "未命名"


def folder_name(prefix: str, stamp: str) -> str:
    """``<前缀>盈亏平衡与折扣分析 - YYYY-MM-DD HH：MM``（时间用全角冒号）。

    前缀里的 Windows 非法字符（\\ / : * ? " < > |）会被替换成下划线。
    """
    # 半角冒号在 Windows 文件名里非法（会报 WinError 267 目录名称无效），统一转全角
    safe_stamp = stamp.replace(":", "：")
    return f"{safe_name(prefix)}{FOLDER_SUFFIX} - {safe_stamp}"


def _money(value: Optional[float]) -> str:
    """金额文案，与前端 ``regMoney`` 一致。"""
    if value is None or not math.isfinite(value):
        return "—"
    rounded = 0.0 if abs(value) < 0.5 else value
    return f"{'-¥' if rounded < 0 else '¥'}{abs(rounded):,.0f}"


def _pct(value: Optional[float], digits: int = 2) -> str:
    """百分比文案，``None`` 输出破折号。"""
    if value is None or not math.isfinite(value):
        return "—"
    return f"{value * 100:.{digits}f}%"


def _num(value: Optional[float], digits: int = 4) -> str:
    """保留小数的数值文案。"""
    if value is None or not math.isfinite(value):
        return "—"
    return f"{value:.{digits}f}"


def _figure_bg() -> str:
    """导出统一白底（AGENTS.md 禁止非白底）。"""
    return "#ffffff"


def _setup() -> None:
    """注册中文字体，并把全局字号调小一点以便容纳表格。"""
    register_fonts()
    plt.rcParams["axes.unicode_minus"] = False
    plt.rcParams["font.size"] = 9


def _group_chart(ax, group: RegressionGroup, x_max: float) -> None:
    """画一个分组的两条线（调整前虚线 / 调整后实线）+ 保本线与计划货量参考线。

    第 13 轮（用户 2026-10-29 反馈「表格取数模式导出的图表没有图例和计划货量参考线的说明」）：

    * 调整前改成**中性灰虚线**（原来两条线同色，加了图例也分不清哪条是哪条），
      调整后保留分组色实线 —— 与手动输入模式导出的观感一致；
    * 保本线、计划货量竖线都带 ``label``，图例里能一一对上；
    * 竖线顶端另写一行小字「计划货量 400 kg」，不开图例也能看出来这条线是什么。

    图例不在这里画：单图 / 网格 / PDF 每页都调这个函数，图例由调用方按「一张画布一条」
    统一画在底部（``_legend_below``），免得每个子图都长出重复的图例。
    """
    font = get_cjk_font()
    color = PALETTE[abs(hash(group.label)) % len(PALETTE)]
    steps = 24
    xs = [x_max * index / steps for index in range(steps + 1)]
    m_now = (group.p or 0.0) - group.c
    ax.plot(
        xs,
        [m_now * x for x in xs],
        linestyle="--",
        linewidth=1.2,
        color=_LINE_BEFORE,
        label="调整前",
    )
    if group.filled and group.p_plan is not None:
        m_plan = group.p_plan - group.c
        ax.plot(xs, [m_plan * x for x in xs], linewidth=1.9, color=color, label="调整后")
    _reference_lines(ax, group.z_plan, x_max)
    ax.set_title(group.label, fontproperties=font, fontsize=9, loc="left")
    ax.set_xlabel("货量（kg）", fontproperties=font, fontsize=8)
    ax.set_ylabel("利润（元）", fontproperties=font, fontsize=8)
    ax.grid(alpha=0.25, linewidth=0.5)
    ax.tick_params(labelsize=7)
    # 刻度千以上用千分位（1,000），与界面/看板导出同一套（用户 2026-10-29 定稿）
    for axis in (ax.xaxis, ax.yaxis):
        axis.set_major_formatter(FuncFormatter(format_tick))
    for label in ax.get_xticklabels() + ax.get_yticklabels():
        label.set_fontproperties(font)


def _reference_lines(ax, z_plan: Optional[float], x_max: float) -> None:
    """保本线（利润 0）+ 计划货量竖线；两条都带 ``label``，并给竖线加文字说明。

    图例里写「计划货量」不带数值：网格/PDF 一页 3 张图共用一条图例，各组的计划货量不同，
    带数值会串组；具体数值写在竖线顶端的小字里（``_annotate_plan``）。
    """
    ax.axhline(0, color=_LINE_ZERO, linestyle="--", linewidth=0.9, label="保本线")
    if z_plan:
        ax.axvline(
            z_plan,
            color=_LINE_PLAN,
            linestyle="--",
            linewidth=0.9,
            label="计划货量",
        )
        _annotate_plan(ax, z_plan, x_max)


def _annotate_plan(ax, z_plan: float, x_max: float) -> None:
    """在计划货量竖线顶端写一行小字（贴边对齐，别被裁到画布外）。"""
    font = get_cjk_font()
    ratio = z_plan / x_max if x_max > 0 else 0.0
    align_right = ratio > 0.72
    ax.text(
        z_plan,
        0.985,
        f"计划货量 {format_tick(z_plan)} kg",
        transform=ax.get_xaxis_transform(),
        ha="right" if align_right else "left",
        va="top",
        fontproperties=font,
        fontsize=6.5,
        color="#6e6e73",
        bbox={
            "boxstyle": "round,pad=0.2",
            "facecolor": "#ffffff",
            "edgecolor": "none",
            "alpha": 0.86,
        },
        zorder=6,
    )


def _legend_below(
    fig, ax_source, *, font_size: float = 7.0, gap_in: float = 0.12
) -> None:
    """把 ``ax_source`` 的图例画在**画布正下方**，并按真实高度把底边距留够。

    与 ``chart/builder.py`` 的 ``_draw_legend`` 同一套思路（坑 67）：用 ``fig.legend`` 而不是
    ``ax.legend``，图例在画布内部，``bbox_inches="tight"`` 不会把宽高比撑跑；
    底边距 = 原来的底边距（已经含 X 轴刻度）+ 图例高度 + 一点间隙。
    """
    handles, labels = ax_source.get_legend_handles_labels()
    if not handles:
        return
    bottom_now = min((item.get_position().y0 for item in fig.axes), default=0.0)
    legend = fig.legend(
        handles,
        labels,
        loc="lower center",
        bbox_to_anchor=(0.5, 0.006),
        ncol=max(1, min(len(labels), 4)),
        frameon=False,
        prop=cjk_font(font_size),
        borderaxespad=0.0,
        handlelength=1.6,
        columnspacing=1.2,
    )
    fig.canvas.draw()
    legend_in = legend.get_window_extent(fig.canvas.get_renderer()).height / fig.dpi
    height_in = fig.get_size_inches()[1] or 1.0
    fig.subplots_adjust(bottom=max(bottom_now, bottom_now + (legend_in + gap_in) / height_in))


def _x_max(groups: Sequence[RegressionGroup]) -> float:
    """横轴上限：所有组「数据货量 / 计划货量」的最大值的 1.6 倍。"""
    peak = max(
        [max(group.z, group.z_plan or 0.0) for group in groups] or [1.0],
    )
    return max(peak * 1.6, 1.0)


def _write_single_charts(groups: Sequence[RegressionGroup], out_dir: Path, x_max: float) -> list[Path]:
    """每个分组一张 JPEG。"""
    paths: list[Path] = []
    for index, group in enumerate(groups, start=1):
        fig, ax = plt.subplots(figsize=(4.6, 3.2), dpi=200)
        fig.patch.set_facecolor(_figure_bg())
        _group_chart(ax, group, x_max)
        name = f"小图-{index:02d}-{safe_name(group.label)}.jpg"
        path = out_dir / name
        fig.tight_layout()
        # 图例画在画布正下方（用户 2026-10-29 反馈：表格取数模式导出的图没有图例）
        _legend_below(fig, ax)
        fig.savefig(path, format="jpeg", facecolor=_figure_bg(), pil_kwargs={"quality": 92})
        plt.close(fig)
        paths.append(path)
    return paths


def _write_grid(groups: Sequence[RegressionGroup], out_dir: Path, x_max: float) -> Path:
    """所有分组小图按 3 列拼一张。"""
    columns = min(3, max(1, len(groups)))
    rows = math.ceil(len(groups) / columns)
    fig, axes = plt.subplots(rows, columns, figsize=(4.4 * columns, 3.0 * rows), dpi=180, squeeze=False)
    fig.patch.set_facecolor(_figure_bg())
    for index in range(rows * columns):
        ax = axes[index // columns][index % columns]
        if index < len(groups):
            _group_chart(ax, groups[index], x_max)
        else:
            ax.axis("off")
    fig.tight_layout()
    if groups:
        # 所有子图共用同一套图例（调整前 / 调整后 / 保本线 / 计划货量），整张画布只画一条
        _legend_below(fig, axes[0][0])
    path = out_dir / "小图网格.jpg"
    fig.savefig(path, format="jpeg", facecolor=_figure_bg(), pil_kwargs={"quality": 90})
    plt.close(fig)
    return path


def _cards_text(groups: Sequence[RegressionGroup], totals: dict) -> list[str]:
    """第 1 页的结论文字（与页面上的两张卡一致）。"""
    return [
        f"① 政策调整前：{_money(totals.get('profit_now'))}"
        f"（利润率 {_pct(totals.get('rate_now'))}）",
        f"② 政策调整后："
        f"{_money(totals.get('profit_plan')) if totals.get('profit_plan') is not None else '待填四个值'}"
        f"（利润率 {_pct(totals.get('rate_plan'))}）",
        f"合计：数据货量 {totals.get('z', 0):,.0f} kg · "
        f"计划货量 {('%.0f' % totals['z_plan']) + ' kg' if totals.get('z_plan') else '—'}",
        f"已填 {totals.get('filled_count', 0)} / {len(groups)} 组",
    ]


def _write_pdf(
    groups: Sequence[RegressionGroup],
    out_dir: Path,
    x_max: float,
    title: str,
    subtitle: str,
    cards: Sequence[str],
    advice: str,
) -> Path:
    """多页 PDF：结论 + 每页 3 张小图 + 汇算明细表。"""
    font = get_cjk_font()
    path = out_dir / f"{FOLDER_SUFFIX}.pdf"
    with PdfPages(path) as pdf:
        # 第 1 页：结论与分析
        fig = plt.figure(figsize=(9.5, 6.2), dpi=140)
        fig.patch.set_facecolor(_figure_bg())
        fig.text(0.06, 0.92, title, fontproperties=font, fontsize=17, weight="bold")
        fig.text(0.06, 0.88, subtitle, fontproperties=font, fontsize=8.5, color="#6e6e73")
        fig.text(0.06, 0.81, "一、分析结论", fontproperties=font, fontsize=11, weight="bold")
        y = 0.76
        for line in cards:
            fig.text(0.08, y, line, fontproperties=font, fontsize=9.5)
            y -= 0.045
        fig.text(0.06, y - 0.02, "二、调整盈亏情况分析", fontproperties=font, fontsize=11, weight="bold")
        wrapped = _wrap(advice, 60)
        y -= 0.07
        for line in wrapped:
            fig.text(0.08, y, line, fontproperties=font, fontsize=9)
            y -= 0.042
        pdf.savefig(fig, facecolor=_figure_bg())
        plt.close(fig)

        # 小图：每页 3 张
        for start in range(0, len(groups), 3):
            chunk = groups[start : start + 3]
            fig, axes = plt.subplots(1, 3, figsize=(9.5, 3.4), dpi=140, squeeze=False)
            fig.patch.set_facecolor(_figure_bg())
            for index in range(3):
                ax = axes[0][index]
                if index < len(chunk):
                    _group_chart(ax, chunk[index], x_max)
                else:
                    ax.axis("off")
            fig.tight_layout()
            if chunk:
                # 每页只画一条图例（三张子图共用同一套），用户 2026-10-29 反馈补的
                _legend_below(fig, axes[0][0])
            pdf.savefig(fig, facecolor=_figure_bg())
            plt.close(fig)

        # 最后一页：汇算明细表
        columns = ["分组", "数据货量", "原价", "现价", "折扣", "成本", "调整前", "调整后", "利润率", "判定"]
        rows = [
            [
                group.label,
                f"{group.z:,.0f}",
                _num(group.p0, 3),
                _num(group.p, 3),
                _pct(group.d, 1),
                _num(group.c, 3),
                _money(group.profit_now),
                _money(group.profit_plan) if group.filled else "—",
                _pct(group.rate_plan),
                _judge(group),
            ]
            for group in groups
        ]
        fig, ax = plt.subplots(figsize=(9.5, 1.2 + 0.34 * len(rows)), dpi=140)
        fig.patch.set_facecolor(_figure_bg())
        ax.axis("off")
        ax.set_title("三、汇算明细表", fontproperties=font, fontsize=11, loc="left", pad=6)
        table = ax.table(cellText=rows, colLabels=columns, loc="upper center", cellLoc="left")
        table.auto_set_font_size(False)
        table.set_fontsize(7.5)
        table.scale(1, 1.25)
        for (row, _col), cell in table.get_celld().items():
            cell.set_text_props(fontproperties=font)
            if row == 0:
                cell.set_facecolor("#f2f2f4")
        fig.tight_layout()
        pdf.savefig(fig, facecolor=_figure_bg())
        plt.close(fig)
    return path


def _judge(group: RegressionGroup) -> str:
    """与前端判定一致：待填值 / 盈利 / 亏损 / 持平。"""
    if not group.filled or group.profit_plan is None:
        return "待填值"
    if group.profit_plan > 1e-9:
        return "盈利"
    if group.profit_plan < -1e-9:
        return "亏损"
    return "持平"


def _wrap(text: str, width: int) -> list[str]:
    """按字数折行（中文按字符宽度近似即可）。"""
    if not text:
        return []
    lines: list[str] = []
    current = ""
    for char in text:
        current += char
        if len(current) >= width:
            lines.append(current)
            current = ""
    if current:
        lines.append(current)
    return lines


def _write_xlsx(groups: Sequence[RegressionGroup], out_dir: Path) -> Path:
    """汇算明细表：表头加粗、折扣/利润率按百分比、含合计行。"""
    path = out_dir / "汇算明细表.xlsx"
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "汇算明细"
    sheet["A1"] = "汇算明细表"
    sheet["A1"].font = Font(bold=True, size=14)

    headers = ["分组", "数据货量", "原价", "现价", "折扣", "成本", "计划折扣", "计划货量", "调整前", "调整后", "利润率", "判定"]
    for index, header in enumerate(headers, start=1):
        cell = sheet.cell(row=3, column=index, value=header)
        cell.font = Font(bold=True)

    for offset, group in enumerate(groups):
        row = 4 + offset
        values = [
            group.label,
            round(group.z, 2),
            group.p0,
            group.p,
            group.d,
            round(group.c, 4),
            group.d_plan if group.filled else None,
            group.z_plan if group.filled else None,
            round(group.profit_now, 2),
            group.profit_plan if group.filled else None,
            group.rate_plan,
            _judge(group),
        ]
        for index, value in enumerate(values, start=1):
            sheet.cell(row=row, column=index, value=value)
        for column in (5, 7, 11):
            sheet.cell(row=row, column=column).number_format = "0.0%"

    total_row = 4 + len(groups)
    sheet.cell(row=total_row, column=1, value="合计").font = Font(bold=True)
    sheet.cell(row=total_row, column=2, value=round(sum(group.z for group in groups), 2))
    sheet.cell(
        row=total_row,
        column=9,
        value=round(sum(group.profit_now for group in groups), 2),
    )

    widths = [26, 12, 10, 10, 8, 8, 10, 11, 11, 11, 9, 9]
    for index, width in enumerate(widths, start=1):
        sheet.column_dimensions[get_column_letter(index)].width = width
    workbook.save(path)
    return path


def export_regression_folder(
    groups: Sequence[RegressionGroup],
    out_dir: Path,
    stamp: str,
    prefix: str,
    advice: str,
    totals: dict,
) -> dict:
    """生成一个文件夹：PDF + 网格 JPEG + 单图 JPEG + XLSX，返回清单。"""
    _setup()
    target = out_dir / folder_name(prefix, stamp)
    target.mkdir(parents=True, exist_ok=True)
    x_max = _x_max(groups)
    subtitle = folder_name(prefix, stamp)

    pdf = _write_pdf(
        groups,
        target,
        x_max,
        title="盈亏平衡与折扣分析",
        subtitle=subtitle,
        cards=_cards_text(groups, totals),
        advice=advice,
    )
    grid = _write_grid(groups, target, x_max)
    singles = _write_single_charts(groups, target, x_max)
    xlsx = _write_xlsx(groups, target)

    files = [pdf.name, grid.name] + [path.name for path in singles] + [xlsx.name]
    # 断言：导出文件数 == 卡片数 + 3（PDF + 网格图 + 汇算明细表）。
    # 第 11 轮 A③：前端曾用 groups.slice(0, 6/8) 截断，导出这边一直是全量，
    # 这里补一条硬约束，防止以后任何一侧又被截断而对不上。
    expected = len(groups) + 3
    if len(files) != expected:
        raise AccountingError(
            "EXPORT_FILE_COUNT_MISMATCH",
            f"导出文件数（{len(files)}）与卡片数（{len(groups)}）+ 3 不一致",
            {"groups": len(groups), "files": files},
        )
    return {"folder": str(target), "files": files}


def _plan_volume(result: RegressionManualResult) -> Optional[float]:
    """手动测算的「计划货量」= 扫描表里 factor = 1 的那一档（默认 [0.5, 1, 1.5, 2, 3] × 计划货量）。"""
    best: Optional[RegressionStep] = None
    for step in result.steps:
        if best is None or abs(step.factor - 1.0) < abs(best.factor - 1.0):
            best = step
    if best is None or abs(best.factor - 1.0) > 1e-6:
        return None
    return best.z


def export_manual_folder(result: RegressionManualResult, out_dir: Path, stamp: str, prefix: str) -> dict:
    """手动测算模式：只有一张图，仍导出同样的四类文件（单图 1 张）。"""
    _setup()
    target = out_dir / folder_name(prefix, stamp)
    target.mkdir(parents=True, exist_ok=True)

    font = get_cjk_font()
    # 横轴到扫描表最后一档（默认 3 × 计划货量）；竖线落在**真正的计划货量**上
    # （原来画在 steps[-1].z×2÷2 = 3 × 计划货量处，标注「计划货量」是错的，第 13 轮一并修）
    x_max = max(max((step.z for step in result.steps), default=1.0), 1.0)
    xs = [x_max * index / 40 for index in range(41)]

    fig, ax = plt.subplots(figsize=(6.4, 3.7), dpi=180)
    fig.patch.set_facecolor(_figure_bg())
    ax.plot(xs, [result.m_now * x for x in xs], linestyle="--", linewidth=1.3, color=_LINE_BEFORE, label="调整前")
    ax.plot(xs, [result.m_plan * x for x in xs], linewidth=2.0, color="#0071e3", label="调整后")
    # 保本线 + 计划货量参考线（都带 label，图例里能对上；竖线顶端再写一行小字）
    _reference_lines(ax, _plan_volume(result), x_max)
    ax.set_xlabel("货量（kg）", fontproperties=font, fontsize=9)
    ax.set_ylabel("利润（元）", fontproperties=font, fontsize=9)
    ax.set_title("货量 – 利润：调整前 vs 调整后", fontproperties=font, fontsize=10, loc="left")
    ax.grid(alpha=0.25, linewidth=0.5)
    for axis in (ax.xaxis, ax.yaxis):
        axis.set_major_formatter(FuncFormatter(format_tick))
    for label in ax.get_xticklabels() + ax.get_yticklabels():
        label.set_fontproperties(font)
    fig.tight_layout()
    # 图例统一画在画布下方（与表格取数模式同一套，用户 2026-10-29 反馈对照）
    _legend_below(fig, ax, font_size=8.0)
    single = target / "小图-01-货量-利润.jpg"
    fig.savefig(single, format="jpeg", facecolor=_figure_bg(), pil_kwargs={"quality": 92})
    plt.close(fig)

    grid = target / "小图网格.jpg"
    grid.write_bytes(single.read_bytes())

    pdf = target / f"{FOLDER_SUFFIX}.pdf"
    with PdfPages(pdf) as pages:
        fig = plt.figure(figsize=(9.5, 5.2), dpi=140)
        fig.patch.set_facecolor(_figure_bg())
        fig.text(0.06, 0.9, "盈亏平衡与折扣分析", fontproperties=font, fontsize=17, weight="bold")
        fig.text(0.06, 0.85, folder_name(prefix, stamp), fontproperties=font, fontsize=8.5, color="#6e6e73")
        fig.text(0.06, 0.77, "一、分析结论", fontproperties=font, fontsize=11, weight="bold")
        lines = [
            f"① 政策调整前：{_money(result.profit_now)}（利润率 {_pct(result.rate_now)}）",
            f"② 政策调整后：{_money(result.profit_plan)}（利润率 {_pct(result.rate_plan)}）",
            f"保本折扣 {_pct(result.break_even_discount)} · 1 百分点折扣 ≈ {_money(result.one_pct)}",
        ]
        y = 0.71
        for line in lines:
            fig.text(0.08, y, line, fontproperties=font, fontsize=9.5)
            y -= 0.05
        fig.text(0.06, y - 0.01, "二、调整盈亏情况分析", fontproperties=font, fontsize=11, weight="bold")
        y -= 0.07
        for line in _wrap(result.advice, 58):
            fig.text(0.08, y, line, fontproperties=font, fontsize=9)
            y -= 0.042
        pages.savefig(fig, facecolor=_figure_bg())
        plt.close(fig)

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "承诺货量扫描"
    sheet["A1"] = "不同承诺货量下的保本折扣、利润与利润率"
    sheet["A1"].font = Font(bold=True, size=13)
    headers = ["相对计划货量", "承诺货量", "保本折扣", "中心利润", "利润率", "判定"]
    for index, header in enumerate(headers, start=1):
        cell = sheet.cell(row=3, column=index, value=header)
        cell.font = Font(bold=True)
    for offset, step in enumerate(result.steps):
        row = 4 + offset
        values = [f"{step.factor}×", round(step.z, 2), step.break_even_discount, round(step.profit, 2), step.rate, step.judge]
        for index, value in enumerate(values, start=1):
            sheet.cell(row=row, column=index, value=value)
        for column in (3, 5):
            sheet.cell(row=row, column=column).number_format = "0.0%"
    xlsx = target / "汇算明细表.xlsx"
    workbook.save(xlsx)

    files = [pdf.name, grid.name, single.name, xlsx.name]
    return {"folder": str(target), "files": files}
