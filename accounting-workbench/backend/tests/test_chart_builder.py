"""图表渲染测试：五种类型 + 中文字体嵌入 + 前后端契约 + 错误路径。"""

from __future__ import annotations

import io
import json
import re
from pathlib import Path

import matplotlib.pyplot as plt
import pytest
from PIL import Image
from pypdf import PdfReader
from pydantic import ValidationError

from accounting_backend.chart.builder import (
    format_tick,
    _render_to_figure,
    fit_labels,
    label_footprint,
    pie_percent_text,
    prepare_chart_data,
    render_chart_jpeg,
    render_chart_pdf,
    spread_pie_labels,
)
from accounting_backend.errors import AccountingError
from accounting_backend.schemas.analysis import ComputeResult
from accounting_backend.schemas.chart import ChartConfig, RenderOpts


def _result():
    return ComputeResult(
        columns=["账单时间", "公斤段", "货量", "现价"],
        rows=[
            ["2026-01-05", "0-1kg", 10, 100],
            ["2026-01-20", "0-1kg", 20, 200],
            ["2026-01-05", "1-2kg", 5, 50],
        ],
        row_count=3,
        meta={},
    )


def _extract_text(pdf_bytes: bytes) -> str:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    return "".join(page.extract_text() or "" for page in reader.pages)


@pytest.mark.parametrize("chart_type", ["line", "bar", "column", "pie"])
def test_render_all_types_embed_chinese(chart_type):
    chart = ChartConfig(chart_type=chart_type, x_axis="账单时间", y_axis="货量", title="网点货量分析")

    pdf = render_chart_pdf(_result(), chart, RenderOpts())
    assert len(pdf) > 1000  # 非空

    text = _extract_text(pdf)
    # 主断言：中文标题可被提取（证明中文字体嵌入且文本可读）
    assert "网点货量分析" in text


def test_scatter_chart_type_removed():
    """散点图已于 2026-10-30（第 14 轮）下线：请求里再传 scatter 要被 schema 挡住。"""
    with pytest.raises(ValidationError):
        ChartConfig(chart_type="scatter", x_axis="货量", y_axis="现价")


def test_chart_data_contract():
    # 前后端共享契约：后端 prepare_chart_data 输出与 fixture 期望一致
    # （cases 里既覆盖「单 Y + 系列字段」，也覆盖「多指标 = 多系列」）
    path = Path(__file__).parent / "fixtures" / "chart_contract.json"
    data = json.loads(path.read_text(encoding="utf-8"))

    result = ComputeResult(**data["result"])
    for case in data["cases"]:
        chart = ChartConfig(**case["chart"])
        assert prepare_chart_data(result, chart) == case["expected"], case["name"]


def _multi_result():
    return ComputeResult(
        columns=["账单时间", "公斤段", "货量", "现价合计"],
        rows=[
            ["2026-01-05", "0-1kg", 10, 100],
            ["2026-01-20", "0-1kg", 20, 200],
            ["2026-02-10", "1-2kg", 15, 150],
        ],
        row_count=3,
        meta={},
    )


def test_multi_series_one_per_metric():
    # 用户反馈（2026-10-28 第六轮）：Y 指标勾了两个，导出的图只剩一条线
    chart = ChartConfig(
        chart_type="line",
        x_axis="账单时间",
        y_axis="货量",
        show_fields=["货量", "现价合计"],
    )
    data = prepare_chart_data(_multi_result(), chart)
    assert data["categories"] == ["2026-01-05", "2026-01-20", "2026-02-10"]
    assert [s["name"] for s in data["series"]] == ["货量", "现价合计"]
    assert data["series"][0]["data"] == [10, 20, 15]
    assert data["series"][1]["data"] == [100, 200, 150]


def test_multi_series_sort_by_y_uses_row_total():
    chart = ChartConfig(
        chart_type="column",
        x_axis="账单时间",
        y_axis="货量",
        show_fields=["货量", "现价合计"],
        sort_by="y",
        sort_order="desc",
    )
    data = prepare_chart_data(_multi_result(), chart)
    # 合计 110 / 220 / 165 → desc：01-20(220) > 02-10(165) > 01-05(110)
    assert data["categories"] == ["2026-01-20", "2026-02-10", "2026-01-05"]
    assert data["series"][0]["data"] == [20, 15, 10]


