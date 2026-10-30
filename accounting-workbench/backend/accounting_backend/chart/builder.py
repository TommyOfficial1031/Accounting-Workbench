"""图表数据准备与 matplotlib 渲染。

``prepare_chart_data`` 镜像前端 ``src/utils/chartData.ts`` 的 ``prepareChartData``，
保证预览（ECharts）与导出（matplotlib）一致。
"""

from __future__ import annotations

import io
import math
import re
from datetime import datetime
from typing import Any, Optional

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
from matplotlib.figure import Figure
from matplotlib.ticker import FuncFormatter

from accounting_backend.chart.fonts import cjk_font, register_fonts
from accounting_backend.chart.palette import CHART_PALETTES
from accounting_backend.errors import AccountingError
from accounting_backend.schemas.analysis import ComputeResult
from accounting_backend.schemas.chart import ChartConfig, RenderOpts

#: 与前端 src/utils/chartData.ts 的 wrapCategoryLabel 保持同一套折行规则
_LABEL_LINE_CHARS = 9
_LABEL_MAX_LINES = 3
_DIM_SEPARATOR = " · "
#: 标题/坐标文字颜色（与前端 --color-text 一致）
_TEXT_COLOR = "#1d1d1f"
#: series_colors 只接受十六进制颜色（前端 PALETTE 就是这个形状），别的直接报结构化错误
_COLOR_PATTERN = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")


def wrap_label(
    value: str,
    chars_per_line: int = _LABEL_LINE_CHARS,
    max_lines: int = _LABEL_MAX_LINES,
) -> str:
    """组合刻度过长时折成多行（和前端 wrapCategoryLabel 完全一致）。"""
    if len(value) <= chars_per_line:
        return value
    lines: list[str] = []
    line = ""
    for part in value.split(_DIM_SEPARATOR):
        candidate = part if line == "" else f"{line}{_DIM_SEPARATOR}{part}"
        if len(candidate) <= chars_per_line:
            line = candidate
            continue
        if line != "":
            lines.append(line)
            line = ""
        rest = part
        while len(rest) > chars_per_line:
            lines.append(rest[:chars_per_line])
            rest = rest[chars_per_line:]
        line = rest
    if line != "":
        lines.append(line)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        lines[-1] = lines[-1][: max(1, chars_per_line - 1)] + "…"
    return "\n".join(lines)


def label_footprint(line_chars: int, lines: int, font_size: float, rotate: int) -> float:
    """旋转后的文字在水平方向占多宽（外接盒宽度，单位与 per_category 一致）。"""
    rad = math.radians(rotate)
    width = line_chars * font_size * 0.95
    height = lines * (font_size + 3)
    return abs(width * math.cos(rad)) + abs(height * math.sin(rad)) + 4


def _wrapped_shape(
    labels: list[str], chars_per_line: int, max_lines: int
) -> tuple[int, int]:
    """折行之后最宽一行几个字、一共几行（用来算外接盒）。"""
    widest = 1
    lines = 1
    for label in labels:
        rows = wrap_label(label, chars_per_line, max_lines).split("\n")
        lines = max(lines, len(rows))
        for row in rows:
            widest = max(widest, len(row))
    return widest, lines


def fit_labels(labels: list[str], per_category: float) -> tuple[list[str], float, int, int]:
    """按「每个刻度可用宽度」自适应字号 / 斜度 / 每行字数 / 隔几个显示。

    与前端 ``fitAxisLabels`` 完全一致（那边单位是 px，这边是 pt）：先用「标签旋转后的外接盒
    宽度」判断会不会互相压住，塞不下再放大角度、再不行就隔几个显示一个。
    返回 ``(折行后的标签, 字号, 斜度, step)``，``step`` = 每隔几个显示一个（1 = 全显示）。
    """
    slot = max(8.0, per_category)
    font_size = round(min(11.0, max(7.5, slot / 5.5)), 1)
    longest = max([len(label) for label in labels] + [1])

    for rotate in (0, 30, 45, 60):
        for max_lines in (1, 2, 3):
            chars = max(3, math.ceil(longest / max_lines))
            widest, lines = _wrapped_shape(labels, chars, max_lines)
            if label_footprint(widest, lines, font_size, rotate) <= slot:
                return (
                    [wrap_label(label, chars, max_lines) for label in labels],
                    font_size,
                    rotate,
                    1,
                )

    # ② 斜排也塞不下：竖排（90°、固定 3 行，横向只占一个行高），刻度全显示
    vertical_chars = max(3, math.ceil(longest / 3))
    v_widest, v_lines = _wrapped_shape(labels, vertical_chars, 3)
    if label_footprint(v_widest, v_lines, font_size, 90) <= slot:
        return (
            [wrap_label(label, vertical_chars, 3) for label in labels],
            font_size,
            90,
            1,
        )

    # ③ 连竖排都放不开：45° + 3 行，按外接盒算「隔几个显示一个」
    chars = max(3, math.ceil(longest / 3))
    widest, lines = _wrapped_shape(labels, chars, 3)
    footprint = label_footprint(widest, lines, font_size, 45)
    step = max(1, math.ceil(footprint / slot))
    return [wrap_label(label, chars, 3) for label in labels], font_size, 45, step


