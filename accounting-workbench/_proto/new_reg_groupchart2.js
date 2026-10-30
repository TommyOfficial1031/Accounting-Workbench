/**
 * 表格取数：每组一对线（虚线 = 调整前，实线 = 调整后，同组同色）
 *   线从该组算出来的点开始画：调整前从（数据货量，调整前利润），调整后从（计划货量，调整后利润）；
 *   坐标范围围绕这些点，不再从 (0,0) 起画。
 */
function regDrawGroupLines(M) {
  const w = 1120, h = 380, padL = 100, padR = 26, padT = 40, padB = 66;
  const groups = M.groups || [];
  const PALETTE = [
    "var(--color-primary)", "var(--color-warning)", "var(--color-success)", "var(--color-danger)",
    "#8b5cf6", "#0ea5e9", "#ec4899", "#14b8a6"
  ];

  /* 起点：每组的（货量，利润） */
  const anchors = [];
  groups.forEach((g) => {
    if (g.z > 0) anchors.push(g.z);
    if (g.zPlan > 0) anchors.push(g.zPlan);
  });
  const aMin = anchors.length ? Math.min(...anchors) : 0;
  const aMax = anchors.length ? Math.max(...anchors) : 0;
  let xMin, xMax;
  if (aMax <= 0) {
    xMin = 0;
    xMax = 1000;
  } else if (aMax - aMin < 1e-6) {
    xMin = Math.max(0, aMin * 0.72);
    xMax = aMax * 1.28;
  } else {
    xMin = Math.max(0, aMin * 0.9);
    xMax = aMax * 1.16;
  }

  const beforeAt = (g, z) => g.mNow * z;
  const afterAt = (g, z) => g.mPlan * z;

  const ys = [0];
  groups.forEach((g) => {
    [xMin, xMax, g.z, g.zPlan].forEach((z) => {
      if (!(z > 0)) return;
      [beforeAt(g, z), afterAt(g, z)].forEach((v) => Number.isFinite(v) && ys.push(v));
    });
  });
  let yMin = Math.min(...ys);
  let yMax = Math.max(...ys);
  const ypad = Math.max(1, (yMax - yMin) * 0.15);
  yMin -= ypad;
  yMax += ypad;

  const sx = (z) => padL + ((z - xMin) / (xMax - xMin || 1)) * (w - padL - padR);
  const sy = (v) => h - padB - ((v - yMin) / (yMax - yMin || 1)) * (h - padB - padT);
  const clampV = (v) => Math.max(yMin, Math.min(yMax, v));

  /* 标签避让：躲文字也躲这一束线 */
  const placed = [];
  const slopes = [];
  groups.forEach((g) => {
    if (Number.isFinite(g.mNow)) slopes.push(g.mNow);
    if (Number.isFinite(g.mPlan)) slopes.push(g.mPlan);
  });
  const lineHit = (bx, by, bw, bh) => {
    const top = by - bh;
    for (const m of slopes) {
      for (let i = 0; i <= 8; i += 1) {
        const x = bx + (bw * i) / 8;
        const z = xMin + ((x - padL) / (w - padL - padR)) * (xMax - xMin);
        const yl = sy(clampV(m * z));
        if (yl > top - 2 && yl < by + 2) return true;
      }
    }
    return false;
  };
  const place = (x, y, text, anchor, color) => {
    let bw = 0;
    for (const ch of String(text)) bw += /[\u2E80-\u9FFF\uFF00-\uFFEF]/.test(ch) ? 11 : 6.1;
    const bh = 15;
    const bx = anchor === "end" ? x - bw : x;
    const y0 = Math.max(padT + 11, Math.min(h - padB - 2, y));
    let by = y0;
    for (let i = 0; i < 14; i += 1) {
      const hit = placed.some((b) => bx < b.x + b.w && bx + bw > b.x && by - bh < b.y && by > b.y - b.h);
      if (!hit && !lineHit(bx, by, bw, bh)) break;
      by += bh;
      if (by > h - padB - 4) by = Math.max(padT + 11, y0 - bh * (i + 1));
    }
    placed.push({ x: bx, y: by, w: bw, h: bh });
    return `<text x="${x.toFixed(1)}" y="${by.toFixed(1)}" font-size="11" fill="${color}" text-anchor="${anchor}" stroke="var(--color-bg)" stroke-width="3.5" stroke-linejoin="round" paint-order="stroke">${text}</text>`;
  };

  let marks = "";
  groups.forEach((g, i) => {
    const color = PALETTE[i % PALETTE.length];
    const zA = g.z > 0 ? g.z : xMin;
    const zB = g.zPlan > 0 ? g.zPlan : xMax;
    /* 调整前：从（数据货量，调整前利润）向右延伸（虚线） */
    marks += `<path d="M${sx(zA).toFixed(1)},${sy(clampV(beforeAt(g, zA))).toFixed(1)} L${sx(xMax).toFixed(1)},${sy(
      clampV(beforeAt(g, xMax))
    ).toFixed(1)}" fill="none" stroke="${color}" stroke-width="1.6" stroke-dasharray="7 4" opacity=".9"/>`;
    /* 调整后：从（计划货量，调整后利润）向右延伸（实线） */
    marks += `<path d="M${sx(zB).toFixed(1)},${sy(clampV(afterAt(g, zB))).toFixed(1)} L${sx(xMax).toFixed(1)},${sy(
      clampV(afterAt(g, xMax))
    ).toFixed(1)}" fill="none" stroke="${color}" stroke-width="2.4"/>`;
    /* 计划货量处：两根线之间的短竖线 + 实线上的点 */
    const xZ = sx(zB);
    const yA = sy(clampV(beforeAt(g, zB)));
    const yB = sy(clampV(afterAt(g, zB)));
    marks += `<line x1="${xZ.toFixed(1)}" y1="${Math.min(yA, yB).toFixed(1)}" x2="${xZ.toFixed(1)}" y2="${Math.max(
      yA,
      yB
    ).toFixed(1)}" stroke="${color}" stroke-width="1.2" stroke-dasharray="3 3" opacity=".9"/>`;
    marks += `<circle cx="${xZ.toFixed(1)}" cy="${yB.toFixed(1)}" r="3.6" fill="${color}" stroke="var(--color-bg)" stroke-width="1.4"/>`;
    marks += place(xZ + 8, yB - 8, regMoney(afterAt(g, zB)), "start", color);
  });

  $("#reg-chart").innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" role="img">
      ${[0, 0.25, 0.5, 0.75, 1]
        .map((t) => {
          const v = yMin + (yMax - yMin) * t;
          return `<line x1="${padL}" y1="${sy(v).toFixed(1)}" x2="${w - padR}" y2="${sy(v).toFixed(1)}" stroke="var(--color-border-soft)" opacity=".45"/>
        <text x="${(padL - 8).toFixed(1)}" y="${(sy(v) + 4).toFixed(1)}" font-size="11" fill="var(--color-text-tertiary)" text-anchor="end">${regInt(v)}</text>`;
        })
        .join("")}
      <line x1="${padL}" y1="${sy(0).toFixed(1)}" x2="${w - padR}" y2="${sy(0).toFixed(1)}" stroke="var(--color-border)" stroke-width="1.2"/>
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${h - padB}" stroke="var(--color-border)"/>
      ${marks}
      ${[0, 0.25, 0.5, 0.75, 1]
        .map((t, i) => {
          const v = Math.round(xMin + (xMax - xMin) * t);
          const anchor = i === 0 ? "start" : i === 4 ? "end" : "middle";
          return `<text x="${sx(v).toFixed(1)}" y="${(h - padB + 17).toFixed(1)}" font-size="11" fill="var(--color-text-tertiary)" text-anchor="${anchor}">${regInt(
            v
          )}</text>`;
        })
        .join("")}
      <text x="${(padL + (w - padL - padR) / 2).toFixed(1)}" y="${(h - 16).toFixed(1)}" font-size="11.5" fill="var(--color-text-secondary)" text-anchor="middle">货量（kg）</text>
      <text x="24" y="${((h - padB + padT) / 2).toFixed(1)}" font-size="11.5" fill="var(--color-text-secondary)" text-anchor="middle" transform="rotate(-90 24 ${(
        (h - padB + padT) /
        2
      ).toFixed(1)})">利润（元）</text>
    </svg>`;

  const legend = $("#reg-pol-note");
  if (legend) {
    legend.innerHTML = groups
      .map(
        (g, i) =>
          `<span style="color:${PALETTE[i % PALETTE.length]}"><i></i><b>${g.label}</b>　调整前利润 ${regMoney(
            g.profitNow
          )}（利润率 ${regPct(g.rateNow, 2)}），调整后利润 ${regMoney(g.profitPlan)}（利润率 ${regPct(g.ratePlan, 2)}）</span>`
      )
      .join("");
  }
}
