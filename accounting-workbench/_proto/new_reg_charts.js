/**
 * 议价政策在「现价 – 货量」空间里也是一条直线：
 *   P(Z) = P计划 + kP × (Z计划 − Z)，kP = (下浮百分点 ÷ 100) × P0 ÷ Z计划
 * 也就是说：折扣越深（现价越低）→ 需要的承诺货量越大。
 */
function regPolicyPrice(M) {
  const kP = ((M.polPct / 100) * M.P0) / Math.max(M.Z, 1);
  const start = M.P + kP * M.Z; // Z = 0 时的现价
  return {
    kP,
    start,
    at: (z) => start - kP * z,
    inverse: (p) => (kP > 0 ? (start - p) / kP : NaN)
  };
}

/** 图 1：现价 – 货量（折价换量的曲线 + 成本基准线 + 基准点） */
function regDrawPrice(M) {
  const w = 520, h = 300, padL = 52, padR = 16, padT = 16, padB = 36;
  const pol = regPolicyPrice(M);
  const hasPolicy = M.polOn && pol.kP > 0;
  const cross = hasPolicy ? regPolicyCross(M) : null;
  const zMax = Math.max(M.Z * 1.5, cross !== null ? cross * 1.3 : 0, 1000);

  const prices = [M.P0, M.C, M.P, hasPolicy ? pol.start : NaN, hasPolicy ? pol.at(zMax) : NaN].filter(
    (v) => Number.isFinite(v)
  );
  let yMin = Math.max(0, Math.min(...prices) - 0.04);
  let yMax = Math.max(...prices) + 0.04;
  if (!(yMax > yMin)) yMax = yMin + 0.1;
  const sx = (z) => padL + (z / zMax) * (w - padL - padR);
  const sy = (p) => h - padB - ((p - yMin) / (yMax - yMin)) * (h - padB - padT);
  const clampP = (p) => Math.max(yMin, Math.min(yMax, p));
  const inRange = (p) => p >= yMin && p <= yMax;

  const gridY = [0, 0.25, 0.5, 0.75, 1].map((t) => ({ p: yMin + (yMax - yMin) * t }));
  const gridX = [0, 0.25, 0.5, 0.75, 1].map((t) => zMax * t);

  let marks = "";
  // 原价 P0：折扣的参照线
  if (inRange(M.P0)) {
    const y0 = sy(M.P0);
    marks += `<line x1="${padL}" y1="${y0.toFixed(1)}" x2="${w - padR}" y2="${y0.toFixed(1)}" stroke="var(--color-border)" stroke-width="1" stroke-dasharray="3 4"/>` +
      `<text x="${padL + 4}" y="${(y0 - 5).toFixed(1)}" font-size="9" fill="var(--color-text-tertiary)">原价 P0 ${M.P0.toFixed(4)}</text>`;
  }
  // 成本基准线 P = C：m = 0 的分界
  if (inRange(M.C)) {
    const yC = sy(M.C);
    marks += `<line x1="${padL}" y1="${yC.toFixed(1)}" x2="${w - padR}" y2="${yC.toFixed(1)}" stroke="var(--color-danger)" stroke-width="1.6" stroke-dasharray="6 4"/>` +
      `<text x="${w - padR - 2}" y="${(yC - 6).toFixed(1)}" font-size="9.5" fill="var(--color-danger)" text-anchor="end">中心成本 C ${M.C.toFixed(4)}</text>`;
  }
  // 政策线：折价换量
  if (hasPolicy) {
    const pts = [];
    for (let i = 0; i <= 120; i += 1) {
      const z = (zMax * i) / 120;
      const p = pol.at(z);
      if (Number.isFinite(p)) pts.push([z, clampP(p)]);
    }
    if (pts.length > 1) {
      const path = pts.map(([z, p], i) => `${i === 0 ? "M" : "L"}${sx(z).toFixed(1)},${sy(p).toFixed(1)}`).join(" ");
      marks += `<path d="${path}" fill="none" stroke="var(--color-primary)" stroke-width="2.2" stroke-linejoin="round"/>`;
      marks += `<text x="${(w - padR - 2).toFixed(1)}" y="${(sy(clampP(pol.at(zMax))) - 8).toFixed(1)}" font-size="9" fill="var(--color-primary)" text-anchor="end">议价曲线（折价 → 加量）</text>`;
    }
  }
  // 基准点：政策线 × 成本线
  if (cross !== null && cross <= zMax && inRange(M.C)) {
    const cx = sx(cross);
    const cy = sy(M.C);
    marks += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="4" fill="var(--color-danger)" stroke="var(--color-bg)" stroke-width="1.6"/>` +
      `<text x="${cx.toFixed(1)}" y="${(cy - 8).toFixed(1)}" font-size="9.5" fill="var(--color-danger)" text-anchor="middle">基准点 ${regKg(cross)}</text>`;
    // 基准点之后 m < 0
    marks += `<rect x="${cx.toFixed(1)}" y="${padT}" width="${Math.max(0, w - padR - cx).toFixed(1)}" height="${(h - padB - padT).toFixed(1)}" fill="var(--color-danger)" opacity=".05"/>` +
      `<text x="${(w - padR - 4).toFixed(1)}" y="${(padT + 12).toFixed(1)}" font-size="9" fill="var(--color-danger)" text-anchor="end">m &lt; 0</text>`;
  }
  // 计划点
  if (Number.isFinite(M.P)) {
    const px = sx(Math.min(M.Z, zMax));
    const py = sy(clampP(M.P));
    marks += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3.6" fill="${
      M.m >= 0 ? "var(--color-success)" : "var(--color-danger)"
    }" stroke="var(--color-bg)" stroke-width="1.4"/>` +
      `<text x="${(px + 6).toFixed(1)}" y="${(py + 14).toFixed(1)}" font-size="9.5" fill="var(--color-text-secondary)">计划 ${regKg(M.Z)} · ${M.P.toFixed(4)}</text>`;
  }

  $("#reg-chart").innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" role="img">
      ${gridY
        .map(
          (g) => `<line x1="${padL}" y1="${sy(g.p).toFixed(1)}" x2="${w - padR}" y2="${sy(g.p).toFixed(1)}" stroke="var(--color-border-soft)" opacity=".55"/>
        <text x="${padL - 6}" y="${(sy(g.p) + 3).toFixed(1)}" font-size="9" fill="var(--color-text-tertiary)" text-anchor="end">${g.p.toFixed(2)}</text>`
        )
        .join("")}
      <line x1="${padL}" y1="${h - padB}" x2="${w - padR}" y2="${h - padB}" stroke="var(--color-border)"/>
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${h - padB}" stroke="var(--color-border)"/>
      ${marks}
      ${gridX
        .map(
          (z) =>
            `<text x="${sx(z).toFixed(1)}" y="${h - padB + 13}" font-size="9" fill="var(--color-text-tertiary)" text-anchor="middle">${regShort(z)}</text>`
        )
        .join("")}
      <text x="${w - padR}" y="${h - 4}" font-size="9" fill="var(--color-text-tertiary)" text-anchor="end">货量（kg）→　现价（元/kg）↑</text>
    </svg>`;

  if ($("#reg-pol-note")) {
    let note = "";
    if (!hasPolicy) {
      note = "议价曲线未开启（或下浮百分点为 0）：改回「叠加」并给一个正的百分点即可看到折价换量的曲线";
    } else if (cross !== null) {
      note = `政策线过（${regKg(M.Z)}，${M.P.toFixed(4)}），每翻倍下浮 ${M.polPct} 个百分点；与成本线交于基准点 ${regKg(
        cross
      )}——超过这个量，现价已经低于成本（m &lt; 0）`;
    } else if (M.P >= M.C) {
      note = `政策线起点就低于成本线（现价 ${M.P.toFixed(4)} &lt; 成本 ${M.C.toFixed(4)}），任何货量都是亏本价`;
    } else {
      note = "政策线全程高于成本线：折价换量在这个区间里仍然安全";
    }
    $("#reg-pol-note").innerHTML = note;
  }
}

/** 图 2：沿议价曲线的利润散点（每个现价点按 0.001 元/kg 采样） */
function regDrawScatter(M) {
  const w = 460, h = 300, padL = 56, padR = 16, padT = 16, padB = 44;
  const pol = regPolicyPrice(M);
  const hasPolicy = M.polOn && pol.kP > 0;
  const cross = hasPolicy ? regPolicyCross(M) : null;
  const zMax = Math.max(M.Z * 2, cross !== null ? cross * 1.3 : 0, 1000);

  // 按现价每 0.001 元/kg 采样：没有政策线时退化为「固定现价」的直线预测
  const dots = [];
  if (hasPolicy) {
    for (let p = 0; p <= M.P0 + 1e-9; p = Number((p + 0.001).toFixed(3))) {
      const z = pol.inverse(p);
      if (!Number.isFinite(z) || z < 0 || z > zMax) continue;
      dots.push({ p, z, l: (p - M.C) * z + M.B, base: (p - M.C) * z });
    }
  } else {
    for (let i = 0; i <= 40; i += 1) {
      const z = (zMax * i) / 40;
      dots.push({ p: M.P, z, l: (M.P - M.C) * z + M.B, base: (M.P - M.C) * z });
    }
  }

  const ys = dots.map((d) => d.l).concat(dots.map((d) => d.base), [0, M.B]);
  let yMin = Math.min(...ys, 0);
  let yMax = Math.max(...ys, 0);
  const pad = Math.max(1, (yMax - yMin) * 0.08);
  yMin -= pad;
  yMax += pad;
  const sx = (z) => padL + (z / zMax) * (w - padL - padR);
  const sy = (v) => h - padB - ((v - yMin) / (yMax - yMin || 1)) * (h - padB - padT);
  const gridY = [0, 0.25, 0.5, 0.75, 1].map((t) => yMin + (yMax - yMin) * t);
  const gridX = [0, 0.25, 0.5, 0.75, 1].map((t) => zMax * t);

  const dotSvg = dots
    .map(
      (d) =>
        `<circle cx="${sx(d.z).toFixed(1)}" cy="${sy(d.l).toFixed(1)}" r="1.8" fill="${
          d.p >= M.C ? "var(--color-success)" : "var(--color-danger)"
        }" opacity=".85"></circle>`
    )
    .join("");
  const basePath = dots
    .map((d, i) => `${i === 0 ? "M" : "L"}${sx(d.z).toFixed(1)},${sy(d.base).toFixed(1)}`)
    .join(" ");
  const planL = M.m * M.Z + M.B;
  const planX = sx(Math.min(M.Z, zMax));
  const planY = sy(planL);
  const marks =
    `<path d="${basePath}" fill="none" stroke="var(--color-text-tertiary)" stroke-width="1" stroke-dasharray="5 4" opacity=".8"></path>` +
    `<circle cx="${planX.toFixed(1)}" cy="${planY.toFixed(1)}" r="3.8" fill="var(--color-primary)" stroke="var(--color-bg)" stroke-width="1.5"/>` +
    `<text x="${(planX + 6).toFixed(1)}" y="${(planY - 7).toFixed(1)}" font-size="9.5" fill="var(--color-text-secondary)">计划 ${regKg(M.Z)} · ${regMoney(planL)}</text>`;

  $("#reg-chart2").innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" role="img">
      ${gridY
        .map(
          (v) => `<line x1="${padL}" y1="${sy(v).toFixed(1)}" x2="${w - padR}" y2="${sy(v).toFixed(1)}" stroke="var(--color-border-soft)" opacity=".55"/>
        <text x="${padL - 6}" y="${(sy(v) + 3).toFixed(1)}" font-size="9" fill="var(--color-text-tertiary)" text-anchor="end">${regShort(v)}</text>`
        )
        .join("")}
      <line x1="${padL}" y1="${sy(0).toFixed(1)}" x2="${w - padR}" y2="${sy(0).toFixed(1)}" stroke="var(--color-border)" stroke-width="1.2"/>
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${h - padB}" stroke="var(--color-border)"/>
      ${dotSvg}
      ${marks}
      ${gridX
        .map(
          (z) =>
            `<text x="${sx(z).toFixed(1)}" y="${h - padB + 13}" font-size="9" fill="var(--color-text-tertiary)" text-anchor="middle">${regShort(z)}</text>`
        )
        .join("")}
      <text x="${padL}" y="${h - 4}" font-size="8.5" fill="var(--color-text-tertiary)">利润（元）· 货量（kg）—　每个点 = (P − C) × Z + B（灰虚线 = 不含 B，整体下移 ${regMoney(
        M.B
      )}）</text>
    </svg>`;
}