#: 饼图标签布局（数据坐标，饼半径 = 1）：辅助线折点半径 / 文字列内边缘
_PIE_LINE_OUT = 1.08
_PIE_LABEL_COL = 1.20
#: 饼图标签字号档位：(分类数上限, 字号)
_PIE_FONT_STEPS: tuple[tuple[int, float], ...] = (
    (8, 10.0),
    (16, 9.0),
    (30, 8.0),
    (10**6, 7.5),
)


def pie_percent_text(share: float) -> str:
    """饼图百分比文本：最多两位小数、不留尾零（与预览 ECharts 的 ``{d}%`` 一致）。"""
    text = f"{share * 100.0:.2f}".rstrip("0").rstrip(".")
    return f"{text}%"


def pie_font_size(count: int) -> float:
    """饼图标签字号：分类越多越小（29 组时 8pt，300 DPI 导出仍可读）。"""
    for limit, size in _PIE_FONT_STEPS:
        if count <= limit:
            return size
    return _PIE_FONT_STEPS[-1][1]


def spread_pie_labels(
    ideal_y: list[float],
    heights: list[float],
    low: float,
    high: float,
    gap: float,
) -> list[float]:
    """把饼图同一侧的标签纵向错开：保持上下顺序、互不重叠、尽量落在 [low, high]。

    ``ideal_y`` 是扇形中点角度换算出的理想 y，``heights`` 是每个标签的高度（同一坐标单位）。
    标签总高超过可用区间时按比例压缩间距（宁可轻微重叠，也不让标签跑出画布）。
    """
    count = len(ideal_y)
    if count == 0:
        return []
    if count > 1:
        span = high - low
        needed = sum(heights) + gap * (count - 1)
        if span > 0 and needed > span:
            gap = (span - sum(heights)) / (count - 1)

    # 从上到下依次压：每个标签的上沿不能高过上一个标签的下沿
    order = sorted(range(count), key=lambda index: ideal_y[index], reverse=True)
    result = [0.0] * count
    previous: Optional[int] = None
    for index in order:
        y = ideal_y[index]
        if previous is not None:
            y = min(y, result[previous] - (heights[previous] + heights[index]) / 2.0 - gap)
        result[index] = y
        previous = index

    # 底部越界 → 整体上移；上移后顶部可能越界，再从上往下压一遍
    overflow = low - result[order[-1]]
    if overflow > 0:
        for index in order:
            result[index] += overflow
        result[order[0]] = min(result[order[0]], high)
        for position in range(1, count):
            current, above = order[position], order[position - 1]
            result[current] = min(
                result[current],
                result[above] - (heights[above] + heights[current]) / 2.0 - gap,
            )
    if result[order[0]] > high:
        shift = result[order[0]] - high
        for index in order:
            result[index] -= shift
    return result


def label_rotation(count: int, multiline: bool) -> int:
    """刻度过长/过密时倾斜（与前端 axisLabelStyle 同一套阈值）。"""
    if multiline:
        return 30 if count > 4 else 0
    if count > 24:
        return 60
    if count > 16:
        return 45
    if count > 10:
        return 35
    return 0


def resolve_figsize(chart: ChartConfig, categories: list) -> tuple[float, float]:
    """按分类数自动定画布宽度，避免标签挤成一团（前端没传 figsize 时）。"""
    count = max(1, len(categories))
    if chart.chart_type == "pie":
        return (9.0, 7.0)
    width = min(24.0, max(9.0, 0.72 * count + 6.0))
    return (width, 6.4)


def _series_fields(result: ComputeResult, chart: ChartConfig) -> list[str]:
    """按 ``show_fields`` 取数的系列列（空 = 走「单 Y + 系列字段」的老逻辑）。

    * ``show_fields`` 里能用上的列 > 1 → 多指标 = 多系列（前端 ``_prepareMultiSeries``）；
    * 只有 1 列、且 ``y_axis`` 不是结果表的列时也算：``y_axis`` 只是轴标题
      （一键算看板只勾 1 行 × 1 指标时就是这个形状，不能按「Y 轴字段不存在」拦掉）。
    """
    y_fields = [field for field in chart.show_fields if field in result.columns]
    if len(y_fields) > 1:
        return y_fields
    if len(y_fields) == 1 and (chart.y_axis is None or chart.y_axis not in result.columns):
        return y_fields
    return []


