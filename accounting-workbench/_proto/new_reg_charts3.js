/**
 * 图 1：政策组合 —— 折扣 × 杂费（按当前货量）
 *   保本线：B = (C − P0·d) × Z（价差为负时，用杂费补；d ≥ C÷P0 时不需要杂费）
 *   线上方 = 盈利区，下方 = 亏损区；当前政策点与线的垂直距离 = 还差多少保本。
 */
function regDrawPolicyGrid(M) {
  const w = 520, h = 300, padL = 56, padR = 44, padT = 16, padB = 40;
  const dStar = Number.isFinite(M.dStar) ? M.dStar : 0.7;
  const dLo = Math.max(0, Math.min(M.d - 0.12, dStar - 0.06));
  const dHi = Math.min(1, Math.max(M.d + 0.18, dStar + 0.06));
  const needAt = (d) => Math.max(0, (M.C - M.P0 * d) * M.Z);
  const needLo = needAt(dLo);
  const bHi = Math.max(M.B * 1.45, needLo * 1.15, 500);

  const sx = (d) => padL + ((d - dLo) / (dHi - dLo || 1)) * (w - padL - padR);
  const sy = (b) => h - padB - (Math.max(0, Math.min(bHi, b)) / bHi) * (h - padB - padT);
  const gridX = [0, 0.25, 0.5, 0.75, 1].map((t) => dLo + (dHi - dLo) * t);
  const gridY = [0, 0.25, 0.5, 0.75, 1].map((t) => bHi * t);

  const needNow = needAt(M.d);
  /* 保本线：dLo → min(dStar,dHi) 斜线下降到 0，然后横向 */
  const kneeD = Math.max(dLo, Math.min(dStar, dHi));
  const linePts = [[dLo, needLo], [kneeD, 0]];
  if (dHi > kneeD) linePts.push([dHi, 0]);
  const linePath = linePts.map(([d, b], i) => `${i === 0 ? "M" : "L"}${sx(d).toFixed(1)},${sy(b).toFixed(1)}`).join(" ");

  const profitArea =
    `M${sx(dLo).toFixed(1)},${sy(needLo).toFixed(1)} ` +
    linePts.slice(1).map(([d, b]) => `L${sx(d).toFixed(1)},${sy(b).toFixed(1)}`).join(" ") +
    ` L${sx(dHi).toFixed(1)},${sy(bHi).toFixed(1)} L${sx(dLo).toFixed(1)},${sy(bHi).toFixed(1)} Z`;
  const lossArea =
    `M${sx(dLo).toFixed(1)},${(h - padB).toFixed(1)} L${sx(dLo).toFixed(1)},${sy(needLo).toFixed(1)} ` +
    linePts.slice(1).map(([d, b]) => `L${sx(d).toFixed(1)},${sy(b).toFixed(1)}`).join(" ") +
    ` L${sx(dHi).toFixed(1)},${(h - padB).toFixed(1)} Z`;

  let marks = "";
  marks += `<path d="${profitArea}" fill="var(--color-success)" opacity=".07"/>`;
  marks += `<path d="${lossArea}" fill="var(--color-danger)" opacity=".07"/>`;
  marks += `<path d="${linePath}" fill="none" stroke="var(--color-primary)" stroke-width="2.2"/>`;
  marks += `<text x="${(sx(kneeD) + 6).toFixed(1)}" y="${(sy(bHi * 0.12)).toFixed(1)}" font-size="9" fill="var(--color-primary)">保本线：B = (C − P0·d) × Z</text>`;
  marks += `<text x="${padL + 6}" y="${(padT + 12).toFixed(1)}" font-size="9" fill="var(--color-success)">盈利区</text>`;
  marks += `<text x="${padL + 6}" y="${(h - padB - 6).toFixed(1)}" font-size="9" fill="var(--color-danger)">亏损区（杂费不够补价差）</text>`;

  /* 折扣 ≥ C÷P0 时不用杂费 */
  if (dStar > dLo && dStar < dHi) {
    const xK = sx(dStar);
    marks += `<line x1="${xK.toFixed(1)}" y1="${padT}" x2="${xK.toFixed(1)}" y2="${h - padB}" stroke="var(--color-border)" stroke-width="1" stroke-dasharray="3 4" opacity=".8"/>`;
    marks += `<text x="${(xK + 5).toFixed(1)}" y="${(padT + 24).toFixed(1)}" font-size="8.5" fill="var(--color-text-tertiary)">折扣 ${regPct(
      dStar
    )} 以上不用杂费</text>`;
  }

  /* 当前政策点 + 缺口 */
  if (Number.isFinite(M.d)) {
    const px = sx(M.d), py = sy(M.B);
    const ny = sy(needNow);
    if (needNow > M.B) {
      marks += `<line x1="${px.toFixed(1)}" y1="${py.toFixed(1)}" x2="${px.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="var(--color-danger)" stroke-width="1.4" stroke-dasharray="4 3"/>`;
      marks += `<text x="${(px + 6).toFixed(1)}" y="${((py + ny) / 2).toFixed(1)}" font-size="9" fill="var(--color-danger)">还差 ${regMoney(
        M.feeGap
      )}</text>`;
    }
    marks += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4.2" fill="${
      M.now >= 0 ? "var(--color-success)" : "var(--color-danger)"
    }" stroke="var(--color-bg)" stroke-width="1.6"/>`;
    marks += `<text x="${(px + 8).toFixed(1)}" y="${(py - 8).toFixed(1)}" font-size="9.5" fill="var(--color-text-secondary)">当前 ${regPct(
      M.d
    )} · ${regMoney(M.B)}</text>`;
  }

  $("#reg-chart").innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" role="img">
      ${gridY
        .map(
          (b) => `<line x1="${padL}" y1="${sy(b).toFixed(1)}" x2="${w - padR}" y2="${sy(b).toFixed(1)}" stroke="var(--color-border-soft)" opacity=".45"/>
        <text x="${padL - 6}" y="${(sy(b) + 3).toFixed(1)}" font-size="9" fill="var(--color-text-tertiary)" text-anchor="end">${regShort(b)}</text>`
        )
        .join("")}
      <line x1="${padL}" y1="${h - padB}" x2="${w - padR}" y2="${h - padB}" stroke="var(--color-border)"/>
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${h - padB}" stroke="var(--color-border)"/>
      <line x1="${w - padR}" y1="${padT}" x2="${w - padR}" y2="${h - padB}" stroke="var(--color-border-soft)"/>
      ${marks}
      ${gridX
        .map(
          (d) => `<text x="${sx(d).toFixed(1)}" y="${h - padB + 13}" font-size="9" fill="var(--color-text-tertiary)" text-anchor="middle">${(
            d * 100
          ).toFixed(0)}%</text>
        <text x="${sx(d).toFixed(1)}" y="${h - padB + 25}" font-size="8.5" fill="var(--color-text-tertiary)" text-anchor="middle">${(
            d * M.P0
          ).toFixed(2)}</text>`
        )
        .join("")}
      <text x="${w - padR - 2}" y="${h - 4}" font-size="9" fill="var(--color-text-tertiary)" text-anchor="end">折扣（上）· 现价（下）→　杂费（元）↑　按 ${regKg(
        M.Z
      )}</text>
    </svg>`;

  if ($("#reg-pol-note")) {
    $("#reg-pol-note").textContent =
      `保本线：杂费 = (C − P0·d) × Z。当前 ${regPct(M.d)} / ${regMoney(M.B)} 落在${
        M.now >= 0 ? "盈利区（上方）" : "亏损区（下方）"
      }；` +
      (needNow > M.B
        ? `要保本，杂费需要 ${regMoney(needNow)}，或把折扣提到 ${regPct(M.dMin)}`
        : `已经盖住价差，多收的杂费都是净赚`);
  }
}

/**
 * 图 2：承诺货量 → 利润（左轴 元）与利润率（右轴 %）
 *   实线 = 合计利润 (P−C)×Z+B；灰虚线 = 只有价差、没有杂费 (P−C)×Z；
 *   两者之间的垂直距离恒等于 B（杂费只做平移）。
 */
function regDrawProfitRate(M) {
  const w = 460, h = 300, padL = 56, padR = 46, padT = 16, padB = 46;
  const zMax = Math.max(M.Z * 2.2, 1000);
  const lAt = (z) => M.m * z + M.B;
  const l0At = (z) => M.m * z;
  const policyAt = (z) => {
    const d = M.policy(z);
    return Number.isFinite(d) ? (d * M.P0 - M.C) * z + M.B : NaN;
  };
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
  const rpad = Math.max(0.02, (rMax - rMin) * 0.1);
  rMin -= rpad;
  rMax += rpad;

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

  let policyPath = "";
  if (M.polOn && M.polPct > 0) {
    const pPts = [];
    for (let i = 0; i <= 120; i += 1) {
      const z = (zMax * i) / 120;
      const v = policyAt(z);
      if (Number.isFinite(v)) pPts.push([z, Math.max(yMin, Math.min(yMax, v))]);
    }
    if (pPts.length > 1) {
      policyPath = pPts.map(([z, v], i) => `${i === 0 ? "M" : "L"}${sx(z).toFixed(1)},${syL(v).toFixed(1)}`).join(" ");
    }
  }

  const planX = sx(Math.min(M.Z, zMax));
  const planY = syL(M.now);
  let marks =
    `<path d="${l0Path}" fill="none" stroke="var(--color-text-tertiary)" stroke-width="1.2" stroke-dasharray="5 4" opacity=".85"></path>` +
    `<path d="${lPath}" fill="none" stroke="var(--color-primary)" stroke-width="2.2"></path>` +
    `<path d="${rPath}" fill="none" stroke="var(--color-warning)" stroke-width="1.8" stroke-dasharray="6 3"></path>`;
  if (policyPath) {
    marks += `<path d="${policyPath}" fill="none" stroke="var(--color-success)" stroke-width="1.6" stroke-dasharray="2 3" opacity=".9"></path>`;
  }
  /* 计划点上标出「杂费 B」的平移量 */
  marks += `<line x1="${planX.toFixed(1)}" y1="${syL(l0At(M.Z)).toFixed(1)}" x2="${planX.toFixed(1)}" y2="${planY.toFixed(1)}" stroke="var(--color-text-tertiary)" stroke-width="1" stroke-dasharray="3 3"/>`;
  marks += `<circle cx="${planX.toFixed(1)}" cy="${syL(l0At(M.Z)).toFixed(1)}" r="2.6" fill="var(--color-text-tertiary)"></circle>`;
  marks += `<circle cx="${planX.toFixed(1)}" cy="${planY.toFixed(1)}" r="4.2" fill="var(--color-primary)" stroke="var(--color-bg)" stroke-width="1.5"/>`;
  marks += `<text x="${(planX + 8).toFixed(1)}" y="${(planY - 8).toFixed(1)}" font-size="9.5" fill="var(--color-text-secondary)">计划 ${regKg(
    M.Z
  )} · ${regMoney(M.now)}</text>`;
  marks += `<text x="${(planX + 8).toFixed(1)}" y="${((planY + syL(l0At(M.Z))) / 2 + 3).toFixed(1)}" font-size="8.5" fill="var(--color-text-tertiary)">杂费 +${regMoney(
    M.B
  )}</text>`;

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

