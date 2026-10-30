/**
 * 议价政策在「折扣 – 货量」空间里是一条直线：
 *   d_p(Z) = d − (下浮百分点 ÷ 100) × (Z ÷ Z计划 − 1)
 * 也就是「给更低的折扣 ↔ 要更多的货量」。
 */
function regPolicyLine(M) {
  return (z) => (Number.isFinite(M.d) && M.Z > 0 ? M.d - (M.polPct / 100) * (z / M.Z - 1) : NaN);
}

/**
 * 图 1：折扣 – 货量 的【保本线】
 *   保本折扣 d_min(Z) = (C − B ÷ Z) ÷ P0：这个货量下不低于它才不亏。
 *   B = 0 时退化成水平线 C ÷ P0（与货量无关）。
 *   计划点落在曲线下方 → 亏；上方 → 赚。政策线再叠加一根做参考。
 */
function regDrawBalanceCurve(M) {
  const w = 520, h = 300, padL = 48, padR = 44, padT = 16, padB = 38;
  const policy = regPolicyLine(M);
  const hasPolicy = M.polOn && M.polPct > 0;
  const cross = hasPolicy ? regPolicyCross(M) : null;
  const zMax = Math.max(M.Z * 2.2, M.zBreak !== null ? M.zBreak * 1.8 : 0, cross !== null ? cross * 1.3 : 0, 1000);

  const dVals = [M.d, M.dStar].filter((v) => Number.isFinite(v));
  let yMin = Math.max(0, Math.min(...dVals) - 0.12);
  let yMax = Math.min(1, Math.max(...dVals) + 0.06);
  if (!(yMax > yMin)) { yMin = 0; yMax = 1; }
  const sx = (z) => padL + (z / zMax) * (w - padL - padR);
  const sy = (v) => h - padB - ((v - yMin) / (yMax - yMin)) * (h - padB - padT);
  const clamp = (v) => Math.max(yMin, Math.min(yMax, v));
  const inRange = (v) => v >= yMin && v <= yMax;

  const gridY = [0, 0.25, 0.5, 0.75, 1].map((t) => yMin + (yMax - yMin) * t);
  const gridX = [0, 0.25, 0.5, 0.75, 1].map((t) => zMax * t);

  /* 保本曲线：从「进入视窗」的货量开始画，避免 0 附近除零 */
  const entryZ = M.B > 0 && M.C - yMin * M.P0 > 0 ? M.B / (M.C - yMin * M.P0) : 0;
  const startZ = Math.max(1, Math.min(entryZ, zMax));
  const pts = [];
  for (let i = 0; i <= 160; i += 1) {
    const z = startZ + ((zMax - startZ) * i) / 160;
    const v = M.balanceAt(z);
    if (Number.isFinite(v)) pts.push([z, clamp(v)]);
  }
  let marks = "";
  if (pts.length > 1) {
    const curvePath = pts.map(([z, v], i) => `${i === 0 ? "M" : "L"}${sx(z).toFixed(1)},${sy(v).toFixed(1)}`).join(" ");
    const area =
      `M${sx(startZ).toFixed(1)},${(h - padB).toFixed(1)} ` +
      pts.map(([z, v]) => `L${sx(z).toFixed(1)},${sy(v).toFixed(1)}`).join(" ") +
      ` L${sx(zMax).toFixed(1)},${(h - padB).toFixed(1)} Z`;
    marks += `<path d="${area}" fill="var(--color-danger)" opacity=".07"/>`;
    marks += `<path d="${curvePath}" fill="none" stroke="var(--color-primary)" stroke-width="2.2"/>`;
    const last = pts[pts.length - 1];
    marks += `<text x="${(sx(last[0]) - 4).toFixed(1)}" y="${(sy(last[1]) - 8).toFixed(1)}" font-size="9" fill="var(--color-primary)" text-anchor="end">保本折扣线</text>`;
    marks += `<text x="${padL + 6}" y="${(h - padB - 6).toFixed(1)}" font-size="8.5" fill="var(--color-danger)">亏本区（折扣低于保本线）</text>`;
  }
  /* B = 0 的保本折扣：水平线 */
  if (Number.isFinite(M.dStar) && inRange(M.dStar)) {
    const yD = sy(M.dStar);
    marks += `<line x1="${padL}" y1="${yD.toFixed(1)}" x2="${w - padR}" y2="${yD.toFixed(1)}" stroke="var(--color-warning)" stroke-width="1.3" stroke-dasharray="6 4"/>` +
      `<text x="${w - padR - 2}" y="${(yD - 5).toFixed(1)}" font-size="9" fill="var(--color-warning)" text-anchor="end">B = 0：${regPct(M.dStar)}（C ÷ P0）</text>`;
  }
  /* 议价政策线（可选） */
  if (hasPolicy) {
    const pPts = [];
    for (let i = 0; i <= 120; i += 1) {
      const z = (zMax * i) / 120;
      const v = policy(z);
      if (Number.isFinite(v)) pPts.push([z, clamp(v)]);
    }
    if (pPts.length > 1) {
      const path = pPts.map(([z, v], i) => `${i === 0 ? "M" : "L"}${sx(z).toFixed(1)},${sy(v).toFixed(1)}`).join(" ");
      marks += `<path d="${path}" fill="none" stroke="var(--color-text-tertiary)" stroke-width="1.5" stroke-dasharray="7 4"/>`;
      marks += `<text x="${(sx(pPts[pPts.length - 1][0]) - 4).toFixed(1)}" y="${(sy(pPts[pPts.length - 1][1]) - 6).toFixed(1)}" font-size="9" fill="var(--color-text-tertiary)" text-anchor="end">议价政策（参考）</text>`;
    }
    if (cross !== null && cross <= zMax && inRange(M.d)) {
      const cx = sx(cross), cy = sy(policy(cross));
      marks += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="3.2" fill="var(--color-text-secondary)" stroke="var(--color-bg)" stroke-width="1.2"/>` +
        `<text x="${cx.toFixed(1)}" y="${(cy + 14).toFixed(1)}" font-size="9" fill="var(--color-text-secondary)" text-anchor="middle">交于 ${regKg(cross)}</text>`;
    }
  }
  /* 保本货量：计划折扣水平线与保本曲线的交点 */
  if (M.zBreak !== null && M.zBreak <= zMax && inRange(M.d)) {
    const bx = sx(M.zBreak), by = sy(M.d);
    marks += `<line x1="${padL}" y1="${by.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" stroke="var(--color-danger)" stroke-width="1" stroke-dasharray="3 3" opacity=".8"/>`;
    marks += `<circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="3.6" fill="var(--color-danger)" stroke="var(--color-bg)" stroke-width="1.4"/>`;
    marks += `<text x="${(bx + 6).toFixed(1)}" y="${(by - 8).toFixed(1)}" font-size="9.5" fill="var(--color-danger)">保本货量 ${regKg(M.zBreak)}</text>`;
  }
  /* 计划点 */
  if (inRange(M.d)) {
    const px = sx(Math.min(M.Z, zMax)), py = sy(M.d);
    marks += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4" fill="${
      M.now >= 0 ? "var(--color-success)" : "var(--color-danger)"
    }" stroke="var(--color-bg)" stroke-width="1.5"/>` +
      `<text x="${(px + 8).toFixed(1)}" y="${(py + 15).toFixed(1)}" font-size="9.5" fill="var(--color-text-secondary)">计划 ${regKg(M.Z)} · ${regPct(M.d)}</text>`;
  }

  $("#reg-chart").innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" role="img">
      ${gridY
        .map(
          (v) => `<line x1="${padL}" y1="${sy(v).toFixed(1)}" x2="${w - padR}" y2="${sy(v).toFixed(1)}" stroke="var(--color-border-soft)" opacity=".5"/>
        <text x="${padL - 6}" y="${(sy(v) + 3).toFixed(1)}" font-size="9" fill="var(--color-text-tertiary)" text-anchor="end">${(v * 100).toFixed(0)}%</text>
        <text x="${w - padR + 6}" y="${(sy(v) + 3).toFixed(1)}" font-size="9" fill="var(--color-text-tertiary)">${(v * M.P0).toFixed(2)}</text>`
        )
        .join("")}
      <line x1="${padL}" y1="${h - padB}" x2="${w - padR}" y2="${h - padB}" stroke="var(--color-border)"/>
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${h - padB}" stroke="var(--color-border)"/>
      <line x1="${w - padR}" y1="${padT}" x2="${w - padR}" y2="${h - padB}" stroke="var(--color-border-soft)"/>
      ${marks}
      ${gridX
        .map(
          (z) =>
            `<text x="${sx(z).toFixed(1)}" y="${h - padB + 13}" font-size="9" fill="var(--color-text-tertiary)" text-anchor="middle">${regShort(z)}</text>`
        )
        .join("")}
      <text x="${w - padR - 2}" y="${h - 4}" font-size="9" fill="var(--color-text-tertiary)" text-anchor="end">承诺货量（kg）→　左轴：折扣　右轴：现价（元/kg）</text>
    </svg>`;

  if ($("#reg-pol-note")) {
    let note = "";
    if (M.zBreak !== null) {
      note = `现价 ${M.P.toFixed(4)} 低于成本 ${M.C.toFixed(4)}（每公斤亏 ${Math.abs(M.m).toFixed(4)}），B ${regMoney(
        M.B
      )} 最多只能兜住 ${regKg(M.zBreak)}；要做到 ${regKg(M.Z)}，折扣至少 ${regPct(M.dMin)} 或杂费至少 ${regMoney(M.bMin)}`;
    } else if (M.m >= 0) {
      note = `现价 ${M.P.toFixed(4)} 高于成本 ${M.C.toFixed(4)}（每公斤赚 ${M.m.toFixed(4)}）：计划货量已经在保本线上方，货量越大利润越高`;
    } else {
      note = "现价低于成本且杂费为 0：没有任何兜底，任何货量都亏";
    }
    $("#reg-pol-note").textContent = note;
  }
}

/**
 * 图 2：承诺货量 → 利润（左轴 元）与利润率（右轴 %）
 *   L(Z) = (P − C) × Z + B（直线，斜率 m）
 *   r(Z) = L ÷ (P × Z + B)（B 越大、小货量时利润率越高，随货量下降趋向 m ÷ P）
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
  const lVals = [lAt(0), lAt(zMax), 0];
  let yMin = Math.min(...lVals);
  let yMax = Math.max(...lVals);
  const lpad = Math.max(1, (yMax - yMin) * 0.1);
  yMin -= lpad;
  yMax += lpad;

  const rStart = M.B > 0 ? 1 : M.rateNoB;
  const rEnd = rAt(zMax);
  const rVals = [rStart, rEnd, 0].filter((v) => Number.isFinite(v));
  let rMin = Math.min(...rVals);
  let rMax = Math.max(...rVals);
  const rpad = Math.max(0.02, (rMax - rMin) * 0.1);
  rMin -= rpad;
  rMax += rpad;

  const sx = (z) => padL + (z / zMax) * (w - padL - padR);
  const syL = (v) => h - padB - ((v - yMin) / (yMax - yMin || 1)) * (h - padB - padT);
  const syR = (v) => h - padB - ((v - rMin) / (rMax - rMin || 1)) * (h - padB - padT);
  const grid = [0, 0.25, 0.5, 0.75, 1].map((t) => t);

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
  const marks =
    `<path d="${l0Path}" fill="none" stroke="var(--color-text-tertiary)" stroke-width="1.2" stroke-dasharray="5 4" opacity=".85"></path>` +
    `<path d="${lPath}" fill="none" stroke="var(--color-primary)" stroke-width="2.2"></path>` +
    `<path d="${rPath}" fill="none" stroke="var(--color-warning)" stroke-width="1.8" stroke-dasharray="6 3"></path>` +
    `<circle cx="${planX.toFixed(1)}" cy="${planY.toFixed(1)}" r="4" fill="var(--color-primary)" stroke="var(--color-bg)" stroke-width="1.5"/>` +
    `<text x="${(planX + 7).toFixed(1)}" y="${(planY - 8).toFixed(1)}" font-size="9.5" fill="var(--color-text-secondary)">计划 ${regKg(
      M.Z
    )} · ${regMoney(M.now)}</text>`;

  $("#reg-chart2").innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" role="img">
      ${grid
        .map((t) => {
          const lv = yMin + (yMax - yMin) * t;
          const rv = rMin + (rMax - rMin) * t;
          return `<line x1="${padL}" y1="${syL(lv).toFixed(1)}" x2="${w - padR}" y2="${syL(lv).toFixed(1)}" stroke="var(--color-border-soft)" opacity=".5"/>
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
      <text x="${padL}" y="${h - 16}" font-size="8.5" fill="var(--color-primary)">实线 = 利润（元，左轴）</text>
      <text x="${padL + 96}" y="${h - 16}" font-size="8.5" fill="var(--color-warning)">虚线 = 利润率（%，右轴）</text>
      <text x="${padL}" y="${h - 4}" font-size="8.5" fill="var(--color-text-tertiary)">灰虚线 = 同折扣但不收 B 的利润（整体下移 ${regMoney(
        M.B
      )}）；货量越大，利润率趋向 ${regPct(M.rateNoB, 2)}</text>
    </svg>`;
}