def prepare_chart_data(result: ComputeResult, chart: ChartConfig) -> dict:
    """镜像前端 prepareChartData，返回 {categories, series}。

    Y 指标勾了多个（``show_fields`` 里能在结果表中找到 > 1 个）时按「多指标 = 多系列」
    画，与前端 ``_prepareMultiSeries`` 一致；否则沿用单 Y + 系列字段的老逻辑。

    排序语义（``sort_by``）：

    * ``"x"`` = 按分类值排序（**字符串序**，日期列刚好能用）；
    * ``"y"`` = 按分类合计排序；
    * ``"custom"`` = **不排序**，保持结果表行序 —— 一键算看板导出走这条，
      保证公斤段是 ``0-60 → 800+`` 的自然顺序（按字符串排会变成 150-300 在 60-150 前面）。
    """
    columns = result.columns
    y_fields = _series_fields(result, chart)
    if y_fields:
        return _prepare_multi_series(result, chart, y_fields)

    x_idx = columns.index(chart.x_axis) if chart.x_axis else -1
    y_idx = columns.index(chart.y_axis) if chart.y_axis else -1
    s_idx = columns.index(chart.series) if chart.series else -1

    rows: list[dict] = []
    for row in result.rows:
        y_raw = row[y_idx] if y_idx >= 0 else None
        rows.append(
            {
                "x": str(row[x_idx]) if x_idx >= 0 else "",
                "y": y_raw if _is_number(y_raw) else None,
                "series": str(row[s_idx]) if s_idx >= 0 else "",
            }
        )

    if chart.time_granularity and len(chart.x_dims) <= 1:
        rows = _aggregate_by_time(rows, chart.time_granularity, chart.aggregation)

    if chart.chart_type == "pie":
        rows = [r for r in rows if r["y"] is not None and r["y"] > 0]

    if s_idx >= 0:
        series_names: list[str] = []
        for r in rows:
            if r["series"] not in series_names:
                series_names.append(r["series"])
    else:
        series_names = [""]

    categories: list[str] = []
    for r in rows:
        if r["x"] not in categories:
            categories.append(r["x"])

    if chart.sort_by == "x":
        categories.sort(reverse=(chart.sort_order == "desc"))
    elif chart.sort_by == "y":
        categories.sort(
            key=lambda c: _sum_by_category(rows, c), reverse=(chart.sort_order == "desc")
        )

    if chart.top_n is not None and chart.top_n > 0:
        categories = categories[: chart.top_n]

    series = [
        {
            # 没有系列字段时（name = ""）用 Y 轴指标名当图例，前端预览同样处理
            "name": name if name != "" else (chart.y_axis or "数值"),
            "data": [_find_y(rows, c, name) for c in categories],
        }
        for name in series_names
    ]

    return {"categories": categories, "series": series}


def _prepare_multi_series(
    result: ComputeResult, chart: ChartConfig, y_fields: list[str]
) -> dict:
    """Y 指标勾了多个：每个指标一个系列（镜像前端 ``_prepareMultiSeries``）。

    - 类别 = X 轴那一列的取值（多维度组合已由前端烘焙成结果表里的一列，这里只认列名）；
    - 只有单维度时才做时间粒度重汇总：组合标签（``值1 · 值2``）不是日期，重汇总没意义；
    - 排序 / Top N 与单系列一致（``sort_by == "y"`` 时按同一行各指标合计）；
    - 饼图只用第一个指标，并丢掉第一个指标非正数的行（单系列饼图也是这么过滤的，
      同时避免 matplotlib 对负值直接抛 ValueError）。
    """
    columns = result.columns
    x_idx = columns.index(chart.x_axis) if chart.x_axis else -1
    if x_idx < 0:
        return {"categories": [], "series": []}
    y_indexes = [columns.index(field) for field in y_fields]

    rows: list[dict] = [
        {
            "x": str(row[x_idx]),
            "values": [row[i] if _is_number(row[i]) else None for i in y_indexes],
        }
        for row in result.rows
    ]

    if chart.time_granularity and len(chart.x_dims) <= 1:
        rows = _aggregate_multi_by_time(rows, chart.time_granularity, chart.aggregation)

    if chart.chart_type == "pie":
        rows = [
            r for r in rows if r["values"][0] is not None and r["values"][0] > 0
        ]

    categories: list[str] = []
    for row in rows:
        if row["x"] not in categories:
            categories.append(row["x"])

    if chart.sort_by == "x":
        categories.sort(reverse=(chart.sort_order == "desc"))
    elif chart.sort_by == "y":
        categories.sort(
            key=lambda c: _sum_multi_by_category(rows, c),
            reverse=(chart.sort_order == "desc"),
        )

    if chart.top_n is not None and chart.top_n > 0:
        categories = categories[: chart.top_n]

    return {
        "categories": categories,
        "series": [
            {
                "name": field,
                "data": [
                    _find_multi_value(rows, category, column) for category in categories
                ],
            }
            for column, field in enumerate(y_fields)
        ],
    }


