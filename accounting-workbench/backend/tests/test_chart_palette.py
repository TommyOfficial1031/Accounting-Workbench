"""调色板一致性测试：色值与前端 chartPalette.ts 同步。"""

from __future__ import annotations

from accounting_backend.chart.palette import CHART_PALETTES


def test_default_palette_matches_frontend():
    assert CHART_PALETTES["default"] == [
        "#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f",
        "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac",
    ]


def test_warm_palette_matches_frontend():
    assert CHART_PALETTES["warm"] == [
        "#e15759", "#f28e2b", "#edc948", "#b07aa1", "#c0392b",
        "#e67e22", "#d35400", "#f39c12", "#f1c40f", "#a93226",
    ]


def test_cool_palette_matches_frontend():
    assert CHART_PALETTES["cool"] == [
        "#76b7b2", "#4e79a7", "#59a14f", "#1f77b4", "#2ca02c",
        "#17becf", "#1f618d", "#2980b9", "#3498db", "#16a085",
    ]