def test_multi_series_top_n_and_pie_first_metric():
    chart = ChartConfig(
        chart_type="pie",
        x_axis="账单时间",
        y_axis="货量",
        show_fields=["货量", "现价合计"],
        top_n=2,
    )
    data = prepare_chart_data(_multi_result(), chart)
    assert data["categories"] == ["2026-01-05", "2026-01-20"]
    assert len(data["series"]) == 2
    # 饼图只用第一个指标（与前端 data.series[0] 一致）
    assert data["series"][0]["data"] == [10, 20]
    pdf = render_chart_pdf(_multi_result(), chart, RenderOpts())
    assert len(pdf) > 1000


def test_multi_series_skips_time_granularity_when_combined():
    # 组合 X 轴烘焙前（xDims > 1）标签不是日期，别按时间重汇总
    chart = ChartConfig(
        chart_type="line",
        x_axis="账单时间",
        y_axis="货量",
        show_fields=["货量", "现价合计"],
        time_granularity="month",
        x_dims=[{"field": "账单时间"}, {"field": "公斤段"}],
    )
    data = prepare_chart_data(_multi_result(), chart)
    assert data["categories"] == ["2026-01-05", "2026-01-20", "2026-02-10"]


def test_multi_series_legend_in_pdf():
    # 图例两个名字（导出与预览一致）
    chart = ChartConfig(
        chart_type="line",
        x_axis="账单时间",
        y_axis="货量",
        show_fields=["货量", "现价合计"],
        title="多指标对比",
    )
    text = _extract_text(render_chart_pdf(_multi_result(), chart, RenderOpts()))
    assert "多指标对比" in text
    assert "货量" in text and "现价合计" in text


def test_invalid_chart_config_raises():
    chart = ChartConfig(chart_type="bar", x_axis=None, y_axis="货量")
    with pytest.raises(AccountingError) as exc:
        render_chart_pdf(_result(), chart, RenderOpts())
    assert exc.value.code == "INVALID_CHART_CONFIG"


def test_multi_series_allows_axis_label_as_y_axis():
    # 一键算看板导出：y_axis 只是轴标题（「比率 / 单价」），不参与取数。
    # 用户 2026-10-28 反馈：PDF/JPEG 选了路径却没文件（后端当时报「Y 轴字段不存在」）
    chart = ChartConfig(
        chart_type="line",
        x_axis="账单时间",
        y_axis="比率 / 单价",
        show_fields=["货量", "现价合计"],
        title="网点对比图表",
    )
    data = prepare_chart_data(_multi_result(), chart)
    assert [s["name"] for s in data["series"]] == ["货量", "现价合计"]
    jpeg = render_chart_jpeg(_multi_result(), chart, RenderOpts(figsize=[10, 6], dpi=100))
    assert jpeg[:2] == b"\xff\xd8"


def test_single_series_still_requires_real_y_axis():
    chart = ChartConfig(chart_type="bar", x_axis="账单时间", y_axis="不存在的列")
    with pytest.raises(AccountingError) as exc:
        render_chart_pdf(_result(), chart, RenderOpts())
    assert exc.value.code == "INVALID_CHART_CONFIG"
    assert "Y 轴字段不存在" in exc.value.message


@pytest.mark.parametrize("chart_type", ["line", "bar", "column", "pie"])
def test_render_jpeg_all_types(chart_type):
    figsize = [8.0, 8.0] if chart_type == "pie" else [10.0, 6.0]
    dpi = 100
    chart = ChartConfig(chart_type=chart_type, x_axis="账单时间", y_axis="货量", title="网点货量分析")

    jpeg = render_chart_jpeg(_result(), chart, RenderOpts(figsize=figsize, dpi=dpi))
    assert len(jpeg) > 1000  # 非空
    assert jpeg[:2] == b"\xff\xd8"  # JPEG 魔数

    img = Image.open(io.BytesIO(jpeg))
    w, h = img.size
    expected_w, expected_h = figsize[0] * dpi, figsize[1] * dpi
    # bbox_inches="tight" 会裁剪，尺寸在合理范围内（不低于期望 60%、不超过 105%）
    assert expected_w * 0.6 <= w <= expected_w * 1.05
    assert expected_h * 0.6 <= h <= expected_h * 1.05
    # 宽高比接近 figsize 比例（±15%）
    ratio = figsize[0] / figsize[1]
    assert abs((w / h) - ratio) / ratio <= 0.15

    # 左上角接近白色（白底）
    corner = img.getpixel((0, 0))
    assert corner[0] > 240 and corner[1] > 240 and corner[2] > 240