def _aggregate_multi_by_time(
    rows: list[dict], granularity: str, aggregation: str
) -> list[dict]:
    """多系列版的时间分桶：同一个桶里逐列重汇总（镜像前端那段 bucket 逻辑）。"""
    buckets: dict[str, list[dict]] = {}
    for row in rows:
        bucket = _bucket_date(row["x"], granularity)
        if bucket is None:
            continue
        buckets.setdefault(bucket, []).append(row)

    result: list[dict] = []
    for bucket, group in buckets.items():
        width = len(group[0]["values"])
        result.append(
            {
                "x": bucket,
                "values": [
                    _aggregate_values(
                        [item["values"][column] for item in group], aggregation
                    )
                    for column in range(width)
                ],
            }
        )
    return result


def _sum_multi_by_category(rows: list[dict], category: str) -> float:
    """多系列排序用：同一行各指标合计（与前端 rowTotal 一致）。"""
    for row in rows:
        if row["x"] == category:
            return sum(v for v in row["values"] if v is not None)
    return 0.0


def _find_multi_value(rows: list[dict], category: str, column: int) -> Optional[float]:
    for row in rows:
        if row["x"] == category:
            return row["values"][column]
    return None


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _bucket_date(value: str, granularity: str) -> Optional[str]:
    if value in ("", "未知日期"):
        return None
    try:
        d = datetime.fromisoformat(value)
    except ValueError:
        return None
    y, m, day = d.year, d.month, d.day
    if granularity == "day":
        return f"{y:04d}-{m:02d}-{day:02d}"
    if granularity == "month":
        return f"{y:04d}-{m:02d}"
    if granularity == "quarter":
        return f"{y:04d}-Q{(m - 1) // 3 + 1}"
    return f"{y:04d}"


def _aggregate_by_time(rows: list[dict], granularity: str, aggregation: str) -> list[dict]:
    buckets: dict[str, list[dict]] = {}
    for row in rows:
        bucket = _bucket_date(row["x"], granularity)
        if bucket is None:
            continue
        buckets.setdefault(bucket, []).append(row)

    result: list[dict] = []
    for bucket, group in buckets.items():
        by_series: dict[str, list[dict]] = {}
        for row in group:
            by_series.setdefault(row["series"], []).append(row)
        for series_name, series_rows in by_series.items():
            result.append(
                {
                    "x": bucket,
                    "y": _aggregate_values([r["y"] for r in series_rows], aggregation),
                    "series": series_name,
                }
            )
    return result


def _aggregate_values(values: list, aggregation: str) -> Optional[float]:
    numbers = [v for v in values if v is not None]
    if not numbers:
        return None
    if aggregation == "sum":
        return sum(numbers)
    if aggregation == "avg":
        return sum(numbers) / len(numbers)
    if aggregation == "max":
        return max(numbers)
    if aggregation == "min":
        return min(numbers)
    if aggregation == "first":
        return numbers[0]
    if aggregation == "last":
        return numbers[-1]
    return sum(numbers)


def _sum_by_category(rows: list[dict], category: str) -> float:
    return sum(r["y"] for r in rows if r["x"] == category and r["y"] is not None)


def _find_y(rows: list[dict], category: str, series_name: str) -> Optional[float]:
    for r in rows:
        if r["x"] == category and r["series"] == series_name:
            return r["y"]
    return None


def render_chart_pdf(
    result: ComputeResult, chart: ChartConfig, render_opts: RenderOpts
) -> bytes:
    """渲染图表并导出为 PDF 字节（内存渲染，不落盘）。"""
    _validate(result, chart)
    _validate_render_opts(render_opts)
    data = prepare_chart_data(result, chart)
    fig = _render_to_figure(data, chart, render_opts)
    buf = io.BytesIO()
    try:
        matplotlib.rcParams["pdf.fonttype"] = 42  # TrueType 嵌入
        fig.savefig(
            buf, format="pdf", bbox_inches="tight", facecolor="white", metadata=_build_metadata()
        )
        return buf.getvalue()
    finally:
        plt.close(fig)


