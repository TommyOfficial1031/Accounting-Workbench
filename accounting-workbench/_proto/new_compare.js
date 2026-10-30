/* ── 对比图表：合并 660×330 / 拆分 430×250；饼图带引导线 ── */
const CHART_W = 660;
const CHART_H = 330;
const MINI_W = 430;
const MINI_H = 250;

const COMPARE_LABEL = (v) => COMPARE_METRICS.find((m) => m.v === v)?.label ?? v;

/** 饼图：扇区内百分比 + 引导线（完整分组名 + 占比），标签做垂直防重叠 */
function pieDrawing(pieSlices, w, h) {
  const cx = w / 2;
  const cy = h / 2 - 4;
  const radius = Math.min(w * 0.62, h) / 3.2;
  let angle = -Math.PI / 2;
  const labels = [];
  const slices = pieSlices.map((slice) => {
    const span = slice.pct * Math.PI * 2;
    const start = angle;
    angle += span;
    const mid = start + span / 2;
    const x1 = cx + radius * Math.cos(start);
    const y1 = cy + radius * Math.sin(start);
    const x2 = cx + radius * Math.cos(angle);
    const y2 = cy + radius * Math.sin(angle);
    const large = span > Math.PI ? 1 : 0;
    // 扇区太窄就只留引导线，硬塞百分比会互相压字
    const inside =
      span > 0.22
        ? `<text x="${(cx + radius * 0.6 * Math.cos(mid)).toFixed(1)}" y="${(cy + radius * 0.6 * Math.sin(mid) + 3.5).toFixed(1)}"
            font-size="10" fill="#ffffff" text-anchor="middle"
            style="paint-order:stroke;stroke:rgba(0,0,0,.28);stroke-width:2.4px">${(slice.pct * 100).toFixed(1)}%</text>`
        : "";
    labels.push({
      dirRight: Math.cos(mid) >= 0,
      ax: cx + radius * Math.cos(mid),
      ay: cy + radius * Math.sin(mid),
      bendX: cx + radius * 1.1 * Math.cos(mid),
      bendY: cy + radius * 1.1 * Math.sin(mid),
      tipY: cy + radius * 1.1 * Math.sin(mid),
      color: slice.color,
      text: `${slice.label} ${(slice.pct * 100).toFixed(1)}%`
    });
    return `<path d="M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} A${radius},${radius} 0 ${large} 1 ${x2.toFixed(1)},${y2.toFixed(1)} Z"
        fill="${slice.color}" opacity=".9"></path>${inside}`;
  });
  const GAP = 13;
  labels.sort((a, b) => a.tipY - b.tipY);
  labels.forEach((item, i) => {
    if (i > 0 && item.tipY - labels[i - 1].tipY < GAP) item.tipY = labels[i - 1].tipY + GAP;
  });
  const leader = labels
    .map((item) => {
      const elbowX = item.bendX + (item.dirRight ? 10 : -10);
      return `<polyline points="${item.ax.toFixed(1)},${item.ay.toFixed(1)} ${item.bendX.toFixed(1)},${item.bendY.toFixed(1)} ${elbowX.toFixed(1)},${item.tipY.toFixed(1)}"
          fill="none" stroke="${item.color}" stroke-width="1"></polyline>
        <text x="${(elbowX + (item.dirRight ? 3 : -3)).toFixed(1)}" y="${(item.tipY + 3).toFixed(1)}" font-size="9.5"
          fill="var(--color-text-secondary)" text-anchor="${item.dirRight ? "start" : "end"}">${item.text}</text>`;
    })
    .join("");
  return slices.join("") + leader;
}