def test_render_jpeg_and_pdf_consistent():
    chart = ChartConfig(chart_type="bar", x_axis="账单时间", y_axis="货量", title="网点货量分析")
    pdf = render_chart_pdf(_result(), chart, RenderOpts())
    jpeg = render_chart_jpeg(_result(), chart, RenderOpts())
    assert len(pdf) > 1000 and len(jpeg) > 1000
    # 两者共用 prepare_chart_data，类别数/系列数一致
    data = prepare_chart_data(_result(), chart)
    assert len(data["categories"]) == 2
    assert len(data["series"]) == 1


def test_figsize_too_large_raises():
    chart = ChartConfig(chart_type="bar", x_axis="账单时间", y_axis="货量")
    with pytest.raises(AccountingError) as exc:
        render_chart_jpeg(_result(), chart, RenderOpts(figsize=[200, 6]))
    assert exc.value.code == "INVALID_RENDER_OPTS"


COMBO_LABELS = [
    "上饶德兴 · 云南省 · 150-300",
    "上饶德兴 · 上海市 · 300-500",
    "东阳一部 · 上海市 · 60-150",
]


def test_fit_labels_wide_stays_flat():
    # 宽画布：不旋转、全显示（和前端 fitAxisLabels 同一套规则）
    wrapped, size, rotate, step = fit_labels(COMBO_LABELS, 400.0)
    assert rotate == 0
    assert step == 1
    assert all("\n" not in label for label in wrapped)
    assert size == 11.0


def test_fit_labels_narrow_goes_vertical_but_no_overlap():
    # 挤：斜排会压字 → 改竖排，仍然全显示，外接盒不超过刻度间距
    wrapped, size, rotate, step = fit_labels(COMBO_LABELS, 64.0)
    assert rotate == 90
    assert step == 1
    widest = max(len(row) for label in wrapped for row in label.split("\n"))
    assert label_footprint(widest, 3, size, rotate) <= 64.0


def test_fit_labels_extreme_hides_some_ticks():
    # 极挤：隔几个显示一个，外接盒仍塞得下
    wrapped, size, rotate, step = fit_labels(COMBO_LABELS, 12.0)
    assert step >= 2
    widest = max(len(row) for label in wrapped for row in label.split("\n"))
    assert label_footprint(widest, 3, size, rotate) <= 12.0 * step


# ── 一键算看板导出：排序 / 配色 / 图例（用户 2026-10-29 反馈「导出与预览不一致」）──

BOARD_BAND_ORDER = ["0-60", "60-150", "150-300", "300-500", "500-800", "800+"]
BOARD_SERIES = "上饶德兴 · 上海市 · 公斤段折扣"


def _board_result():
    return ComputeResult(
        columns=["公斤段", BOARD_SERIES],
        rows=[
            [band, round(0.5 + index / 10, 3)]
            for index, band in enumerate(BOARD_BAND_ORDER)
        ],
        row_count=len(BOARD_BAND_ORDER),
        meta={},
    )


def test_custom_sort_keeps_board_band_order():
    # 一键算导出传 sort_by="custom"：公斤段必须保持自然序
    chart = ChartConfig(
        chart_type="line",
        x_axis="公斤段",
        y_axis="比率 / 单价",
        show_fields=[BOARD_SERIES],
        sort_by="custom",
    )
    assert prepare_chart_data(_board_result(), chart)["categories"] == BOARD_BAND_ORDER

    # 反证：sort_by="x" 是字符串排序，就是旧导出公斤段顺序乱的根因
    sorted_chart = chart.model_copy(update={"sort_by": "x"})
    assert prepare_chart_data(_board_result(), sorted_chart)["categories"] == sorted(
        BOARD_BAND_ORDER
    )


def test_single_series_with_axis_title_renders():
    # 只勾 1 行 × 1 个指标：y_axis 只是轴标题，旧代码会报「Y 轴字段不存在」
    chart = ChartConfig(
        chart_type="line",
        x_axis="公斤段",
        y_axis="比率 / 单价",
        show_fields=[BOARD_SERIES],
        sort_by="custom",
    )
    data = prepare_chart_data(_board_result(), chart)
    assert [s["name"] for s in data["series"]] == [BOARD_SERIES]
    jpeg = render_chart_jpeg(_board_result(), chart, RenderOpts(figsize=[10, 6], dpi=100))
    assert jpeg[:2] == b"\xff\xd8"