def render_chart_jpeg(
    result: ComputeResult, chart: ChartConfig, render_opts: RenderOpts
) -> bytes:
    """渲染图表并导出为 JPEG 字节（复用 _render_to_figure）。"""
    _validate(result, chart)
    _validate_render_opts(render_opts)
    data = prepare_chart_data(result, chart)
    fig = _render_to_figure(data, chart, render_opts)
    buf = io.BytesIO()
    try:
        fig.savefig(
            buf,
            format="jpeg",
            dpi=render_opts.dpi,
            facecolor="white",
            bbox_inches="tight",
            pad_inches=0.1,
            pil_kwargs={
                "quality": render_opts.quality,
                "optimize": render_opts.optimize,
                # matplotlib 的 JPEG 不支持 metadata dict，改用 Pillow comment 嵌入追溯信息
                "comment": _build_jpeg_comment(),
            },
        )
        return buf.getvalue()
    finally:
        plt.close(fig)


def _render_pie(fig: Figure, ax, data: dict, colors: list[str]) -> None:
    """饼图：标签分左右两列放在饼外，并画折线辅助线（对齐预览的 ECharts 观感）。

    2026-10-30 用户反馈（第 14 轮）「导出的饼图没有辅助线，和预览不一致」：
    原先把 labels 直接交给 ``ax.pie``，标签沿半径摆、没有辅助线，29 个多行标签会叠成一团。
    现在按扇形中点角度分左右两列，同列按标签高度上下错开；每个标签画一条
    「扇形边缘 → 折点 → 文字内侧」的折线（颜色 = 扇形颜色，即预览的 labelLine）。
    画布高度按标签总高自动加高，保证多分类时标签不重叠。
    """
    categories = [str(item) for item in data["categories"]]
    series = data["series"]
    raw_values = list(series[0]["data"]) if series else []
    entries = [
        (categories[index], max(0.0, float(value)))
        for index, value in enumerate(raw_values)
        if index < len(categories)
        and isinstance(value, (int, float))
        and not isinstance(value, bool)
        and value > 0
    ]
    if not entries:
        # 没有正数值（前端校验会拦住，这里兜底，别抛 matplotlib 底层异常）
        ax.text(
            0.5,
            0.5,
            "没有可用的正数值",
            transform=ax.transAxes,
            ha="center",
            va="center",
            fontproperties=cjk_font(12),
            color=_TEXT_COLOR,
        )
        ax.set_axis_off()
        return

    labels = [name for name, _ in entries]
    values = [value for _, value in entries]
    total = sum(values)
    palette = [colors[index % len(colors)] for index in range(len(values))]
    wedges, _ = ax.pie(
        values,
        colors=palette,
        radius=1.0,
        startangle=90,  # 与预览一致：12 点钟方向起、顺时针
        counterclock=False,
        labels=None,
        autopct=None,
        wedgeprops={"linewidth": 0.6, "edgecolor": "white"},
    )

    # ── 画布与比例：饼直径只按画布宽度定（画布被标签撑高时饼不会越变越小）──
    width_in, height_in = (float(value) for value in fig.get_size_inches())
    left, right, top, bottom = 0.03, 0.97, 0.94, 0.02
    axes_w_in = max(0.1, width_in * (right - left))
    axes_h_in = max(0.1, height_in * (top - bottom))
    pie_in = min(4.0, 0.5 * axes_w_in)
    scale = pie_in / 2.0  # 每数据单位（饼半径 = 1）多少英寸
    font_size = pie_font_size(len(values))

    # 标签列可用宽度 → 每行几个字（CJK 按 1 em 估）
    label_col_in = max(0.6, axes_w_in / 2.0 - _PIE_LABEL_COL * scale - 0.05)
    chars = max(4, int(label_col_in * 72.0 / font_size))
    texts, label_heights = _pie_label_texts(labels, values, total, font_size, chars)

    # ── 同一侧标签叠起来的总高度决定画布高度（先撑够，再排文字）──
    gap_in = 0.04
    mid_angles = [math.radians((wedge.theta1 + wedge.theta2) / 2.0) for wedge in wedges]
    sides = [1 if math.cos(angle) >= 0 else -1 for angle in mid_angles]
    stack_in = 0.0
    for side in (1, -1):
        indexes = [index for index in range(len(values)) if sides[index] == side]
        if indexes:
            stack_in = max(
                stack_in,
                sum(label_heights[index] for index in indexes) + gap_in * (len(indexes) - 1),
            )
    need_h_in = max(2.24 * scale, stack_in + 0.3) / (top - bottom)
    if need_h_in > height_in:
        height_in = need_h_in
        fig.set_size_inches(width_in, height_in)
        axes_h_in = height_in * (top - bottom)
    fig.subplots_adjust(left=left, right=right, top=top, bottom=bottom)

    # ── 数据坐标：x/y 同比例（aspect=equal），圆不会被拉成椭圆 ──
    lx = axes_w_in / (2.0 * scale)
    ly = axes_h_in / (2.0 * scale)
    ax.set_xlim(-lx, lx)
    ax.set_ylim(-ly, ly)

    # ── 同侧标签纵向错开（理想 y = 扇形中点角度方向）──
    gap = gap_in / scale
    heights = [height / scale for height in label_heights]
    low, high = -ly + 0.04, ly - 0.04
    positions = [0.0] * len(values)
    for side in (1, -1):
        indexes = [index for index in range(len(values)) if sides[index] == side]
        if not indexes:
            continue
        ideal = [math.sin(mid_angles[index]) * _PIE_LINE_OUT for index in indexes]
        spread = spread_pie_labels(
            ideal, [heights[index] for index in indexes], low, high, gap
        )
        for index, y in zip(indexes, spread):
            positions[index] = y

    # ── 辅助线 + 标签文字（左列右对齐、右列左对齐）──
    _draw_pie_labels(ax, mid_angles, sides, texts, positions, palette, font_size)


