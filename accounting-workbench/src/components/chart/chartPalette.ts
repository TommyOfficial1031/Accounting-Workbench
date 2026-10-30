// 图表调色板：与后端 backend/accounting_backend/chart/palette.py 保持一致（P6b 镜像）。
export const CHART_PALETTES: Record<string, string[]> = {
  default: [
    "#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f",
    "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac",
  ],
  warm: [
    "#e15759", "#f28e2b", "#edc948", "#b07aa1", "#c0392b",
    "#e67e22", "#d35400", "#f39c12", "#f1c40f", "#a93226",
  ],
  cool: [
    "#76b7b2", "#4e79a7", "#59a14f", "#1f77b4", "#2ca02c",
    "#17becf", "#1f618d", "#2980b9", "#3498db", "#16a085",
  ],
};

export const DEFAULT_PALETTE = "default";
