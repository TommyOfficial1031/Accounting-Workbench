/**
 * 唯一一张图：货量 – 利润
 *   灰实线 = 调整前（网点当前政策 + 当前杂费）
 *   蓝实线 = 调整后（计划折扣 + 计划杂费）
 *   水平红线 = 基准盈利参考线 L = 0；竖虚线 = 计划承诺货量
 *   所有货量/金额都用千分位数字，不用“万”；文字分区摆放，不重叠。
 */
function regDrawTrendLines(M) {
  const w = 1120, h = 380, padL = 92, padR = 26, padT = 36, padB = 66;
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
  const tickX = (t) => Math.round(xMax * t);
  const tickY = (t) => yMin + (yMax - yMin) * t;

  let marks = "";
  /* 零线 + 标签（放到左侧，避免与竖线标签撞） */
  if (0 >= yMin && 0 <= yMax) {
    const y0 = sy(0);
    marks += `<line x1="${padL}" y1="${y0.toFixed(1)}" x2="${w - padR}" y2="${y0.toFixed(1)}" stroke="var(--color-danger)" stroke-width="1.4" stroke-dasharray="6 4"/>`;
    const above = y0 - padT > 26;
    marks += `<text x="${padL + 6}" y="${(above ? y0 - 8 : y0 + 15).toFixed(1)}" font-size="11" fill="var(--color-danger)">基准盈利参考线（利润 0）</text>`;
  }
  /* 计划承诺货量竖线 */
  if (M.Z > 0 && M.Z <= xMax) {
    const xZ = sx(M.Z);
    marks += `<line x1="${xZ.toFixed(1)}" y1="${padT}" x2="${xZ.toFixed(1)}" y2="${h - padB}" stroke="var(--color-text-secondary)" stroke-width="1.3" stroke-dasharray="5 4" opacity=".85"/>`;
    const leftHalf = xZ < padL + (w - padL - padR) * 0.55;
    marks += `<text x="${(xZ + (leftHalf ? 7 : -7)).toFixed(1)}" y="${padT - 10}" font-size="11" fill="var(--color-text-secondary)" text-anchor="${
      leftHalf ? "start" : "end"
    }">计划承诺货量 ${regInt(M.Z)} kg</text>`;
  }
  /* 两条线：灰实线（调整前）、蓝实线（调整后） */
  marks += `<path d="M${sx(0).toFixed(1)},${sy(clampV(lineNow(0))).toFixed(1)} L${sx(xMax).toFixed(1)},${sy(
    clampV(lineNow(xMax))
  ).toFixed(1)}" fill="none" stroke="var(--color-text-secondary)" stroke-width="2"/>`;
  marks += `<path d="M${sx(0).toFixed(1)},${sy(clampV(linePlan(0))).toFixed(1)} L${sx(xMax).toFixed(1)},${sy(
    clampV(linePlan(xMax))
  ).toFixed(1)}" fill="none" stroke="var(--color-primary)" stroke-width="2.4"/>`;

  /* 竖线上的两个交点标注：一个在上、一个在下，靠得太近时拉开 */
  const yAfter = sy(clampV(M.profit(M.Z)));
  const yBefore = sy(clampV(M.lineNow(M.Z)));
  const crowded = Math.abs(yAfter - yBefore) < 28;
  const anchorEnd = sx(M.Z) > padL + (w - padL - padR) * 0.68;
  const label = (y, text, color, dy) =>
    `<text x="${(sx(M.Z) + (anchorEnd ? -10 : 10)).toFixed(1)}" y="${(y + dy).toFixed(1)}" font-size="11.5" fill="${color}" text-anchor="${
      anchorEnd ? "end" : "start"
    }">${text}</text>`;
  if (M.Z > 0 && M.Z <= xMax) {
    marks += `<circle cx="${sx(M.Z).toFixed(1)}" cy="${yAfter.toFixed(1)}" r="4" fill="var(--color-primary)" stroke="var(--color-bg)" stroke-width="1.5"/>`;
    marks += label(yAfter, `调整后 ${regMoney(M.profit(M.Z))}（利润率 ${regPct(M.rate, 2)}）`, "var(--color-primary)", crowded ? -30 : -11);
    marks += `<circle cx="${sx(M.Z).toFixed(1)}" cy="${yBefore.toFixed(1)}" r="4" fill="var(--color-text-secondary)" stroke="var(--color-bg)" stroke-width="1.5"/>`;
    marks += label(
      yBefore,
      `调整前 ${regMoney(M.lineNow(M.Z))}（利润率 ${regPct((M.lineNow(M.Z) / (M.P * M.Z + M.Bnow)) || 0, 2)}）`,
      "var(--color-text-secondary)",
      crowded ? 34 : 18
    );
  }
  /* 起点（与计划点不同才画） */
  if (M.Znow > 0 && M.Znow <= xMax && Math.abs(M.Znow - M.Z) > 1) {
    marks += `<circle cx="${sx(M.Znow).toFixed(1)}" cy="${sy(clampV(M.profitNow)).toFixed(1)}" r="4" fill="var(--color-success)" stroke="var(--color-bg)" stroke-width="1.5"/>`;
    marks += `<text x="${(sx(M.Znow) + 8).toFixed(1)}" y="${(sy(clampV(M.profitNow)) + 17).toFixed(1)}" font-size="11" fill="var(--color-success)">起点 ${regMoney(
      M.profitNow
    )}</text>`;
  }

  $("#reg-chart").innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" role="img">
      ${[0, 0.25, 0.5, 0.75, 1]
        .map((t) => {
          const v = tickY(t);
          const y = sy(v);
          return `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${w - padR}" y2="${y.toFixed(1)}" stroke="var(--color-border-soft)" opacity=".45"/>
        <text x="${(padL - 8).toFixed(1)}" y="${(y + 4).toFixed(1)}" font-size="11" fill="var(--color-text-tertiary)" text-anchor="end">${regInt(v)}</text>`;
        })
        .join("")}
      <line x1="${padL}" y1="${h - padB}" x2="${w - padR}" y2="${h - padB}" stroke="var(--color-border)"/>
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${h - padB}" stroke="var(--color-border)"/>
      ${marks}
      ${[0, 0.25, 0.5, 0.75, 1]
        .map((t, i) => {
          const v = tickX(t);
          const x = sx(v);
          const anchor = i === 0 ? "start" : i === 4 ? "end" : "middle";
          return `<text x="${x.toFixed(1)}" y="${(h - padB + 17).toFixed(1)}" font-size="11" fill="var(--color-text-tertiary)" text-anchor="${anchor}">${regInt(
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

  if ($("#reg-pol-note")) {
    $("#reg-pol-note").innerHTML =
      `<span style="color:var(--color-text-secondary)"><i></i>调整前：现价 ${M.P.toFixed(4)} · 当前杂费 ${regInt(
        M.Bnow
      )} · 货量 ${regInt(M.Znow)} kg</span>` +
      `<span style="color:var(--color-primary)"><i></i>调整后：折扣 ${regPct(M.dPlan)} · 现价 ${Number.isFinite(M.Pplan) ? M.Pplan.toFixed(4) : "—"} · 杂费 ${regInt(
        M.B
      )} · 货量 ${regInt(M.Z)} kg</span>`;
  }
}