def _pie_label_texts(
    labels: list[str],
    values: list[float],
    total: float,
    font_size: float,
    chars: int,
) -> tuple[list[str], list[float]]:
    """饼图标签文字与高度（英寸）：``组合名（折行）+ 百分比``，高度用于同列错开。"""
    texts = [
        f"{wrap_label(label, chars, 3)}\n{pie_percent_text(value / total)}"
        for label, value in zip(labels, values)
    ]
    heights = [(text.count("\n") + 1) * font_size * 1.35 / 72.0 for text in texts]
    return texts, heights


def _draw_pie_labels(
    ax,
    mid_angles: list[float],
    sides: list[int],
    texts: list[str],
    positions: list[float],
    palette: list[str],
    font_size: float,
) -> None:
    """画饼图标签：每条辅助线是「扇形边缘 → 折点 → 文字内侧」的三点折线（颜色同扇形）。"""
    for index, angle in enumerate(mid_angles):
        cosine, sine = math.cos(angle), math.sin(angle)
        side = sides[index]
        ax.plot(
            [cosine, cosine * _PIE_LINE_OUT, side * _PIE_LABEL_COL],
            [sine, sine * _PIE_LINE_OUT, positions[index]],
            color=palette[index],
            linewidth=0.8,
            solid_capstyle="round",
            zorder=1,
            clip_on=False,
        )
        ax.text(
            side * (_PIE_LABEL_COL + 0.03),
            positions[index],
            texts[index],
            ha="left" if side > 0 else "right",
            va="center",
            multialignment="left" if side > 0 else "right",
            fontproperties=cjk_font(font_size),
            color=_TEXT_COLOR,
            linespacing=1.25,
            zorder=3,
            clip_on=False,
        )


def _render_to_figure(data: dict, chart: ChartConfig, render_opts: RenderOpts) -> Figure:
    """构建 matplotlib Figure（P6c 的 JPEG 渲染复用此函数，仅换 savefig 参数）。

    样式尽量与前端的 ECharts 预览对齐：标题加粗加大、长刻度折行 + 倾斜、不重复画 X 轴名。
    """
    register_fonts()
    colors = _resolve_colors(chart)

    categories = data["categories"]
    series = data["series"]
    figsize = (
        tuple(render_opts.figsize) if render_opts.figsize else resolve_figsize(chart, categories)
    )
    fig, ax = plt.subplots(figsize=figsize, dpi=render_opts.dpi)
    fig.patch.set_facecolor("white")
    ax.set_facecolor("white")

    if chart.chart_type == "pie":
        _render_pie(fig, ax, data, colors)
    else:
        # 分类轴统一按「下标」画；字号/斜度/每行字数按每个刻度的可用宽度自适应（与前端一致）
        positions = list(range(len(categories)))
        per_category = figsize[0] * 72.0 / max(1, len(categories))
        labels, font_size, rotate, step = fit_labels(
            [str(c) for c in categories], per_category
        )
        if chart.chart_type == "line":
            for i, s in enumerate(series):
                ax.plot(
                    positions,
                    s["data"],
                    label=s["name"],
                    color=colors[i % len(colors)],
                    marker="o",
                    markersize=3.5,
                )
        else:
            import numpy as np

            x = np.arange(len(categories))
            width = 0.8 / len(series) if series else 0.8
            for i, s in enumerate(series):
                offset = (i - (len(series) - 1) / 2) * width
                ax.bar(
                    x + offset,
                    [v if v is not None else 0 for v in s["data"]],
                    width,
                    label=s["name"],
                    color=colors[i % len(colors)],
                )
        tick_positions = positions[::step]
        tick_labels = labels[::step]
        ax.set_xticks(tick_positions)
        ax.set_xticklabels(tick_labels, fontproperties=cjk_font(font_size))
        for label in ax.get_xticklabels():
            if rotate:
                label.set_rotation(rotate)
                label.set_horizontalalignment("right")
                label.set_rotation_mode("anchor")
            label.set_color(_TEXT_COLOR)
        ax.set_ylabel(chart.y_axis or "", fontproperties=cjk_font(11), color=_TEXT_COLOR)

    if chart.chart_type != "pie":
        _apply_grouped_ticks(ax)
        for label in ax.get_yticklabels():
            label.set_fontproperties(cjk_font(11))
            label.set_color(_TEXT_COLOR)
        if chart.show_legend:
            _draw_legend(fig, ax, series)

    # 标题最后画：饼图会按标签总高改画布尺寸，早画会停在旧高度上
    if chart.title:
        _draw_title(fig, ax, chart.title)

    return fig


