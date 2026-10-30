/* ═══════════════════ 盈亏平衡与折扣分析 ═══════════════════ */
const REG = { bdir: "cost" };
const REG_B_NOTE = {
  cost: "B 作为固定支出，按货量摊进单价",
  income: "B 作为网点付中心的固定收入，等于每公斤补贴 B ÷ Z"
};

function regNum(sel, fallback) {
  const el = $(sel);
  if (!el) return fallback;
  const raw = String(el.value).trim().replace(/[,，\s]/g, "");
  const v = Number(raw);
  return raw !== "" && Number.isFinite(v) ? v : fallback;
}

function regMoney(v) {
  if (!Number.isFinite(v)) return "—";
  return (v < 0 ? "-¥" : "¥") + Math.abs(v).toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

function regKg(v) {
  if (!Number.isFinite(v)) return "—";
  if (Math.abs(v) >= 10000) {
    const wan = v / 10000;
    return (Math.abs(wan) >= 100 ? wan.toFixed(1) : wan.toFixed(2)).replace(/\.?0+$/, "") + " 万 kg";
  }
  return Math.round(v).toLocaleString("zh-CN") + " kg";
}

function regPct(v, digits) {
  if (!Number.isFinite(v)) return "—";
  return (v * 100).toFixed(digits === undefined ? 1 : digits) + "%";
}

/** 轴标签用的极简数字：12340 -> 1.2万 */
function regShort(v) {
  const a = Math.abs(v);
  if (a >= 10000) return (v / 10000).toFixed(a >= 100000 ? 0 : 1).replace(/\.0$/, "") + "万";
  if (a >= 100) return String(Math.round(v));
  return String(Math.round(v * 100) / 100);
}

/** 统一取数：单公斤口径，fixed 为带符号固定项（+B 需覆盖 / -B 补贴） */
function regModel() {
  const P0 = Math.max(0, regNum("#reg-p0", 0));
  const P = Math.max(0, regNum("#reg-p", 0));
  const C = Math.max(0, regNum("#reg-c", 0));
  const B = Math.max(0, regNum("#reg-b", 0));
  const Z = Math.max(1, regNum("#reg-z", 1));
  const s = REG.bdir === "cost" ? 1 : -1;
  const fixed = s * B;                 // 利润 L(Z) = m·Z − fixed
  const m = P - C;                     // 单公斤边际贡献
  const d = P0 > 0 ? P / P0 : NaN;     // 当前折扣
  const dStar = P0 > 0 ? C / P0 : NaN; // 临界折扣：边际归零点
  const zStar = m !== 0 && fixed / m > 0 ? fixed / m : null;
  return {
    P0, P, C, B, Z, s, fixed, m, d, dStar, zStar,
    profit: (z) => m * z - fixed,
    balance: (z) => (z > 0 && P0 > 0 ? (C + fixed / z) / P0 : NaN),
    priceFloor: (z) => (z > 0 ? C + fixed / z : NaN)
  };
}

function renderRegression() {
  const M = regModel();
  if ($("#reg-d")) $("#reg-d").value = Number.isFinite(M.d) ? M.d.toFixed(3) : "";
  if ($("#reg-bdir-note")) $("#reg-bdir-note").textContent = REG_B_NOTE[REG.bdir];

  const isFloor = M.m > 0;             // 边际为正 → 临界货量是「下限」
  const prof = M.profit(M.Z);
  const pFloorPlan = M.priceFloor(M.Z);
  const dFloorPlan = M.P0 > 0 ? pFloorPlan / M.P0 : NaN;

  /* ── 卡 1：临界点 ── */
  let pointValue = "不存在";
  let pointNote = "";
  if (M.zStar !== null) {
    pointValue = `${regPct(M.d)} ↔ ${regKg(M.zStar)}`;
    pointNote =
      `① 按当前折扣 ${regPct(M.d)}：承诺货量${isFloor ? "需 ≥ " : "最多 ≤ "}${regKg(M.zStar)}（${isFloor ? "下限" : "上限"}）<br/>` +
      `② 按计划货量 ${regKg(M.Z)}：临界价 ${pFloorPlan.toFixed(4)} 元/kg（折扣 ${regPct(dFloorPlan)}）`;
  } else if (M.B === 0) {
    pointNote = "B = 0，没有需要摊薄的固定项，因此不存在临界货量";
  } else if (M.m === 0) {
    pointNote = "P = C，单公斤不赚不亏，B 无法靠加货量摊掉";
  } else if (M.m > 0) {
    pointNote = "边际为正且 B 是固定收入：任何货量都盈利，不存在临界货量";
  } else {
    pointNote = "边际 P − C 为负且 B 需中心承担：无论多少货量都亏损";
  }
  $("#reg-out-point").textContent = pointValue;
  $("#reg-out-point-note").innerHTML = pointNote;

  /* ── 卡 2：临界折扣 ── */
  $("#reg-out-dstar").textContent = Number.isFinite(M.dStar) ? regPct(M.dStar) : "—";
  $("#reg-out-dstar-note").innerHTML = Number.isFinite(M.dStar)
    ? `对应临界价 = C = ${M.C.toFixed(4)} 元/kg；折扣低于 ${regPct(M.dStar)} 时，货量再大也做不出利润`
    : "请填写转运费原价 P0（必须大于 0）";

  /* ── 卡 3：计划货量下的利润 ── */
  $("#reg-out-profit").textContent = regMoney(prof);
  $("#reg-out-profit-note").innerHTML =
    `计划 ${regKg(M.Z)} × 折扣 ${regPct(M.d)} · 单公斤边际 ${M.m.toFixed(4)} 元/kg · ` +
    `收入 ${regMoney(M.P * M.Z + (M.s < 0 ? M.B : 0))}`;

  /* ── 结论表：超临界货量 20/30/50/80/100% ── */
  const steps = [0.2, 0.3, 0.5, 0.8, 1];
  $("#reg-concl-hint").textContent =
    M.zStar === null ? "当前参数不存在临界货量" : `临界货量 ${regKg(M.zStar)}（${isFloor ? "下限" : "上限"}）`;
  $("#reg-concl-body").innerHTML = steps.map((k) => {
    const z = M.zStar === null ? NaN : M.zStar * (1 + k);
    const p = Number.isFinite(z) ? M.profit(z) : NaN;
    const rev = Number.isFinite(z) ? M.P * z + (M.s < 0 ? M.B : 0) : NaN;
    const rate = Number.isFinite(rev) && rev !== 0 ? p / rev : NaN;
    const judge = !Number.isFinite(p)
      ? '<span class="chip">—</span>'
      : p > 0
        ? '<span class="chip chip-ok">盈利</span>'
        : p < 0
          ? '<span class="chip" style="color:var(--color-danger)">亏损</span>'
          : '<span class="chip">持平</span>';
    return `<tr>
        <td>+${(k * 100).toFixed(0)}%</td>
        <td class="num">${Number.isFinite(z) ? Math.round(z).toLocaleString("zh-CN") : "—"}</td>
        <td class="num">${Number.isFinite(p) ? regMoney(p) : "—"}</td>
        <td class="num">${Number.isFinite(rate) ? regPct(rate, 2) : "—"}</td>
        <td>${judge}</td>
      </tr>`;
  }).join("");

  regDrawBalance(M, isFloor);
  regDrawProfit(M, isFloor);
}

/* 图 1：折扣 – 承诺货量 平衡曲线 */
function regDrawBalance(M, isFloor) {
  const w = 520, h = 300, padL = 46, padR = 14, padT = 16, padB = 34;
  const zMax = Math.max(M.zStar !== null ? M.zStar * 2 : 0, M.Z * 1.15, 1000);
  const sx = (z) => padL + (z / zMax) * (w - padL - padR);

  const pts = [];
  for (let i = 1; i <= 200; i++) {
    const z = (zMax * i) / 200;
    const v = M.balance(z);
    if (Number.isFinite(v) && v >= 0 && v <= 1) pts.push([z, v]);
  }
  if (pts.length < 2) {
    $("#reg-chart").innerHTML =
      '<div class="tiny" style="text-align:center;padding:24px 12px">当前货量区间内，平衡折扣已超出 0 – 100%，曲线不可见</div>';
    return;
  }
  const vals = pts.map((p) => p[1]);
  if (Number.isFinite(M.dStar)) vals.push(M.dStar);
  let yMin = Math.max(0, Math.min(...vals) - 0.03);
  let yMax = Math.min(1, Math.max(...vals) + 0.03);
  if (yMax - yMin < 0.1) yMax = Math.min(1, yMin + 0.1);
  const sy = (v) => h - padB - ((v - yMin) / (yMax - yMin)) * (h - padB - padT);

  const path = pts.map(([z, v], i) => `${i === 0 ? "M" : "L"}${sx(z).toFixed(1)},${sy(v).toFixed(1)}`).join(" ");
  const gridY = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const v = yMin + (yMax - yMin) * t;
    return { v, y: sy(v) };
  });
  const gridX = [0, 0.25, 0.5, 0.75, 1].map((t) => ({ z: zMax * t, x: sx(zMax * t) }));

  let marks = "";
  if (Number.isFinite(M.dStar) && M.dStar >= yMin && M.dStar <= yMax) {
    const yA = sy(M.dStar);
    marks += `<line x1="${padL}" y1="${yA.toFixed(1)}" x2="${w - padR}" y2="${yA.toFixed(1)}" stroke="var(--color-warning)" stroke-width="1.3" stroke-dasharray="6 4" opacity=".85"/>` +
      `<text x="${w - padR - 2}" y="${(yA - 5).toFixed(1)}" font-size="9.5" fill="var(--color-warning)" text-anchor="end">临界折扣 ${regPct(M.dStar)}</text>`;
  }
  if (M.zStar !== null && M.zStar <= zMax) {
    const xA = sx(M.zStar);
    marks += `<line x1="${xA.toFixed(1)}" y1="${padT}" x2="${xA.toFixed(1)}" y2="${h - padB}" stroke="var(--color-danger)" stroke-width="1.2" stroke-dasharray="4 4" opacity=".8"/>` +
      `<text x="${(xA + 4).toFixed(1)}" y="${padT + 10}" font-size="9.5" fill="var(--color-danger)">临界 ${regKg(M.zStar)}</text>`;
  }
  if (Number.isFinite(M.d) && M.d >= yMin && M.d <= yMax) {
    const px = sx(Math.min(M.Z, zMax)), py = sy(M.d);
    marks += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3.6" fill="${M.profit(M.Z) >= 0 ? "var(--color-success)" : "var(--color-danger)"}" stroke="var(--color-bg)" stroke-width="1.4"/>` +
      `<text x="${(px + 6).toFixed(1)}" y="${(py - 6).toFixed(1)}" font-size="9.5" fill="var(--color-text-secondary)">计划 ${regKg(M.Z)} · ${regPct(M.d)}</text>`;
  }

  $("#reg-chart").innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" role="img">
      ${gridY.map((g) => `<line x1="${padL}" y1="${g.y.toFixed(1)}" x2="${w - padR}" y2="${g.y.toFixed(1)}" stroke="var(--color-border-soft)" opacity=".55"/>
        <text x="${padL - 6}" y="${(g.y + 3).toFixed(1)}" font-size="9" fill="var(--color-text-tertiary)" text-anchor="end">${(g.v * 100).toFixed(0)}%</text>`).join("")}
      <line x1="${padL}" y1="${h - padB}" x2="${w - padR}" y2="${h - padB}" stroke="var(--color-border)"/>
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${h - padB}" stroke="var(--color-border)"/>
      <path d="${path}" fill="none" stroke="var(--color-primary)" stroke-width="2" stroke-linejoin="round"/>
      ${marks}
      ${gridX.map((g) => `<text x="${g.x.toFixed(1)}" y="${h - padB + 13}" font-size="9" fill="var(--color-text-tertiary)" text-anchor="middle">${regShort(g.z)}</text>`).join("")}
      <text x="${w - padR}" y="${h - 4}" font-size="9" fill="var(--color-text-tertiary)" text-anchor="end">承诺货量（kg）→　${isFloor ? "货量越大，可放折扣越深" : "货量越大，可放折扣越浅"}</text>
    </svg>`;
}

/* 图 2：利润 – 货量（直线） */
function regDrawProfit(M, isFloor) {
  const w = 420, h = 300, padL = 52, padR = 14, padT = 16, padB = 34;
  const zMax = Math.max(M.zStar !== null ? M.zStar * 2 : 0, M.Z * 1.15, 1000);
  const rawMin = Math.min(0, M.profit(0), M.profit(zMax));
  const rawMax = Math.max(0, M.profit(0), M.profit(zMax));
  const pad = Math.max(1, (rawMax - rawMin) * 0.08);
  const yMin = rawMin - pad, yMax = rawMax + pad;
  const sx = (z) => padL + (z / zMax) * (w - padL - padR);
  const sy = (v) => h - padB - ((v - yMin) / (yMax - yMin || 1)) * (h - padB - padT);

  const gridY = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const v = yMin + (yMax - yMin) * t;
    return { v, y: sy(v) };
  });

  let marks = "";
  if (M.zStar !== null && M.zStar <= zMax) {
    const xA = sx(M.zStar);
    marks += `<line x1="${xA.toFixed(1)}" y1="${padT}" x2="${xA.toFixed(1)}" y2="${h - padB}" stroke="var(--color-danger)" stroke-width="1.2" stroke-dasharray="4 4" opacity=".7"/>`;
  }
  [0.2, 0.3, 0.5, 0.8, 1].forEach((k) => {
    if (M.zStar === null) return;
    const z = M.zStar * (1 + k);
    if (z > zMax) return;
    const p = M.profit(z);
    if (p < yMin || p > yMax) return;
    marks += `<circle cx="${sx(z).toFixed(1)}" cy="${sy(p).toFixed(1)}" r="3" fill="var(--color-warning)" stroke="var(--color-bg)" stroke-width="1.2"/>` +
      `<text x="${(sx(z) + 4).toFixed(1)}" y="${(sy(p) - 5).toFixed(1)}" font-size="8.5" fill="var(--color-text-tertiary)">+${(k * 100).toFixed(0)}%</text>`;
  });
  if (M.zStar !== null && M.zStar <= zMax) {
    marks += `<circle cx="${sx(M.zStar).toFixed(1)}" cy="${sy(0).toFixed(1)}" r="3.4" fill="var(--color-danger)" stroke="var(--color-bg)" stroke-width="1.3"/>`;
  }
  const curve = `M${sx(0).toFixed(1)},${sy(M.profit(0)).toFixed(1)} L${sx(zMax).toFixed(1)},${sy(M.profit(zMax)).toFixed(1)}`;

  $("#reg-chart2").innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" role="img">
      ${gridY.map((g) => `<line x1="${padL}" y1="${g.y.toFixed(1)}" x2="${w - padR}" y2="${g.y.toFixed(1)}" stroke="var(--color-border-soft)" opacity=".55"/>
        <text x="${padL - 6}" y="${(g.y + 3).toFixed(1)}" font-size="9" fill="var(--color-text-tertiary)" text-anchor="end">${regShort(g.v)}</text>`).join("")}
      <line x1="${padL}" y1="${sy(0).toFixed(1)}" x2="${w - padR}" y2="${sy(0).toFixed(1)}" stroke="var(--color-border)" stroke-width="1.2"/>
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${h - padB}" stroke="var(--color-border)"/>
      <path d="${curve}" fill="none" stroke="var(--color-primary)" stroke-width="2"/>
      ${marks}
      <text x="${padL}" y="${h - 4}" font-size="9" fill="var(--color-text-tertiary)">利润（元）· 货量（kg）—　${isFloor ? "过临界点后每多一公斤赚 m 元" : "过临界点后每多一公斤亏 |m| 元"}</text>
    </svg>`;
}

/* ── 绑定 ── */
$$("#reg-mode button").forEach((btn) => btn.addEventListener("click", () => {
  $$("#reg-mode button").forEach((b) => b.classList.toggle("on", b === btn));
  const table = btn.dataset.mode === "table";
  $("#reg-manual").hidden = table;
  $("#reg-table").hidden = !table;
  renderRegression();
}));

$$("#reg-bdir button").forEach((btn) => btn.addEventListener("click", () => {
  REG.bdir = btn.dataset.dir;
  $$("#reg-bdir button").forEach((b) => b.classList.toggle("on", b === btn));
  renderRegression();
}));

["#reg-p", "#reg-p0", "#reg-b", "#reg-c", "#reg-z"].forEach((sel) => {
  const el = $(sel);
  if (el) el.addEventListener("input", renderRegression);
});

$$(".acc-head[data-acc]").forEach((btn) => btn.addEventListener("click", () => {
  const body = btn.nextElementSibling;
  body.hidden = !body.hidden;
  btn.querySelector("span").textContent = body.hidden ? "▾" : "▴";
}));