def test_series_colors_override_palette():
    # 导出配色跟预览同一套（不传 series_colors 时才会掉进灰蓝 Tableau 色）
    chart = ChartConfig(
        chart_type="line",
        x_axis="账单时间",
        y_axis="货量",
        show_fields=["货量", "现价合计"],
        series_colors=["#0071e3", "#34c759"],
    )
    fig = _render_to_figure(
        prepare_chart_data(_multi_result(), chart), chart, RenderOpts(figsize=[10, 6], dpi=100)
    )
    try:
        assert [line.get_color() for line in fig.axes[0].get_lines()] == [
            "#0071e3",
            "#34c759",
        ]
    finally:
        plt.close(fig)


def test_invalid_series_color_raises():
    chart = ChartConfig(
        chart_type="line", x_axis="账单时间", y_axis="货量", series_colors=["blue"]
    )
    with pytest.raises(AccountingError) as exc:
        render_chart_pdf(_result(), chart, RenderOpts())
    assert exc.value.code == "INVALID_CHART_CONFIG"
    assert "系列颜色" in exc.value.message


def test_legend_sits_below_axes():
    # 图例必须移出画布底部（放图内 loc="best" 会压住数据线）
    chart = ChartConfig(
        chart_type="line",
        x_axis="账单时间",
        y_axis="货量",
        show_fields=["货量", "现价合计"],
    )
    fig = _render_to_figure(
        prepare_chart_data(_multi_result(), chart), chart, RenderOpts(figsize=[10, 6], dpi=100)
    )
    try:
        fig.canvas.draw()
        axes = fig.axes[0]
        assert axes.get_legend() is None  # 不再是 axes 级图例
        assert len(fig.legends) == 1  # 改成画布级图例（在画布内部下方）
        legend = fig.legends[0]
        renderer = fig.canvas.get_renderer()
        assert legend.get_window_extent(renderer).y1 <= axes.get_window_extent(renderer).y0
    finally:
        plt.close(fig)


def test_many_series_legend_does_not_cover_plot():
    """58 条系列（一键算 29 组 × 2 指标）时：图例必须在绘图区下方，X 轴刻度不被压住。

    用户 2026-10-29 反馈「网点对比图表导出的总表排版有问题」：固定 ``bottom=0.2`` 装不下
    58 条图例，图例往上长进绘图区，把折线和刻度一起盖住。
    """
    seasons = [f"网点{i} · 省份{i % 29} · 指标{j}" for i in range(29) for j in range(2)]
    count = len(seasons)
    assert count == 58
    result = ComputeResult(
        columns=["公斤段", *seasons],
        rows=[
            ["0-60", *[100.0 + index for index in range(count)]],
            ["60-150", *[200.0 + index for index in range(count)]],
            ["150-300", *[300.0 + index for index in range(count)]],
        ],
        row_count=3,
        meta={},
    )
    chart = ChartConfig(
        chart_type="line",
        x_axis="公斤段",
        y_axis="比率 / 单价",
        show_fields=list(seasons),
        sort_by="custom",
        show_legend=True,
    )
    fig = _render_to_figure(
        prepare_chart_data(result, chart), chart, RenderOpts(figsize=[10, 6], dpi=100)
    )
    try:
        fig.canvas.draw()
        renderer = fig.canvas.get_renderer()
        axes = fig.axes[0]
        axes_box = axes.get_window_extent(renderer)
        legend_box = fig.legends[0].get_window_extent(renderer)
        # ① 图例整体在绘图区下方（不再压住折线）
        assert legend_box.y1 <= axes_box.y0
        # ② 图例没有横向溢出画布（列数按画布宽度反推）
        assert legend_box.x1 <= fig.bbox.width + 1
        assert legend_box.x0 >= -1
        # ③ X 轴刻度标签落在图例上方（都看得见）
        tick_boxes = [
            label.get_window_extent(renderer)
            for label in axes.get_xticklabels()
            if label.get_window_extent(renderer).height > 0
        ]
        assert tick_boxes
        assert all(box.y0 >= legend_box.y1 for box in tick_boxes)
        # ④ 画布不会被压扁，且绘图区没被压成一条缝（图例不够放时会自动加高）
        assert fig.get_size_inches()[1] >= 6.0
        assert axes_box.height / fig.bbox.height > 0.4
    finally:
        plt.close(fig)


# ── 数值格式（用户 2026-10-29：千以上写成 1,000，不用「万」）──