def format_tick(value: float, _position: Optional[int] = None) -> str:
    """坐标刻度文本：千以上用千分位（用户 2026-10-29 定稿，不再用「万」缩写）。

    ``10,000`` 而不是 ``1.0万``；千以下沿用 ``g`` 的短格式（``0.65``、``0``）。
    """
    if abs(value) >= 1_000:
        return f"{value:,.0f}"
    return f"{value:g}"


def _apply_grouped_ticks(ax) -> None:
    """给数值轴装千分位刻度。

    只动 Y 轴：分类轴的刻度是 ``set_xticklabels`` 自己设的，
    给它装 ``FuncFormatter`` 会把「0-60」换成下标数字。
    """
    ax.yaxis.set_major_formatter(FuncFormatter(format_tick))


def _legend_column_in(labels: list[str], font_size: int) -> float:
    """估算一列图例需要的宽度（英寸）。

    CJK 按 1 em、西文按 0.55 em 估算，再加句柄与列间距。图例列数必须按这个宽度反推，
    否则 58 条图例排 5 列会横向超出画布、被裁掉一截。
    """
    em = font_size / 72.0

    def text_in(text: str) -> float:
        units = sum(1.0 if ord(char) > 0x2E80 else 0.55 for char in text)
        return units * em

    longest = max((text_in(str(label)) for label in labels), default=1.0)
    return longest + 0.55


