/**
 * 唯一一张图：货量 – 利润
 *   ① 当前政策线   L = m·Z + B当前       （灰虚线，用网点当前数据）
 *   ② 调整后政策线 L = m调·Z + B         （蓝实线，m调 = P0·d计划 − C）
 *   ③ 水平基准盈利参考线 L = 0
 *   ④ 竖直参考线 = 计划承诺货量 Z
 *   利润 / 利润率只作为交点标注，不单独占坐标轴。
 */
function regDrawTrendLines(M) {
  const w = 640, h = 320, padL = 66, padR = 108, padT = 18, padB = 46;
  const xMax = Math.max(M.Z, M.Znow, 1000) * 1.25;
  const lineNow = M.lineNow;
  const linePlan = M.profit;

  const vals = [0, lineNow(0), lineNow(xMax), linePlan(0), linePlan(xMax)].filter((v) => Number.isFinite(v));
  let yMin = Math.min(...vals);
  let yMax = Math.max(...vals);
  const ypad = Math.max(1, (yMax - yMin) * 0.12);
  yMin -= ypad;
  yMax += ypad;

  const sx = (z) => padL + (z / xMax) * (w - padL - padR);
  const sy = (v) => h - padB - ((v - yMin) / (yMax - yMin || 1)) * (h - padB - padT);
  const clampV = (v) => Math.max(yMin, Math.min(yMax, v));

  const gridY = [0, 0.25, 0.5, 0.75, 1].map((t) => yMin + (yMax - yMin) * t);
  const gridX = [0, 0.25, 0.5, 0.75, 1].map((t) => xMax * t);

  const nowPath = `M${sx(0).toFixed(1)},${sy(clampV(lineNow(0))).toFixed(1)} L${sx(xMax).toFixed(1)},${sy(
    clampV(lineNow(xMax))
  ).toFixed(1)}`;
  const planPath = `M${sx(0).toFixed(1)},${sy(clampV(linePlan(0))).toFixed(1)} L${sx(xMax).toFixed(1)},${sy(
    clampV(linePlan(xMax))
  ).toFixed(1)}`;

  let marks = "";
  /* 零线 */
  if (0 >= yMin && 0 <= yMax) {
    marks += `<line x1="${padL}" y1="${sy(0).toFixed(1)}" x2="${w - padR}" y2="${sy(0).toFixed(1)}" stroke="var(--color-danger)" stroke-width="1.4" stroke-dasharray="6 4"/>`;
    marks += `<text x="${w - padR - 4}" y="${(sy(0) - 6).toFixed(1)}" font-size="9" fill="var(--color-danger)" text-anchor="end">基准盈利参考线（利润 0）</text>`;
  }
  /* 计划承诺货量竖线 */
  if (M.Z > 0 && M.Z <= xMax) {
    const xZ = sx(M.Z);
    marks += `<line x1="${xZ.toFixed(1)}" y1="${padT}" x2="${xZ.toFixed(1)}" y2="${h - padB}" stroke="var(--color-text-secondary)" stroke-width="1.2" stroke-dasharray="5 4" opacity=".85"/>`;
    marks += `<text x="${(xZ + 5).toFixed(1)}" y="${padT + 11}" font-size="9" fill="var(--color-text-secondary)">计划承诺货量 ${regKg(
      M.Z
    )}</text>`;
  }
  marks += `<path d="${nowPath}" fill="none" stroke="var(--color-text-tertiary)" stroke-width="1.8" stroke-dasharray="7 4"/>`;
  marks += `<path d="${planPath}" fill="none" stroke="var(--color-primary)" stroke-width="2.4" stroke-linejoin="round"/>`;

  /* 交点标注：竖线 × 两条线 */
  const annotate = (z, v, rate, label, color, dy) => {
    if (!Number.isFinite(v) || !(z > 0) || z > xMax) return "";
    let s = `<circle cx="${sx(z).toFixed(1)}" cy="${sy(clampV(v)).toFixed(1)}" r="3.8" fill="${color}" stroke="var(--color-bg)" stroke-width="1.4"/>`;
    s += `<text x="${(sx(z) + 9).toFixed(1)}" y="${(sy(clampV(v)) + dy).toFixed(1)}" font-size="9.5" fill="${color}">${label} ${regMoney(
      v
    )}　利润率 ${regPct(rate, 2)}</text>`;
    return s;
  };
  marks += annotate(M.Z, M.profit(M.Z), M.rate, "调整后", "var(--color-primary)", -8);
  marks += annotate(M.Z, M.lineNow(M.Z), (M.lineNow(M.Z) / (M.P * M.Z + M.Bnow)) || 0, "保持当前", "var(--color-text-secondary)", 16);
  /* 起点（网点当前货量、当前政策下） */
  if (M.Znow > 0 && M.Znow <= xMax) {
    const x0 = sx(M.Znow);
    marks += `<circle cx="${x0.toFixed(1)}" cy="${sy(clampV(M.profitNow)).toFixed(1)}" r="3.4" fill="var(--color-success)" stroke="var(--color-bg)" stroke-width="1.4"/>`;
    marks += `<text x="${(x0 + 7).toFixed(1)}" y="${(sy(clampV(M.profitNow)) + 15).toFixed(1)}" font-size="9" fill="var(--color-success)">起点 ${regMoney(
      M.profitNow
    )}</text>`;
  }

  $("#reg-chart").innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" role="img">
      ${gridY
        .map(
          (v) => `<line x1="${padL}" y1="${sy(v).toFixed(1)}" x2="${w - padR}" y2="${sy(v).toFixed(1)}" stroke="var(--color-border-soft)" opacity=".45"/>
        <text x="${padL - 6}" y="${(sy(v) + 3).toFixed(1)}" font-size="9" fill="var(--color-text-tertiary)" text-anchor="end">${regShort(v)}</text>`
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
      <text x="${padL}" y="${h - 14}" font-size="8.5" fill="var(--color-text-tertiary)">灰虚线 = 保持当前政策（现值 ${M.P.toFixed(4)}）</text>
      <text x="${padL + 150}" y="${h - 14}" font-size="8.5" fill="var(--color-primary)">蓝实线 = 调整后政策（计划折扣 ${regPct(
        M.dPlan
      )}，现价 ${Number.isFinite(M.Pplan) ? M.Pplan.toFixed(4) : "—"}）</text>
      <text x="${w - padR}" y="${h - 6}" font-size="9" fill="var(--color-text-tertiary)" text-anchor="end">货量（kg）→　利润（元）↑</text>
    </svg>`;

  if ($("#reg-pol-note")) {
    $("#reg-pol-note").textContent =
      `起点（网点货量 ${regKg(M.Znow)}、当前政策）：利润 ${regMoney(M.profitNow)}、利润率 ${regPct(M.rateNow, 2)}；` +
      `按计划政策（折扣 ${regPct(M.dPlan)}、杂费 ${regMoney(M.B)}）做到 ${regKg(M.Z)}：` +
      `利润 ${regMoney(M.profit(M.Z))}、利润率 ${regPct(M.rate, 2)}。`;
  }
}

