/**
 * 表格取数：每组一对线（虚线 = 调整前，实线 = 调整后，同组同色）
 *   每组在自己的「计划承诺货量」处画一段短竖线（连接两根线）+ 实线上的利润点。
 */
function regDrawGroupLines(M) {
  const w = 1120, h = 380, padL = 100, padR = 26, padT = 40, padB = 66;
  const groups = M.groups || [];
  const xMax = Math.max(1000, ...groups.map((g) => Math.max(g.z, g.zPlan, 0))) * 1.25;
  const PALETTE = [
    "var(--color-primary)", "var(--color-warning)", "var(--color-success)", "var(--color-danger)",
    "#8b5cf6", "#0ea5e9", "#ec4899", "#14b8a6"
  ];

  const ys = [];
  groups.forEach((g) => {
    [g.mNow * 0, g.mNow * xMax, g.mPlan * 0, g.mPlan * xMax].forEach((v) => Number.isFinite(v) && ys.push(v));
  });
  ys.push(0);
  let yMin = Math.min(...ys);
  let yMax = Math.max(...ys);
  const ypad = Math.max(1, (yMax - yMin) * 0.12);
  yMin -= ypad;
  yMax += ypad;

  const sx = (z) => padL + (z / xMax) * (w - padL - padR);
  const sy = (v) => h - padB - ((v - yMin) / (yMax - yMin || 1)) * (h - padB - padT);
  const clampV = (v) => Math.max(yMin, Math.min(yMax, v));

  /* 简易避让：只标签数值，数量 = 组数 */
  const placed = [];
  const place = (x, y, text, anchor, color) => {
    let bw = 0;
    for (const ch of String(text)) bw += /[\u2E80-\u9FFF\uFF00-\uFFEF]/.test(ch) ? 11 : 6.1;
    const bh = 15;
    const bx = anchor === "end" ? x - bw : x;
    let by = Math.max(padT + 11, Math.min(h - padB - 2, y));
    for (let i = 0; i < 12; i += 1) {
      const hit = placed.some((b) => bx < b.x + b.w && bx + bw > b.x && by - bh < b.y && by > b.y - b.h);
      if (!hit) break;
      by += bh;
      if (by > h - padB - 4) by = padT + 11 + (i % 3) * bh;
    }
    placed.push({ x: bx, y: by, w: bw, h: bh });
    return `<text x="${x.toFixed(1)}" y="${by.toFixed(1)}" font-size="11" fill="${color}" text-anchor="${anchor}" stroke="var(--color-bg)" stroke-width="3.5" stroke-linejoin="round" paint-order="stroke">${text}</text>`;
  };

  let marks = "";
  groups.forEach((g, i) => {
    const color = PALETTE[i % PALETTE.length];
    /* 调整前：虚线；调整后：实线 */
    marks += `<path d="M${sx(0).toFixed(1)},${sy(clampV(0)).toFixed(1)} L${sx(xMax).toFixed(1)},${sy(
      clampV(g.mNow * xMax)
    ).toFixed(1)}" fill="none" stroke="${color}" stroke-width="1.6" stroke-dasharray="7 4" opacity=".85"/>`;
    marks += `<path d="M${sx(0).toFixed(1)},${sy(clampV(0)).toFixed(1)} L${sx(xMax).toFixed(1)},${sy(
      clampV(g.mPlan * xMax)
    ).toFixed(1)}" fill="none" stroke="${color}" stroke-width="2.4"/>`;
    /* 计划承诺货量：短竖线 + 实线上的点 */
    if (g.zPlan > 0 && g.zPlan <= xMax) {
      const x1 = sx(g.zPlan);
      const yA = sy(clampV(g.mNow * g.zPlan));
      const yB = sy(clampV(g.mPlan * g.zPlan));
      marks += `<line x1="${x1.toFixed(1)}" y1="${Math.min(yA, yB).toFixed(1)}" x2="${x1.toFixed(1)}" y2="${Math.max(
        yA,
        yB
      ).toFixed(1)}" stroke="${color}" stroke-width="1.2" stroke-dasharray="3 3" opacity=".9"/>`;
      marks += `<circle cx="${x1.toFixed(1)}" cy="${yB.toFixed(1)}" r="3.6" fill="${color}" stroke="var(--color-bg)" stroke-width="1.4"/>`;
      marks += place(x1 + 8, yB - 8, regMoney(g.mPlan * g.zPlan), "start", color);
    }
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
      <line x1="${padL}" y1="${sy(clampV(0)).toFixed(1)}" x2="${w - padR}" y2="${sy(clampV(0)).toFixed(1)}" stroke="var(--color-border)" stroke-width="1.2"/>
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${h - padB}" stroke="var(--color-border)"/>
      ${marks}
      ${[0, 0.25, 0.5, 0.75, 1]
        .map((t, i) => {
          const v = Math.round(xMax * t);
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
          `<span style="color:${PALETTE[i % PALETTE.length]}"><i></i><b>${g.label}</b>　P0 ${Number.isFinite(g.P0) ? g.P0.toFixed(4) : "—"} · P ${
            Number.isFinite(g.P) ? g.P.toFixed(4) : "—"
          } · C ${g.C.toFixed(4)} · 计划 ${regPct(g.dPlan)} / ${regInt(g.zPlan)} kg → ${regMoney(g.profitPlan)}（利润率 ${regPct(
            g.ratePlan,
            2
          )}）</span>`
      )
      .join("");
  }
}