def _draw_legend(fig: Figure, ax, series: list) -> None:
    """图例画在画布正下方（对应预览的 HTML 图例），并**按条目数**给底部留够空间。

    原先用 ``ax.legend()`` 默认 ``loc="best"``，图例会正好压在数据线上（用户 2026-10-29 反馈）。
    改成 figure 级图例 + ``subplots_adjust(bottom=…)``：图例在画布内部，
    导出时不会被撑高、宽高比也不会跑（``bbox_inches="tight"`` 只裁空白）。

    **第 13 轮再修一次**（用户反馈「网点对比图表导出的总表排版有问题」）：一键算 29 组 × 2 指标
    = 58 条图例，固定 ``bottom=0.2`` 根本装不下 —— 图例往上长进绘图区，把折线和 X 轴刻度一起盖住。
    现在的规则：
    1. 列数由「画布宽度 ÷ 一列图例宽度」反推（不再固定 3 列，也不会横向溢出）；
    2. 行数 = ceil(条目数 ÷ 列数)，底部留白按行数算；
    3. 图例要占掉超过 45% 的画布高度时，先把**画布加高**（宽度不动），保证绘图区不被压成一条缝。
    """
    handles, labels = ax.get_legend_handles_labels()
    if not handles:
        return
    count = len(handles)
    font_size = 10 if count <= 9 else (8 if count <= 40 else 7)
    # 一行图例实际占的高度 ≈ 字号 × 1.96（文字行高 + labelspacing），按实测 58 条校准过
    line_in = font_size * 0.0273

    width_in, height_in = fig.get_size_inches()
    per_column = _legend_column_in([str(label) for label in labels], font_size)
    max_columns = max(1, int((width_in - 0.4) // per_column))
    ncol = max(1, min(count, max_columns))
    rows = math.ceil(count / ncol)
    need_in = rows * line_in + 0.3

    reserve = 0.45
    if need_in > reserve * height_in:
        # 图例太高：先把画布加高（最多 2.2 倍，别把图撑成窄条），宽度保持不变
        height_in = min(need_in / reserve, height_in * 2.2)
        fig.set_size_inches(width_in, height_in)

    fig.subplots_adjust(bottom=min(0.5, max(0.16, need_in / height_in)))
    legend = fig.legend(
        handles,
        labels,
        loc="lower center",
        bbox_to_anchor=(0.5, 0.008),
        ncol=ncol,
        frameon=False,
        prop=cjk_font(font_size),
        borderaxespad=0.0,
        handlelength=1.7,
        columnspacing=1.3,
        labelspacing=0.32,
    )
    for text in legend.get_texts():
        text.set_color(_TEXT_COLOR)
        text.set_fontsize(font_size)

    # 画一遍量图例与 X 轴刻度标签的**真实**高度再贴一次底：只按估算留白会在图例上方空出
    # 一大片（用户 2026-10-29 反馈「总表排版有问题」的另一面），留少了又会压住刻度标签。
    fig.canvas.draw()
    renderer = fig.canvas.get_renderer()
    legend_in = legend.get_window_extent(renderer).height / fig.dpi
    tick_in = max(
        (label.get_window_extent(renderer).height for label in ax.get_xticklabels()),
        default=0.0,
    ) / fig.dpi
    bottom = (legend_in + tick_in + 0.26) / height_in
    if bottom > 0.60:
        # 图例 + 刻度太高：再加高画布，保证绘图区至少还有 40%
        height_in = min((legend_in + tick_in + 0.26) / 0.60, height_in * 2.2)
        fig.set_size_inches(width_in, height_in)
        bottom = (legend_in + tick_in + 0.26) / height_in
    fig.subplots_adjust(bottom=max(0.12, bottom))


def _resolve_colors(chart: ChartConfig) -> list[str]:
    """系列颜色：``series_colors`` 优先（前端预览同一套），否则用调色板。"""
    if chart.series_colors:
        return list(chart.series_colors)
    return list(CHART_PALETTES.get(chart.palette, CHART_PALETTES["default"]))


def _draw_title(fig: Figure, ax, title: str) -> None:
    """标题加大 + 叠一遍轻微偏移的文字模拟加粗（与预览的 600 字重观感一致）。

    不能用 path_effects 描边：那会把标题变成矢量路径，PDF 里的文本层就丢了
    （测试会断言标题可被提取）。只分发 Regular 字体，所以这里用「重画一遍」。
    """
    rect = ax.get_position()
    center_x = rect.x0 + (rect.x1 - rect.x0) / 2
    baseline = rect.y1 + 0.022
    for shift in (0.0, 0.00035):
        fig.text(
            center_x + shift,
            baseline,
            title,
            ha="center",
            va="bottom",
            fontproperties=cjk_font(16),
            color=_TEXT_COLOR,
        )


def _validate(result: ComputeResult, chart: ChartConfig) -> None:
    """校验字段映射。

    「按 show_fields 取数」的图（见 ``_series_fields``）里 ``y_axis`` 只是 Y 轴标题，
    不参与取数：一键算看板导出的就是这种图（``y_axis`` = 「比率 / 单价」这种人话标题），
    所以那时不要求它必须是结果表的列（用户 2026-10-28 反馈：PDF/JPEG 选了路径却没文件）。
    真正走单系列老逻辑时仍然严格：``y_axis`` 必须是真实列。
    另外校验 ``series_colors`` 的格式，避免 matplotlib 抛出难懂的底层异常。
    """
    if chart.x_axis is None:
        raise AccountingError("INVALID_CHART_CONFIG", "图表缺少 X 轴字段")
    if chart.x_axis not in result.columns:
        raise AccountingError("INVALID_CHART_CONFIG", f"X 轴字段不存在：{chart.x_axis}")

    _validate_series_colors(chart)

    if not _series_fields(result, chart):
        if chart.y_axis is None:
            raise AccountingError("INVALID_CHART_CONFIG", "图表缺少 Y 轴字段")
        if chart.y_axis not in result.columns:
            raise AccountingError(
                "INVALID_CHART_CONFIG", f"Y 轴字段不存在：{chart.y_axis}"
            )

    if chart.chart_type == "pie" and chart.series is not None:
        raise AccountingError("INVALID_CHART_CONFIG", "饼图不支持系列字段")


def _validate_series_colors(chart: ChartConfig) -> None:
    """``series_colors`` 只接受 ``#RGB`` / ``#RRGGBB``。"""
    for color in chart.series_colors:
        if not _COLOR_PATTERN.match(color):
            raise AccountingError(
                "INVALID_CHART_CONFIG", f"系列颜色格式不对：{color}（应为 #RRGGBB）"
            )


def _validate_render_opts(render_opts: RenderOpts) -> None:
    if render_opts.figsize and (
        render_opts.figsize[0] > 100 or render_opts.figsize[1] > 100
    ):
        raise AccountingError("INVALID_RENDER_OPTS", "图尺寸过大（单边超过 100 英寸）")


def _build_metadata() -> dict:
    # matplotlib 的 PDF metadata 仅支持标准键，CreationDate 需为 datetime 对象。
    return {
        "Creator": "Accounting Workbench",
        "CreationDate": datetime.now(),
    }


def _build_jpeg_comment() -> str:
    return f"Software: Accounting Workbench; Creation Time: {datetime.now().isoformat()}"