/** 通用图表画布：折线 / 柱状 / 散点 / 饼图 */
function compareChart({ series = [], pieSlices = [], w, h, type, bandLabels }) {
  if (type === "pie") {
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img">${pieDrawing(pieSlices, w, h)}</svg>`;
  }
  const padL = 58;
  const padR = 20;
  const padB = 44;
  const padT = 18;
  const values = series.flatMap((s) => s.values).filter((v) => Number.isFinite(v));
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const pad = (max - min) * 0.18 || 0.01;
  const yMin = min - pad;
  const yMax = max + pad;
  const px = (i) => padL + (i / Math.max(bandLabels.length - 1, 1)) * (w - padL - padR);
  const py = (v) => h - padB - ((v - yMin) / (yMax - yMin)) * (h - padB - padT);

  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map((t) => {
      const value = yMin + (yMax - yMin) * t;
      const y = py(value).toFixed(1);
      return `<line x1="${padL}" y1="${y}" x2="${w - 8}" y2="${y}" stroke="var(--color-border-soft)" opacity=".6"></line>
        <text x="${padL - 8}" y="${Number(y) + 3}" font-size="9" fill="var(--color-text-tertiary)" text-anchor="end">${value.toFixed(3)}</text>`;
    })
    .join("");

  let drawing = "";
  if (type === "bar") {
    const groupWidth = (w - padL - padR) / bandLabels.length;
    const barWidth = Math.max(3, (groupWidth - 10) / Math.max(series.length, 1));
    drawing = series
      .map((s, si) =>
        s.values
          .map((value, i) => {
            const v = Number.isFinite(value) ? value : yMin;
            const x = padL + i * groupWidth + 5 + si * barWidth;
            const y = py(v);
            return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(barWidth - 0.8).toFixed(1)}"
              height="${Math.max(h - padB - y, 0).toFixed(1)}" rx="2" fill="${s.color}" opacity=".85"></rect>`;
          })
          .join("")
      )
      .join("");
  } else if (type === "scatter") {
    drawing = series
      .map((s) =>
        s.values
          .map(
            (value, i) =>
              `<circle cx="${px(i).toFixed(1)}" cy="${py(Number.isFinite(value) ? value : yMin).toFixed(1)}" r="4" fill="${s.color}" opacity=".85"></circle>`
          )
          .join("")
      )
      .join("");
  } else {
    drawing = series
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
  }

  const xLabels = bandLabels
    .map(
      (band, i) =>
        `<text x="${px(i).toFixed(1)}" y="${h - padB + 16}" font-size="10" fill="var(--color-text-tertiary)" text-anchor="middle">${band}</text>`
    )
    .join("");

  return `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img">
      ${grid}
      <line x1="${padL}" y1="${h - padB}" x2="${w - 8}" y2="${h - padB}" stroke="var(--color-border)"></line>
      ${drawing}${xLabels}
      <text x="${padL}" y="${h - 8}" font-size="9" fill="var(--color-text-tertiary)">公斤段</text>
    </svg>`;
}

function compareSection(data) {
  const active = [...boardState.compareMetrics];
  const metrics = active.length > 0 ? active : ["discount"];
  const type = boardState.compareType ?? "line";

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
        name: `${entry.row.label} · ${COMPARE_LABEL(metric)}`,
        color: COMPARE_COLORS[series.length % COMPARE_COLORS.length],
        values: entry.row.cells.map((cell) => compareValue(cell, entry.volume, metric))
      });
    });
  });

  const pieTotal = picked.reduce((a, e) => a + e.volume, 0) || 1;
  const pieSlices = picked.map((entry, i) => ({
    label: entry.row.label,
    pct: entry.volume / pieTotal,
    color: COMPARE_COLORS[i % COMPARE_COLORS.length]
  }));

  // 多图时默认拆分；饼图只有一个圆，不参与拆分
  const splitAvailable = picked.length > 1 && type !== "pie";
  const splitOn = boardState.chartSplit !== false && splitAvailable;

  const legendHtml = (list) =>
    list.map((s) => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join("");

  let bodyHtml = "";
  if (splitOn) {
    bodyHtml = `<div class="chart-grid">${picked
      .map((entry) => {
        const one = metrics.map((metric, mi) => ({
          name: COMPARE_LABEL(metric),
          color: COMPARE_COLORS[mi % COMPARE_COLORS.length],
          values: entry.row.cells.map((cell) => compareValue(cell, entry.volume, metric))
        }));
        return `<div class="chart-mini">
            <div class="chart-mini-title"><span>${entry.row.label}</span><span class="tiny">${fmtVol(entry.volume)} kg</span></div>
            <div class="chart-fit">${compareChart({ series: one, w: MINI_W, h: MINI_H, type, bandLabels: BOARD_BANDS })}</div>
            <div class="chart-legend mini">${legendHtml(one)}</div>
          </div>`;
      })
      .join("")}</div>`;
  } else {
    bodyHtml = `<div class="chart-legend">${
      type === "pie"
        ? pieSlices.map((s) => `<span><i style="background:${s.color}"></i>${s.label} ${(s.pct * 100).toFixed(1)}%</span>`).join("")
        : legendHtml(series)
    }</div>
      <div class="chart-scroll">${compareChart({ series, pieSlices, w: CHART_W, h: CHART_H, type, bandLabels: BOARD_BANDS })}</div>`;
  }

  const typeChips = [
    { v: "line", label: "折线" },
    { v: "bar", label: "柱状" },
    { v: "pie", label: "饼图" },
    { v: "scatter", label: "散点" }
  ]
    .map(
      (item) =>
        `<button class="cmetric ${type === item.v ? "on" : ""}" data-ctype="${item.v}">
          <span class="tick">${type === item.v ? "✓" : ""}</span>${item.label}</button>`
    )
    .join("");

  const chips = COMPARE_METRICS.map(
    (metric) =>
      `<button class="cmetric ${metrics.includes(metric.v) ? "on" : ""}" data-cmetric="${metric.v}">
        <span class="tick">${metrics.includes(metric.v) ? "✓" : ""}</span>${metric.label}</button>`
  ).join("");

  const splitChips = `
    <span class="tiny" style="margin-left:6px">多图</span>
    <button class="cmetric ${splitOn ? "on" : ""}" data-csplit="split" ${splitAvailable ? "" : "disabled"}>
      <span class="tick">${splitOn ? "✓" : ""}</span>拆分</button>
    <button class="cmetric ${splitOn ? "" : "on"}" data-csplit="merge" ${splitAvailable ? "" : "disabled"}>
      <span class="tick">${splitOn ? "" : "✓"}</span>合并</button>`;

  const sub =
    type === "pie"
      ? `饼图 · 按「${data.dimLabel}」构成（扇区 = 货量占比，标签带引导线）`
      : splitOn
        ? `已拆分为 ${picked.length} 张图 · 分组「${data.dimLabel}」· X = 公斤段`
        : `X = 公斤段；每条折线 = 「${data.dimLabel}」分组 × 指标`;

  return `
    <section class="board-section">
      <div class="board-section-head">
        <span class="board-section-title">网点对比图表</span>
        <span class="board-section-sub">${sub}${truncated > 0 ? ` · 仅显示货量前 ${COMPARE_MAX_ROWS} 组（含 ${truncated} 组未显示）` : ""}</span>
      </div>
      <div class="board-features" style="background:transparent;border-bottom:none;padding:8px 14px 0">
        <span class="tiny">对比指标</span>${chips}
      </div>
      <div class="board-features" style="background:transparent;border-bottom:none;padding:6px 14px 0">
        <span class="tiny">图表样式</span>${typeChips}${splitChips}
      </div>
      ${bodyHtml}
    </section>`;
}
