const COMPARE_COLORS = ["#0071e3", "#34c759", "#ff9500", "#af52de", "#ff3b30", "#5ac8fa"];

const COMPARE_METRICS = [
  { v: "flow", label: "货物流向占比" },
  { v: "discount", label: "公斤段折扣" },
  { v: "price", label: "公斤段单价" }
];

const COMPARE_MAX_ROWS = 6;

function compareValue(cell, rowVolume, metric) {
  if (metric === "flow") return rowVolume > 0 ? cell.vol / rowVolume : 0;
  if (metric === "price") return cell.vol > 0 ? cell.price / cell.vol : 0;
  return cell.orig > 0 ? cell.price / cell.orig : 0;
}

function compareSection(data) {
  const active = [...boardState.compareMetrics];
  const metrics = active.length > 0 ? active : ["discount"];

  // 按当前「分组维度」取前 N 组（默认按货量排序），保证图表与表格同口径
  const ordered = [...data.rows]
    .map((row) => ({ row, volume: row.cells.reduce((a, c) => a + c.vol, 0) }))
    .sort((a, b) => b.volume - a.volume);
  const picked = ordered.slice(0, COMPARE_MAX_ROWS);
  const truncated = ordered.length - picked.length;

  const series = [];
  picked.forEach((entry) => {
    metrics.forEach((metric) => {
      series.push({
        name: `${entry.row.label} · ${COMPARE_METRICS.find((m) => m.v === metric)?.label ?? metric}`,
        color: COMPARE_COLORS[series.length % COMPARE_COLORS.length],
        values: entry.row.cells.map((cell) => compareValue(cell, entry.volume, metric))
      });
    });
  });

  const allValues = series.flatMap((s) => s.values).filter((v) => Number.isFinite(v));
  const min = allValues.length ? Math.min(...allValues) : 0;
  const max = allValues.length ? Math.max(...allValues) : 1;
  const pad = (max - min) * 0.18 || 0.01;
  const yMin = min - pad;
  const yMax = max + pad;

  const w = 660, h = 330, padL = 58, padB = 44, padT = 18;
  const px = (i) => padL + (i / (BOARD_BANDS.length - 1)) * (w - padL - 20);
  const py = (v) => h - padB - ((v - yMin) / (yMax - yMin)) * (h - padB - padT);

  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map((t) => {
      const value = yMin + (yMax - yMin) * t;
      const y = py(value).toFixed(1);
      return `<line x1="${padL}" y1="${y}" x2="${w - 8}" y2="${y}" stroke="var(--color-border-soft)" opacity=".6"></line>
        <text x="${padL - 8}" y="${Number(y) + 3}" font-size="9" fill="var(--color-text-tertiary)" text-anchor="end">${value.toFixed(3)}</text>`;
    })
    .join("");

  const lines = series
    .map((s) => {
      const points = s.values
        .map((value, i) => `${px(i).toFixed(1)},${py(Number.isFinite(value) ? value : yMin).toFixed(1)}`)
        .join(" ");
      const dots = s.values
        .map(
          (value, i) =>
            `<circle cx="${px(i).toFixed(1)}" cy="${py(Number.isFinite(value) ? value : yMin).toFixed(1)}" r="3" fill="${s.color}"></circle>`
        )
        .join("");
      return `<polyline points="${points}" fill="none" stroke="${s.color}" stroke-width="2"></polyline>${dots}`;
    })
    .join("");

  const xLabels = BOARD_BANDS.map(
    (band, i) =>
      `<text x="${px(i)}" y="${h - padB + 16}" font-size="10" fill="var(--color-text-tertiary)" text-anchor="middle">${band}</text>`
  ).join("");

  const legend = series
    .map((s) => `<span><i style="background:${s.color}"></i>${s.name}</span>`)
    .join("");

  const chips = COMPARE_METRICS.map(
    (metric) =>
      `<button class="cmetric ${metrics.includes(metric.v) ? "on" : ""}" data-cmetric="${metric.v}">
        <span class="tick">${metrics.includes(metric.v) ? "✓" : ""}</span>${metric.label}</button>`
  ).join("");

  return `
    <section class="board-section">
      <div class="board-section-head">
        <span class="board-section-title">网点对比图表</span>
        <span class="board-section-sub">X = 公斤段；每条折线 = 「${data.dimLabel}」分组 × 指标${
          truncated > 0 ? ` · 仅显示货量前 ${COMPARE_MAX_ROWS} 组（含 ${truncated} 组未显示）` : ""
        }</span>
      </div>
      <div class="board-features" style="background:transparent;border-bottom:none;padding:8px 14px 0">
        <span class="tiny">对比指标</span>${chips}
      </div>
      <div class="chart-legend" style="padding:8px 14px 0">${legend}</div>
      <div style="padding:6px 14px 14px">
        <svg viewBox="0 0 ${w} ${h}" width="100%" style="max-height:330px">
          ${grid}
          <line x1="${padL}" y1="${h - padB}" x2="${w - 8}" y2="${h - padB}" stroke="var(--color-border)"></line>
          ${lines}${xLabels}
          <text x="${padL}" y="${h - 8}" font-size="9" fill="var(--color-text-tertiary)">公斤段</text>
        </svg>
      </div>
    </section>`;
}

document.addEventListener("click", (event) => {
  const chip = event.target.closest("[data-cmetric]");
  if (!chip) return;
  const value = chip.dataset.cmetric;
  if (boardState.compareMetrics.has(value)) {
    if (boardState.compareMetrics.size === 1) return;
    boardState.compareMetrics.delete(value);
  } else {
    boardState.compareMetrics.add(value);
  }
  renderBoard();
});
