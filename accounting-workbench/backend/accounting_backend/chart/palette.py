"""图表调色板。

镜像自 src/components/chart/chartPalette.ts，修改请同步两处。
"""

from __future__ import annotations

CHART_PALETTES: dict[str, list[str]] = {
    "default": [
        "#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f",
        "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac",
    ],
    "warm": [
        "#e15759", "#f28e2b", "#edc948", "#b07aa1", "#c0392b",
        "#e67e22", "#d35400", "#f39c12", "#f1c40f", "#a93226",
    ],
    "cool": [
        "#76b7b2", "#4e79a7", "#59a14f", "#1f77b4", "#2ca02c",
        "#17becf", "#1f618d", "#2980b9", "#3498db", "#16a085",
    ],
}
