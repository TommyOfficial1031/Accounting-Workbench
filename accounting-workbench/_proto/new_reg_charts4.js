/**
 * 图 1：货量 – 现价
 *   趋势线 = 等总收入线：总收入 A = 网点货量 × 现价 + 当前杂费 保持不变，
 *            P(Z) = (A − 当前杂费) ÷ Z —— 货量越大、单价越低，且过起点。
 *   基准盈利线 = C（水平）：现价在它上面才有价差利润。
 *   参考虚线 = 计划承诺货量 Z（垂直）。
 */
function regDrawPriceTrend(M) {
  const w = 520, h = 300, padL = 50, padR = 40, padT = 16, padB = 42;
  const xMax = Math.max(M.Z, M.Znow, 1000) * 1.35;
  const trendAt = M.trendAt;

  /* 纵轴范围：C、现价、趋势线在可视区间的取值 */
  const trendVals = [];
  for (let i = 1; i <= 60; i += 1) {
    const z = (xMax * i) / 60;
    const v = trendAt(z);
    if (Number.isFinite(v) && v >= 0) trendVals.push(v);
  }
  const cand = [M.C, M.P].concat(trendVals).filter((v) => Number.isFinite(v));
  const lo = Math.min(...cand);
  const hi = Math.max(...cand);
  const pad = Math.max(0.01, (hi - lo) * 0.15);
  const yMin = Math.max(0, lo - pad);
  const yMax = hi + pad;
  const sx = (z) => padL + (z / xMax) * (w - padL - padR);
  const sy = (p) => h - padB - ((p - yMin) / (yMax - yMin || 1)) * (h - padB - padT);
  const clampP = (p) => Math.max(yMin, Math.min(yMax, p));
  const inRange = (p) => p >= yMin && p <= yMax;

  const gridY = [0, 0.25, 0.5, 0.75, 1].map((t) => yMin + (yMax - yMin) * t);
  const gridX = [0, 0.25, 0.5, 0.75, 1].map((t) => xMax * t);

  /* 趋势线（等总收入） */
  const pts = [];
  const zEntry = M.totalNow - M.Bnow > 0 && yMax > 0 ? (M.totalNow - M.Bnow) / yMax : 0;
  const zStart = Math.max(1, Math.min(zEntry, xMax));
  for (let i = 0; i <= 160; i += 1) {
    const z = zStart + ((xMax - zStart) * i) / 160;
    const v = trendAt(z);
    if (Number.isFinite(v)) pts.push([z, clampP(v)]);
  }

  let marks = "";
  /* 亏本区（价格低于成本） */
  if (inRange(M.C)) {
    const yC = sy(M.C);
    marks += `<rect x="${padL}" y="${Math.min(yC, h - padB).toFixed(1)}" width="${(w - padL - padR).toFixed(
      1
    )}" height="${Math.max(0, h - padB - Math.min(yC, h - padB)).toFixed(1)}" fill="var(--color-danger)" opacity=".06"/>`;
    marks += `<line x1="${padL}" y1="${yC.toFixed(1)}" x2="${w - padR}" y2="${yC.toFixed(1)}" stroke="var(--color-danger)" stroke-width="1.6" stroke-dasharray="6 4"/>`;
    marks += `<text x="${w - padR - 2}" y="${(yC - 6).toFixed(1)}" font-size="9.5" fill="var(--color-danger)" text-anchor="end">基准盈利线 C = ${M.C.toFixed(
      4
    )}</text>`;
  }
  /* 趋势线 */
  if (pts.length > 1) {
    const path = pts.map(([z, v], i) => `${i === 0 ? "M" : "L"}${sx(z).toFixed(1)},${sy(v).toFixed(1)}`).join(" ");
    marks += `<path d="${path}" fill="none" stroke="var(--color-primary)" stroke-width="2.2" stroke-linejoin="round"/>`;
    marks += `<text x="${(sx(pts[0][0]) + 6).toFixed(1)}" y="${(sy(pts[0][1]) + 14).toFixed(1)}" font-size="9" fill="var(--color-primary)">等总收入趋势线</text>`;
  }
  /* 计划承诺货量竖线 */
  if (M.Z > 0 && M.Z <= xMax) {
    const xZ = sx(M.Z);
    marks += `<line x1="${xZ.toFixed(1)}" y1="${padT}" x2="${xZ.toFixed(1)}" y2="${h - padB}" stroke="var(--color-text-secondary)" stroke-width="1.2" stroke-dasharray="5 4" opacity=".85"/>`;
    marks += `<text x="${(xZ + 4).toFixed(1)}" y="${padT + 11}" font-size="9" fill="var(--color-text-secondary)">计划货量 ${regKg(
      M.Z
    )}</text>`;
  }
  /* 趋势线 × 成本线：收入不变时，货量超过这里单价就低于成本 */
  const zCross = M.C > 0 ? (M.totalNow - M.Bnow) / M.C : NaN;
  if (Number.isFinite(zCross) && zCross > 0 && zCross <= xMax && inRange(M.C)) {
    const cx = sx(zCross);
    marks += `<circle cx="${cx.toFixed(1)}" cy="${sy(M.C).toFixed(1)}" r="3.4" fill="var(--color-danger)" stroke="var(--color-bg)" stroke-width="1.4"/>`;
    marks += `<text x="${cx.toFixed(1)}" y="${(sy(M.C) + 16).toFixed(1)}" font-size="9" fill="var(--color-danger)" text-anchor="middle">${regKg(
      zCross
    )}</text>`;
  }
  /* 起点 + 计划点（同一现价，货量不同） */
  if (Number.isFinite(M.P) && inRange(M.P)) {
    const py = sy(M.P);
    if (M.Znow > 0 && M.Znow <= xMax) {
      const px = sx(M.Znow);
      marks += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4" fill="var(--color-success)" stroke="var(--color-bg)" stroke-width="1.5"/>`;
      marks += `<text x="${(px + 7).toFixed(1)}" y="${(py - 7).toFixed(1)}" font-size="9.5" fill="var(--color-text-secondary)">起点 ${regKg(
        M.Znow
      )} · ${M.P.toFixed(4)}</text>`;
    }
    if (M.Z > 0 && M.Z <= xMax) {
      const qx = sx(M.Z);
      marks += `<circle cx="${qx.toFixed(1)}" cy="${py.toFixed(1)}" r="3.4" fill="var(--color-bg)" stroke="var(--color-text-secondary)" stroke-width="1.4"/>`;
    }
  }

  $("#reg-chart").innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" role="img">
      ${gridY
        .map(
          (p) => `<line x1="${padL}" y1="${sy(p).toFixed(1)}" x2="${w - padR}" y2="${sy(p).toFixed(1)}" stroke="var(--color-border-soft)" opacity=".45"/>
        <text x="${padL - 6}" y="${(sy(p) + 3).toFixed(1)}" font-size="9" fill="var(--color-text-tertiary)" text-anchor="end">${p.toFixed(
          2
        )}</text>`
        )
        .join("")}
      <line x1="${padL}" y1="${h - padB}" x2="${w - padR}" y2="${h - padB}" stroke="var(--color-border)"/>
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${h - padB}" stroke="var(--color-border)"/>
      ${marks}
      ${gridX
        .map(
          (z) =>
            `<text x="${sx(z).toFixed(1)}" y="${h - padB + 13}" font-size="9" fill="var(--color-text-tertiary)" text-anchor="middle">${regShort(
              z
            )}</text>`
        )
        .join("")}
      <text x="${w - padR}" y="${h - 6}" font-size="9" fill="var(--color-text-tertiary)" text-anchor="end">承诺货量（kg）→　现价（元/kg）↑　总收入 ${regMoney(
        M.totalNow
      )} 不变</text>
    </svg>`;

  if ($("#reg-pol-note")) {
    $("#reg-pol-note").textContent =
      `趋势线 = 等总收入线：网点当前总收入 ${regMoney(M.totalNow)}（${regKg(M.Znow)} × ${M.P.toFixed(4)} + 当前杂费 ${regMoney(
        M.Bnow
      )}）；` +
      (Number.isFinite(zCross) && zCross > 0
        ? `收入不变时，货量超过 ${regKg(zCross)} 单价就低于成本 C（${M.C.toFixed(4)}）。`
        : "收入不变时单价始终高于成本。");
  }
}

/**
 * 图 2：承诺货量 → 利润（左轴 元）与利润率（右轴 %）
 *   实线 = 合计利润 (P−C)×Z+B；灰虚线 = 只有价差 (P−C)×Z；
 *   两者之间的垂直距离恒等于 B（杂费只做平移）。
 */
function regDrawProfitRate(M) {
  const w = 460, h = 300, padL = 56, padR = 46, padT = 16, padB = 46;
  const zMax = Math.max(M.Z * 2.2, 1000);
  const lAt = (z) => M.m * z + M.B;
  const l0At = (z) => M.m * z;
  const rAt = (z) => {
    const rev = M.P * z + M.B;
    return rev !== 0 ? (M.m * z + M.B) / rev : NaN;
  };
  const lVals = [lAt(0), lAt(zMax), l0At(zMax), 0].filter((v) => Number.isFinite(v));
  let yMin = Math.min(...lVals);
  let yMax = Math.max(...lVals);
  const lpad = Math.max(1, (yMax - yMin) * 0.1);
  yMin -= lpad;
  yMax += lpad;

  const rStart = M.B > 0 ? 1 : M.rateNoB;
  const rVals = [rStart, rAt(zMax), 0].filter((v) => Number.isFinite(v));
  let rMin = Math.min(...rVals);
  let rMax = Math.max(...rVals);
  const rpad = Math.max(0.02, (rMax - rMin) * 0.08);
  rMin -= rpad;
  rMax += rpad;
  if (rMax > 1.02) rMax = 1.02;

  const sx = (z) => padL + (z / zMax) * (w - padL - padR);
  const syL = (v) => h - padB - ((v - yMin) / (yMax - yMin || 1)) * (h - padB - padT);
  const syR = (v) => h - padB - ((v - rMin) / (rMax - rMin || 1)) * (h - padB - padT);

  const lPath = `M${sx(0).toFixed(1)},${syL(lAt(0)).toFixed(1)} L${sx(zMax).toFixed(1)},${syL(lAt(zMax)).toFixed(1)}`;
  const l0Path = `M${sx(0).toFixed(1)},${syL(l0At(0)).toFixed(1)} L${sx(zMax).toFixed(1)},${syL(l0At(zMax)).toFixed(1)}`;
  const rPts = [];
  for (let i = 0; i <= 120; i += 1) {
    const z = (zMax * i) / 120;
    const v = rAt(z);
    if (Number.isFinite(v)) rPts.push([z, v]);
  }
  const rPath = rPts.map(([z, v], i) => `${i === 0 ? "M" : "L"}${sx(z).toFixed(1)},${syR(v).toFixed(1)}`).join(" ");

  const planX = sx(Math.min(M.Z, zMax));
  const planY = syL(M.now);
  let marks =
    `<path d="${l0Path}" fill="none" stroke="var(--color-text-tertiary)" stroke-width="1.2" stroke-dasharray="5 4" opacity=".85"></path>` +
    `<path d="${lPath}" fill="none" stroke="var(--color-primary)" stroke-width="2.2"></path>` +
    `<path d="${rPath}" fill="none" stroke="var(--color-warning)" stroke-width="1.8" stroke-dasharray="6 3"></path>`;
  marks += `<line x1="${planX.toFixed(1)}" y1="${syL(l0At(M.Z)).toFixed(1)}" x2="${planX.toFixed(1)}" y2="${planY.toFixed(1)}" stroke="var(--color-text-tertiary)" stroke-width="1" stroke-dasharray="3 3"/>`;
  marks += `<circle cx="${planX.toFixed(1)}" cy="${syL(l0At(M.Z)).toFixed(1)}" r="2.6" fill="var(--color-text-tertiary)"></circle>`;
  marks += `<circle cx="${planX.toFixed(1)}" cy="${planY.toFixed(1)}" r="4.2" fill="var(--color-primary)" stroke="var(--color-bg)" stroke-width="1.5"/>`;
  marks += `<text x="${(planX + 8).toFixed(1)}" y="${(planY - 8).toFixed(1)}" font-size="9.5" fill="var(--color-text-secondary)">计划 ${regKg(
    M.Z
  )} · ${regMoney(M.now)}</text>`;
  marks += `<text x="${(planX + 8).toFixed(1)}" y="${((planY + syL(l0At(M.Z))) / 2 + 3).toFixed(1)}" font-size="8.5" fill="var(--color-text-tertiary)">杂费 +${regMoney(
    M.B
  )}</text>`;
  /* 起点（网点当前货量）的利润 */
  if (M.Znow > 0 && M.Znow <= zMax && Math.abs(M.Znow - M.Z) > 1) {
    const nx = sx(M.Znow);
    const ny = syL(M.profitNow);
    marks += `<circle cx="${nx.toFixed(1)}" cy="${ny.toFixed(1)}" r="3.4" fill="var(--color-success)" stroke="var(--color-bg)" stroke-width="1.4"/>`;
    marks += `<text x="${(nx + 7).toFixed(1)}" y="${(ny + 14).toFixed(1)}" font-size="9" fill="var(--color-text-secondary)">起点 ${regMoney(
      M.profitNow
    )}</text>`;
  }

  $("#reg-chart2").innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" role="img">
      ${[0, 0.25, 0.5, 0.75, 1]
        .map((t) => {
          const lv = yMin + (yMax - yMin) * t;
          const rv = rMin + (rMax - rMin) * t;
          return `<line x1="${padL}" y1="${syL(lv).toFixed(1)}" x2="${w - padR}" y2="${syL(lv).toFixed(1)}" stroke="var(--color-border-soft)" opacity=".45"/>
        <text x="${padL - 6}" y="${(syL(lv) + 3).toFixed(1)}" font-size="9" fill="var(--color-text-tertiary)" text-anchor="end">${regShort(lv)}</text>
        <text x="${w - padR + 6}" y="${(syR(rv) + 3).toFixed(1)}" font-size="9" fill="var(--color-warning)">${(rv * 100).toFixed(0)}%</text>`;
        })
        .join("")}
      <line x1="${padL}" y1="${syL(0).toFixed(1)}" x2="${w - padR}" y2="${syL(0).toFixed(1)}" stroke="var(--color-border)" stroke-width="1.2"/>
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${h - padB}" stroke="var(--color-border)"/>
      <line x1="${w - padR}" y1="${padT}" x2="${w - padR}" y2="${h - padB}" stroke="var(--color-border-soft)"/>
      ${marks}
      ${[0, 0.25, 0.5, 0.75, 1]
        .map((t) => {
          const z = zMax * t;
          return `<text x="${sx(z).toFixed(1)}" y="${h - padB + 13}" font-size="9" fill="var(--color-text-tertiary)" text-anchor="middle">${regShort(z)}</text>`;
        })
        .join("")}
      <text x="${padL}" y="${h - 16}" font-size="8.5" fill="var(--color-primary)">实线 = 合计利润（左轴）</text>
      <text x="${padL + 108}" y="${h - 16}" font-size="8.5" fill="var(--color-text-tertiary)">灰虚线 = 只有价差（不含杂费）</text>
      <text x="${padL}" y="${h - 4}" font-size="8.5" fill="var(--color-warning)">虚线 = 利润率（右轴）</text>
      <text x="${padL + 96}" y="${h - 4}" font-size="8.5" fill="var(--color-text-tertiary)">两线间距恒为杂费 ${regMoney(
        M.B
      )}；货量越大利润率越接近 ${regPct(M.rateNoB, 2)}</text>
    </svg>`;
}

