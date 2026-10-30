/**
 * 表格取数：每张卡片一张小图（3 个一行）
 *   虚线 = 调整前（从数据货量那个点起），实线 = 调整后（从计划货量那个点起），同组同色。
 */
function regDrawGroupLines(M) {
  const host = $("#reg-charts");
  if (!host) return;
  const groups = M.groups || [];
  const PALETTE = [
    "var(--color-primary)", "var(--color-warning)", "var(--color-success)", "var(--color-danger)",
    "#8b5cf6", "#0ea5e9", "#ec4899", "#14b8a6"
  ];

  const mini = (g, idx) => {
    const color = PALETTE[idx % PALETTE.length];
    const w = 360, h = 210, padL = 52, padR = 14, padT = 16, padB = 30;
    const zA = g.z > 0 ? g.z : 0;
    const zB = g.zPlan > 0 ? g.zPlan : zA;
    const lo = Math.min(zA, zB);
    const hi = Math.max(zA, zB);
    let xMin, xMax;
    if (hi <= 0) { xMin = 0; xMax = 1000; }
    else if (hi - lo < 1e-6) { xMin = Math.max(0, lo * 0.78); xMax = hi * 1.22; }
    else { xMin = Math.max(0, lo * 0.86); xMax = hi * 1.14; }

    const beforeAt = (z) => g.mNow * z;
    const afterAt = (z) => g.mPlan * z;
    const ys = [0, beforeAt(zA), beforeAt(xMax), afterAt(zB), afterAt(xMax)].filter((v) => Number.isFinite(v));
    let yMin = Math.min(...ys);
    let yMax = Math.max(...ys);
    const ypad = Math.max(1, (yMax - yMin) * 0.22);
    yMin -= ypad;
    yMax += ypad;

    const sx = (z) => padL + ((z - xMin) / (xMax - xMin || 1)) * (w - padL - padR);
    const sy = (v) => h - padB - ((v - yMin) / (yMax - yMin || 1)) * (h - padB - padT);
    const clampV = (v) => Math.max(yMin, Math.min(yMax, v));

    const xTicks = [0, 0.5, 1].map((t) => Math.round(xMin + (xMax - xMin) * t));
    const yTicks = [0, 0.5, 1].map((t) => yMin + (yMax - yMin) * t);

    return `<div class="card-soft reg-mini" data-zoom="${g.label}">
      <div class="reg-mini-title" title="${g.label}">${g.label}</div>
      <div class="reg-mini-box">
        <svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" role="img">
          ${yTicks
            .map(
              (v) => `<line x1="${padL}" y1="${sy(v).toFixed(1)}" x2="${w - padR}" y2="${sy(v).toFixed(1)}" stroke="var(--color-border-soft)" opacity=".45"/>
            <text x="${padL - 6}" y="${(sy(v) + 3.5).toFixed(1)}" font-size="9.5" fill="var(--color-text-tertiary)" text-anchor="end">${regInt(
                v
              )}</text>`
            )
            .join("")}
          <line x1="${padL}" y1="${sy(clampV(0)).toFixed(1)}" x2="${w - padR}" y2="${sy(clampV(0)).toFixed(1)}" stroke="var(--color-border)"/>
          <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${h - padB}" stroke="var(--color-border)"/>
          <path d="M${sx(zA).toFixed(1)},${sy(clampV(beforeAt(zA))).toFixed(1)} L${sx(xMax).toFixed(1)},${sy(
      clampV(beforeAt(xMax))
    ).toFixed(1)}" fill="none" stroke="${color}" stroke-width="1.5" stroke-dasharray="6 4" opacity=".9"/>
          <path d="M${sx(zB).toFixed(1)},${sy(clampV(afterAt(zB))).toFixed(1)} L${sx(xMax).toFixed(1)},${sy(
      clampV(afterAt(xMax))
    ).toFixed(1)}" fill="none" stroke="${color}" stroke-width="2.2"/>
          <circle cx="${sx(zB).toFixed(1)}" cy="${sy(clampV(afterAt(zB))).toFixed(1)}" r="3.2" fill="${color}" stroke="var(--color-bg)" stroke-width="1.3"/>
          ${xTicks
            .map(
              (v, i) =>
                `<text x="${sx(v).toFixed(1)}" y="${h - padB + 13}" font-size="9.5" fill="var(--color-text-tertiary)" text-anchor="${
                  i === 0 ? "start" : i === 2 ? "end" : "middle"
                }">${regInt(v)}</text>`
            )
            .join("")}
        </svg>
      </div>
      <div class="reg-mini-legend" data-zoom-legend>
        <span style="color:${color}">调整前 ${regMoney(g.profitNow)}（${regPct(g.rateNow, 2)}）</span>
        <span style="color:${color}">调整后 ${regMoney(g.profitPlan)}（${regPct(g.ratePlan, 2)}）</span>
      </div>
    </div>`;
  };

  host.className = "reg-charts grid3";
  host.innerHTML =
    `<div class="reg-grid-hint">横轴 = 货量（kg），纵轴 = 利润（元）；虚线 = 调整前，实线 = 调整后；双击任意一张放大</div>` +
    groups.map((g, i) => mini(g, i)).join("");

  const legend = $("#reg-pol-note");
  if (legend) legend.innerHTML = "";
}

/** 手动模式的单张图外壳 */
const REG_CHART_SHELL = `<div class="card-soft reg-chart-card">
  <div class="reg-chart-title">货量 – 利润：调整前 vs 调整后</div>
  <div class="chart-box" id="reg-chart" data-zoom="货量 – 利润：调整前 vs 调整后"></div>
  <div class="reg-legend" id="reg-pol-note" data-zoom-legend></div>
</div>`;