def test_tick_labels_use_thousands_separator():
    assert format_tick(10_000) == "10,000"
    assert format_tick(4558.82) == "4,559"  # 千以上不显示小数
    assert format_tick(-12345) == "-12,345"
    assert format_tick(999.5) == "999.5"  # 千以下保持短格式
    assert format_tick(0.65) == "0.65"
    assert format_tick(0) == "0"


def test_large_ticks_render_grouped_in_pdf():
    # 导出图里的刻度也要 1,000 形式（导出 = 预览），且不许再出现「万」
    result = ComputeResult(
        columns=["账单时间", "货量"],
        rows=[["2026-01-05", 45678], ["2026-01-20", 51234]],
        row_count=2,
        meta={},
    )
    chart = ChartConfig(chart_type="bar", x_axis="账单时间", y_axis="货量", title="大数刻度")
    text = _extract_text(render_chart_pdf(result, chart, RenderOpts(figsize=[10, 6], dpi=100)))
    assert "万" not in text
    assert re.search(r"\d{1,3},\d{3}", text) is not None


# ── 第 14 轮：导出的饼图要有辅助线、标签不重叠（用户反馈「和预览不一致」）──


def _pie_result(count: int) -> ComputeResult:
    labels = [f"网点{index} · 广东省 · 150-300" for index in range(count)]
    return ComputeResult(
        columns=["组合", "货量"],
        rows=[[label, 10 + index] for index, label in enumerate(labels)],
        row_count=count,
        meta={},
    )


def _pie_chart() -> ChartConfig:
    return ChartConfig(
        chart_type="pie",
        x_axis="组合",
        y_axis="货量",
        show_fields=["货量"],
        title="饼图导出",
    )


def test_pie_percent_text_matches_preview():
    # 预览 ECharts 的 {d}% 最多两位小数、不留尾零
    assert pie_percent_text(0.028) == "2.8%"
    assert pie_percent_text(0.0004) == "0.04%"
    assert pie_percent_text(0.0622) == "6.22%"
    assert pie_percent_text(1.0) == "100%"


def test_spread_pie_labels_keeps_order_and_no_overlap():
    ideal = [0.2] * 8  # 全挤在同一高度
    heights = [0.2] * 8
    ys = spread_pie_labels(ideal, heights, -1.0, 1.0, 0.05)
    assert ys == sorted(ys, reverse=True)  # 上下顺序不变
    for upper, lower in zip(ys, ys[1:]):
        assert upper - lower >= 0.2 + 0.05 - 1e-9  # 相邻标签不重叠
    assert min(ys) >= -1.0 - 1e-9 and max(ys) <= 1.0 + 1e-9


def test_pie_export_draws_leader_lines_for_every_slice():
    result = _pie_result(12)
    chart = _pie_chart()
    fig = _render_to_figure(
        prepare_chart_data(result, chart), chart, RenderOpts(figsize=[8, 8], dpi=100)
    )
    try:
        fig.canvas.draw()
        ax = fig.axes[0]
        assert len(ax.patches) == 12  # 12 个扇形
        assert len(ax.lines) == 12  # 每个扇形一条辅助线（预览里的 labelLine）
        labels = [text for text in ax.texts if text.get_text().strip() != ""]
        assert len(labels) == 12
        # 标签带百分比（预览里饼图一直显示百分比）
        assert all("%" in text.get_text() for text in labels)
    finally:
        plt.close(fig)


def test_pie_labels_do_not_overlap_and_canvas_grows():
    result = _pie_result(29)
    chart = _pie_chart()
    fig = _render_to_figure(
        prepare_chart_data(result, chart), chart, RenderOpts(figsize=[8, 8], dpi=100)
    )
    try:
        fig.canvas.draw()
        ax = fig.axes[0]
        renderer = fig.canvas.get_renderer()
        texts = [text for text in ax.texts if text.get_text().strip() != ""]
        assert len(texts) == 29

        # 同一列（左/右）里，任意两个标签的包围盒不重叠
        columns: dict[str, list] = {}
        for text in texts:
            box = text.get_window_extent(renderer)
            side = "left" if (box.x0 + box.x1) / 2 < fig.bbox.width / 2 else "right"
            columns.setdefault(side, []).append(box)
        for column in columns.values():
            column.sort(key=lambda box: -box.y1)
            for upper, lower in zip(column, column[1:]):
                assert upper.y0 >= lower.y1 - 0.5

        # 29 个多行标签在 8 英寸高的画布里放不下 → 画布自动加高
        assert fig.get_size_inches()[1] > 8.0
    finally:
        plt.close(fig)
