/* ═══════════════════ 盈亏平衡与折扣分析 ═══════════════════ */
/* 口径：B 是网点付给中心的固定费用 = 额外的纯利润，与货量无关。
   m = P − C，L(Z) = m × Z + B；可接受折扣 d* = C ÷ P0（与货量无关）。
   C = 车线成本 + 操作成本；表格取数时车线成本按目的省份分别填写。 */
const REG = { mode: "manual", pol: "on" };

const REG_GROUP_FIELDS = [
  { key: "net", field: "寄件所属一级网点" },
  { key: "band", field: "公斤段" },
  { key: "prov", field: "目的所属省份" }
];
const REG_REQUIRED = ["寄件所属一级网点", "公斤段", "目的所属省份", "结算重量", "现价", "原价"];

const REG_TABLE = {
  picks: { net: [], band: [], prov: [] },   // 分组筛选条件的取值（空 = 全部）
  group: { net: false, band: false, prov: true }, // 勾了才作为分组维度
  cLine: {},                                 // { 省份: 车线成本 元/kg }
  opCost: 0.08                               // 操作成本 元/kg
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

/* ── 表格取数：字段自检 / 取值 / 汇算 ── */
function regRows() {
  return DEMO_ROWS;
}
function regHasField(field) {
  return regRows().some((row) => row[field] !== "" && row[field] !== null && row[field] !== undefined);
}
function regFieldValues(field) {
  const set = new Set();
  regRows().forEach((row) => {
    const value = row[field];
    if (value !== "" && value !== null && value !== undefined) set.add(String(value));
  });
  return [...set].sort((a, b) => a.localeCompare(b, "zh"));
}
function regSumCLine() {
  return Object.values(REG_TABLE.cLine).reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0);
}
function regOpCost() {
  const table = REG.mode === "table";
  return Math.max(0, regNum(table ? "#reg-opcost-table" : "#reg-opcost", table ? REG_TABLE.opCost : 0));
}
/** 需要填车线成本的省份：优先用「目的所属省份」筛选值，否则列全部 */
function regCostProvinces() {
  if (REG_TABLE.picks.prov.length > 0) return REG_TABLE.picks.prov;
  return regFieldValues("目的所属省份");
}

/**
 * 表格取数汇算：按筛选条件取行 → 按勾选的字段分组 → 每组算 Σ / P / P0 / d / C / m / 利润。
 * 省份在分组里时用该省的车线成本；不分组时车线成本取所有已填值之和。
 */
function regTableResult() {
  const missing = REG_REQUIRED.filter((field) => !regHasField(field));
  const picks = REG_TABLE.picks;
  const pool = regRows().filter((row) => {
    if (picks.net.length > 0 && !picks.net.includes(String(row["寄件所属一级网点"]))) return false;
    if (picks.band.length > 0 && !picks.band.includes(String(row["公斤段"]))) return false;
    if (picks.prov.length > 0 && !picks.prov.includes(String(row["目的所属省份"]))) return false;
    return true;
  });

  const groupFields = [];
  if (REG_TABLE.group.net) groupFields.push({ key: "net", field: "寄件所属一级网点" });
  if (REG_TABLE.group.band) groupFields.push({ key: "band", field: "公斤段" });
  if (REG_TABLE.group.prov) groupFields.push({ key: "prov", field: "目的所属省份" });
  const byProv = groupFields.some((item) => item.key === "prov");

  const buckets = new Map();
  pool.forEach((row) => {
    const parts = groupFields.map((item) => String(row[item.field]));
    const label = parts.length > 0 ? parts.join(" · ") : "全部";
    if (!buckets.has(label)) {
      buckets.set(label, { label, prov: byProv ? String(row["目的所属省份"]) : null, rows: [] });
    }
    buckets.get(label).rows.push(row);
  });

  const num = (row, field) => {
    const v = Number(row[field]);
    return Number.isFinite(v) ? v : 0;
  };
  const groups = [...buckets.values()]
    .map((bucket) => {
      const z = bucket.rows.reduce((acc, row) => acc + num(row, "结算重量"), 0);
      const price = bucket.rows.reduce((acc, row) => acc + num(row, "现价"), 0);
      const orig = bucket.rows.reduce((acc, row) => acc + num(row, "原价"), 0);
      const P = z > 0 ? price / z : NaN;
      const P0 = z > 0 ? orig / z : NaN;
      const cLine = bucket.prov !== null ? Number(REG_TABLE.cLine[bucket.prov] ?? 0) : regSumCLine();
      const C = cLine + REG_TABLE.opCost;
      return {
        label: bucket.label,
        prov: bucket.prov,
        count: bucket.rows.length,
        z,
        price,
        orig,
        P,
        P0,
        d: P0 > 0 ? P / P0 : NaN,
        cLine,
        C,
        m: P - C,
        profit: (P - C) * z
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "zh"));

  const zAll = groups.reduce((acc, g) => acc + g.z, 0);
  const priceAll = groups.reduce((acc, g) => acc + g.price, 0);
  const origAll = groups.reduce((acc, g) => acc + g.orig, 0);
  const costAll = groups.reduce((acc, g) => acc + g.C * g.z, 0);
  const P = zAll > 0 ? priceAll / zAll : NaN;
  const P0 = zAll > 0 ? origAll / zAll : NaN;
  const C = zAll > 0 ? costAll / zAll : regSumCLine() + REG_TABLE.opCost;

  return {
    missing,
    groups,
    z: zAll,
    price: priceAll,
    orig: origAll,
    P,
    P0,
    d: P0 > 0 ? P / P0 : NaN,
    C,
    m: P - C,
    profit: (P - C) * zAll,
    ok: missing.length === 0 && groups.length > 0
  };
}

/** 统一取数：表格模式读汇算，手动模式读输入框 */
function regModel() {
  const tableMode = REG.mode === "table";
  const t = tableMode ? regTableResult() : null;
  const P0 = tableMode ? t.P0 : Math.max(0, regNum("#reg-p0", 0));
  const P = tableMode ? t.P : Math.max(0, regNum("#reg-p", 0));
  const C = tableMode ? t.C : Math.max(0, regNum("#reg-cline", 0)) + Math.max(0, regNum("#reg-opcost", 0));
  const B = Math.max(0, regNum("#reg-b", 0));
  const Z = tableMode ? t.z : Math.max(0, regNum("#reg-z", 1));
  const polPct = Math.max(0, regNum("#reg-pol-p", 5));
  const m = P - C;
  const d = P0 > 0 ? P / P0 : NaN;
  const dStar = P0 > 0 ? C / P0 : NaN;
  return {
    tableMode,
    P0,
    P,
    C,
    B,
    Z,
    polPct,
    polOn: REG.pol === "on",
    m,
    d,
    dStar,
    profit: (z) => m * z + B,
    /* 议价政策直线：过（计划货量 Z，当前折扣 d），每翻倍货量下浮 polPct 个百分点 */
    policy: (z) => (Number.isFinite(d) && Z > 0 ? d - (polPct / 100) * (z / Z - 1) : NaN)
  };
}

/**
 * 政策线与成本折扣线 d* 的交点：超过该货量，按政策开价就跌破成本。
 * d − p·(z/Z − 1) = d*  ⇒  z = Z · (1 − (d − d*) ÷ (p ÷ 100))
 */
function regPolicyCross(M) {
  if (!(M.polPct > 0) || !Number.isFinite(M.d) || !Number.isFinite(M.dStar) || !(M.Z > 0)) return null;
  const z = M.Z * (1 - (M.d - M.dStar) / (M.polPct / 100));
  return Number.isFinite(z) && z > 0 ? z : null;
}

/** 结论表刻度：没有需要覆盖的固定成本，所以按计划货量的倍数看 */
function regSteps(M) {
  return [0.5, 1, 1.5, 2, 3].map((r) => ({ tag: `${r}×`, z: M.Z * r }));
}

/* ── 表格取数面板 ── */
function renderRegTablePanel() {
  const check = $("#reg-field-check");
  if (check) {
    check.innerHTML =
      `<div class="tiny" style="margin-bottom:4px">自动识别字段（${REG_REQUIRED.length} 个，全在才自动填充）</div>` +
      REG_REQUIRED.map(
        (field) =>
          `<div class="kv"><b>${field}</b><span class="chip ${regHasField(field) ? "chip-ok" : ""}">${
            regHasField(field) ? "已找到" : "缺失"
          }</span></div>`
      ).join("");
  }

  const rows = $("#reg-group-rows");
  if (rows) {
    rows.innerHTML = REG_GROUP_FIELDS.map((item) => {
      const picked = REG_TABLE.picks[item.key];
      return `<div class="reg-group-row">
        <button class="input" data-reg-pick="${item.key}" style="text-align:left">${
          picked.length > 0 ? `已选 ${picked.length} 项` : "全部"
        }</button>
        <label class="tiny reg-group-flag"><input type="checkbox" data-reg-group="${item.key}" ${
          REG_TABLE.group[item.key] ? "checked" : ""
        } /> 分组</label>
      </div>`;
    }).join("");
  }

  const t = regTableResult();
  const auto = $("#reg-auto");
  if (auto) {
    if (t.missing.length > 0) {
      auto.innerHTML = `<div class="warn-line tiny">缺少字段：${t.missing.join("、")}，无法自动填充</div>`;
    } else if (t.groups.length === 0) {
      auto.innerHTML = `<div class="tiny">当前筛选没有数据</div>`;
    } else {
      auto.innerHTML = t.groups
        .map(
          (g) => `<div class="card-soft reg-auto-card">
          <div class="tiny"><b>${g.label}</b> · ${g.count} 行 · 货量 ${regKg(g.z)}</div>
          <div class="field"><label>转运费原价 P0（元/kg）</label><input class="input" readonly value="${Number.isFinite(g.P0) ? g.P0.toFixed(4) : ""}" /></div>
          <div class="field"><label>转运费现价 P（元/kg）</label><input class="input" readonly value="${Number.isFinite(g.P) ? g.P.toFixed(4) : ""}" /></div>
          <div class="field"><label>折扣 d（自动 = P ÷ P0）</label><input class="input" readonly value="${Number.isFinite(g.d) ? g.d.toFixed(3) : ""}" /></div>
        </div>`
        )
        .join("");
    }
  }

  const cLine = $("#reg-cline-list");
  if (cLine) {
    const provinces = regCostProvinces();
    cLine.innerHTML =
      provinces
        .map(
          (prov) => `<div class="field"><label>发往 ${prov} 的车线成本（元/kg）</label>
          <input class="input" data-reg-cline="${prov}" value="${
            REG_TABLE.cLine[prov] === undefined ? "" : REG_TABLE.cLine[prov]
          }" placeholder="0.0000" /></div>`
        )
        .join("") +
      `<div class="tiny" id="reg-cost-sum">Σ车线成本 ${regSumCLine().toFixed(4)} 元/kg · 操作成本 ${REG_TABLE.opCost.toFixed(
        4
      )} 元/kg</div>`;
  }
  const op = $("#reg-opcost-table");
  if (op) op.value = REG_TABLE.opCost.toFixed(4);
}

/* ── 结果区（三卡 + 两图 + 底部表） ── */
function renderRegResults() {
  const M = regModel();
  if ($("#reg-d")) $("#reg-d").value = Number.isFinite(M.d) ? M.d.toFixed(3) : "";
  if ($("#reg-c")) $("#reg-c").value = M.C.toFixed(4);
  if ($("#reg-cost-sum")) {
    $("#reg-cost-sum").textContent = `Σ车线成本 ${regSumCLine().toFixed(4)} 元/kg · 操作成本 ${REG_TABLE.opCost.toFixed(
      4
    )} 元/kg`;
  }

  const prof = M.profit(M.Z);
  const perWan = M.m * 10000;
  const room = M.d - M.dStar;

  /* 卡 1：单公斤利润 */
  $("#reg-out-margin").textContent = Number.isFinite(M.m) ? `${M.m >= 0 ? "+" : "−"}${Math.abs(M.m).toFixed(4)} 元/kg` : "—";
  $("#reg-out-margin-note").innerHTML = Number.isFinite(M.m)
    ? `P ${M.P.toFixed(4)} − C ${M.C.toFixed(4)}；每 1 万 kg 利润 ${perWan >= 0 ? "+" : "−"}${regMoney(
        Math.abs(perWan)
      )}${M.tableMode ? "<br/>表格取数：按分组加权" : ""}`
    : "请填写 P0 / P / 成本";

  /* 卡 2：可接受折扣下限 */
  $("#reg-out-dstar").textContent = Number.isFinite(M.dStar) ? regPct(M.dStar) : "—";
  $("#reg-out-dstar-note").innerHTML = Number.isFinite(M.dStar)
    ? `成本价 = C = ${M.C.toFixed(4)} 元/kg；当前折扣 ${regPct(M.d)}，${
        room >= 0 ? `比成本线高 ${(room * 100).toFixed(1)} 个百分点` : `已低于成本线 ${Math.abs(room * 100).toFixed(1)} 个百分点（亏本价）`
      }<br/>折扣低于 d* 就是亏本价，与货量无关`
    : "请填写转运费原价 P0（必须大于 0）";

  /* 卡 3：计划货量下的利润 */
  $("#reg-out-profit").textContent = regMoney(prof);
  $("#reg-out-profit-note").innerHTML =
    `计划 ${regKg(M.Z)} × 单公斤利润 ${M.m.toFixed(4)} + B ${regMoney(M.B)} = ${regMoney(prof)}` +
    `<br/>收入 ${regMoney(M.P * M.Z + M.B)}（含 B）`;

  if ($("#reg-formula")) {
    $("#reg-formula").innerHTML =
      "d = P ÷ P0<br/>m = P − C（单公斤利润）<br/>L(Z) = m × Z + B（B 与货量无关，直接加利润）" +
      "<br/>C = 车线成本 + 操作成本<br/>可接受折扣下限 d* = C ÷ P0（与货量无关）" +
      "<br/>P0 = Σ原价 ÷ Σ结算重量　P = Σ现价 ÷ Σ结算重量（表格取数）" +
      "<br/>议价政策 d_p(Z) = d − (下浮百分点 ÷ 100) × (Z ÷ Z计划 − 1)";
  }

  regDrawDiscount(M);
  regDrawProfit(M);
  renderRegBottom(M);
}

/** 底部表：手动模式看「不同货量的利润」，表格模式看「按分组的汇算明细」 */
function renderRegBottom(M) {
  const body = $("#reg-concl-body");
  if (!body) return;
  if (M.tableMode) {
    const t = regTableResult();
    $("#reg-concl-title").textContent = "汇算明细（按分组）";
    $("#reg-concl-hint").textContent = `合计货量 ${regKg(t.z)} · B ${regMoney(M.B)} 只计一次`;
    if (t.missing.length > 0) {
      body.innerHTML = `<div class="tiny" style="padding:10px">缺少字段：${t.missing.join("、")}</div>`;
      return;
    }
    if (t.groups.length === 0) {
      body.innerHTML = `<div class="tiny" style="padding:10px">当前筛选没有数据</div>`;
      return;
    }
    body.innerHTML = `<table class="table">
      <thead><tr>
        <th>分组</th><th class="num">行数</th><th class="num">货量（kg）</th><th class="num">P</th><th class="num">P0</th>
        <th class="num">折扣 d</th><th class="num">车线成本</th><th class="num">C</th><th class="num">单公斤利润</th><th class="num">该组利润</th>
      </tr></thead>
      <tbody>
        ${t.groups
          .map(
            (g) => `<tr>
          <td>${g.label}</td>
          <td class="num">${g.count}</td>
          <td class="num">${Math.round(g.z).toLocaleString("zh-CN")}</td>
          <td class="num">${Number.isFinite(g.P) ? g.P.toFixed(4) : "—"}</td>
          <td class="num">${Number.isFinite(g.P0) ? g.P0.toFixed(4) : "—"}</td>
          <td class="num">${Number.isFinite(g.d) ? regPct(g.d) : "—"}</td>
          <td class="num">${g.cLine.toFixed(4)}</td>
          <td class="num">${g.C.toFixed(4)}</td>
          <td class="num">${g.m.toFixed(4)}</td>
          <td class="num">${regMoney(g.profit)}</td>
        </tr>`
          )
          .join("")}
        <tr class="total">
          <td>合计（含 B）</td>
          <td class="num">${t.groups.reduce((a, g) => a + g.count, 0)}</td>
          <td class="num">${Math.round(t.z).toLocaleString("zh-CN")}</td>
          <td class="num">${Number.isFinite(t.P) ? t.P.toFixed(4) : "—"}</td>
          <td class="num">${Number.isFinite(t.P0) ? t.P0.toFixed(4) : "—"}</td>
          <td class="num">${Number.isFinite(t.d) ? regPct(t.d) : "—"}</td>
          <td class="num">—</td>
          <td class="num">${t.C.toFixed(4)}</td>
          <td class="num">${t.m.toFixed(4)}</td>
          <td class="num">${regMoney(t.profit + M.B)}</td>
        </tr>
      </tbody></table>`;
    return;
  }

  $("#reg-concl-title").textContent = "不同货量下的中心利润（相对计划货量）";
  $("#reg-concl-hint").textContent = "利润 = m × Z + B，随货量线性变化";
  body.innerHTML = `<table class="table">
    <thead><tr>
      <th>相对计划货量</th><th class="num">承诺货量（kg）</th><th class="num">单公斤利润</th>
      <th class="num">中心利润（元）</th><th class="num">利润率</th><th>判定</th>
    </tr></thead>
    <tbody>${regSteps(M)
      .map(({ tag, z }) => {
        const p = M.profit(z);
        const rev = M.P * z + M.B;
        const rate = rev !== 0 ? p / rev : NaN;
        const judge =
          p > 1e-9
            ? '<span class="chip chip-ok">盈利</span>'
            : p < -1e-9
              ? '<span class="chip" style="color:var(--color-danger)">亏损</span>'
              : '<span class="chip">持平</span>';
        return `<tr>
          <td>${tag}</td>
          <td class="num">${Math.round(z).toLocaleString("zh-CN")}</td>
          <td class="num">${M.m.toFixed(4)}</td>
          <td class="num">${regMoney(p)}</td>
          <td class="num">${regPct(rate, 2)}</td>
          <td>${judge}</td>
        </tr>`;
      })
      .join("")}</tbody></table>`;
}

/* 图 1：折扣 – 货量（成本线 d* 是水平线；灰虚线 = 议价政策） */
function regDrawDiscount(M) {
  const w = 520, h = 300, padL = 46, padR = 14, padT = 16, padB = 34;
  const cross = M.polOn ? regPolicyCross(M) : null;
  let zMax = Math.max(M.Z * 1.15, cross !== null ? cross * 1.15 : 0, 1000);
  if (cross !== null && cross > zMax * 20) zMax = Math.max(M.Z * 1.15, 1000);
  const sx = (z) => padL + (z / zMax) * (w - padL - padR);

  const polPts = [];
  if (M.polOn && Number.isFinite(M.d)) {
    for (let i = 0; i <= 200; i++) {
      const z = (zMax * i) / 200;
      const v = M.policy(z);
      if (Number.isFinite(v) && v >= -0.5 && v <= 1.5) polPts.push([z, v]);
    }
  }
  const vals = [M.d, M.dStar].filter((v) => Number.isFinite(v)).concat(polPts.map((p) => p[1]));
  let yMin = Math.max(0, Math.min(...vals, 1) - 0.06);
  let yMax = Math.min(1, Math.max(...vals, 0) + 0.06);
  if (!(yMax > yMin)) yMax = Math.min(1, yMin + 0.1);
  const sy = (v) => h - padB - ((v - yMin) / (yMax - yMin)) * (h - padB - padT);
  const clampY = (v) => Math.max(yMin, Math.min(yMax, v));

  const gridY = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const v = yMin + (yMax - yMin) * t;
    return { v, y: sy(v) };
  });
  const gridX = [0, 0.25, 0.5, 0.75, 1].map((t) => ({ z: zMax * t, x: sx(zMax * t) }));

  let marks = "";
  // 亏本区：折扣低于 d* 一律亏
  if (Number.isFinite(M.dStar)) {
    const yD = sy(clampY(M.dStar));
    marks += `<rect x="${padL}" y="${Math.min(yD, h - padB).toFixed(1)}" width="${(w - padL - padR).toFixed(
      1
    )}" height="${Math.max(0, h - padB - Math.min(yD, h - padB)).toFixed(1)}" fill="var(--color-danger)" opacity=".06"/>`;
    marks += `<line x1="${padL}" y1="${yD.toFixed(1)}" x2="${w - padR}" y2="${yD.toFixed(1)}" stroke="var(--color-warning)" stroke-width="1.4" stroke-dasharray="6 4"/>` +
      `<text x="${w - padR - 2}" y="${(yD - 5).toFixed(1)}" font-size="9.5" fill="var(--color-warning)" text-anchor="end">可接受折扣下限 ${regPct(
        M.dStar
      )}</text>`;
  }
  if (polPts.length >= 2) {
    const d = polPts.map(([z, v], i) => `${i === 0 ? "M" : "L"}${sx(z).toFixed(1)},${sy(clampY(v)).toFixed(1)}`).join(" ");
    marks += `<path d="${d}" fill="none" stroke="var(--color-text-tertiary)" stroke-width="1.5" stroke-dasharray="7 4"/>`;
    const [lz, lv] = polPts[polPts.length - 1];
    marks += `<text x="${(sx(lz) - 6).toFixed(1)}" y="${(sy(clampY(lv)) - 6).toFixed(1)}" font-size="9" fill="var(--color-text-tertiary)" text-anchor="end">议价政策（仅参考）</text>`;
  }
  if (Number.isFinite(M.d)) {
    const px = sx(Math.min(M.Z, zMax));
    const py = sy(clampY(M.d));
    marks += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3.6" fill="${
      M.m >= 0 ? "var(--color-success)" : "var(--color-danger)"
    }" stroke="var(--color-bg)" stroke-width="1.4"/>` +
      `<text x="${(px + 6).toFixed(1)}" y="${(py - 6).toFixed(1)}" font-size="9.5" fill="var(--color-text-secondary)">计划 ${regKg(
        M.Z
      )} · ${regPct(M.d)}</text>`;
  }
  if (cross !== null && cross <= zMax && Number.isFinite(M.dStar)) {
    const cx = sx(cross);
    const cy = sy(clampY(M.dStar));
    marks += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="3.2" fill="var(--color-text-secondary)" stroke="var(--color-bg)" stroke-width="1.2"/>` +
      `<text x="${cx.toFixed(1)}" y="${(cy + 14).toFixed(1)}" font-size="9" fill="var(--color-text-secondary)" text-anchor="middle">交点 ${regKg(
        cross
      )}</text>`;
  }

  $("#reg-chart").innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" role="img">
      ${gridY
        .map(
          (g) => `<line x1="${padL}" y1="${g.y.toFixed(1)}" x2="${w - padR}" y2="${g.y.toFixed(1)}" stroke="var(--color-border-soft)" opacity=".55"/>
        <text x="${padL - 6}" y="${(g.y + 3).toFixed(1)}" font-size="9" fill="var(--color-text-tertiary)" text-anchor="end">${(
          g.v * 100
        ).toFixed(0)}%</text>`
        )
        .join("")}
      <line x1="${padL}" y1="${h - padB}" x2="${w - padR}" y2="${h - padB}" stroke="var(--color-border)"/>
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${h - padB}" stroke="var(--color-border)"/>
      ${marks}
      ${gridX
        .map(
          (g) =>
            `<text x="${g.x.toFixed(1)}" y="${h - padB + 13}" font-size="9" fill="var(--color-text-tertiary)" text-anchor="middle">${regShort(
              g.z
            )}</text>`
        )
        .join("")}
      <text x="${w - padR}" y="${h - 4}" font-size="9" fill="var(--color-text-tertiary)" text-anchor="end">承诺货量（kg）→　成本线是水平的：折扣只跟 C ÷ P0 有关</text>
    </svg>`;

  if ($("#reg-pol-note")) {
    let note = "";
    if (M.polOn && Number.isFinite(M.d)) {
      note = `政策线过（${regKg(M.Z)}，${regPct(M.d)}），每翻倍下浮 ${M.polPct} 个百分点；`;
      if (cross !== null) {
        note += `与成本线交于 ${regKg(cross)}，超过该货量按政策开价就低于成本`;
      } else if (M.d >= M.dStar) {
        note += "政策线全程高于成本线（按政策开价都不会低于成本）";
      } else {
        note += "当前折扣已低于成本线，政策线再往下就更亏";
      }
    }
    $("#reg-pol-note").textContent = note;
  }
}

/* 图 2：利润 – 货量（直线，斜率 = 单公斤利润 m） */
function regDrawProfit(M) {
  const w = 460, h = 300, padL = 52, padR = 14, padT = 16, padB = 44;
  const steps = regSteps(M);
  const stepMax = Math.max(...steps.map((s) => s.z));
  const zMax = Math.max(stepMax * 1.08, M.Z * 1.15, 1000);
  const lo = Math.min(0, M.profit(0), M.profit(zMax));
  const hi = Math.max(0, M.profit(0), M.profit(zMax));
  const pad = Math.max(1, (hi - lo) * 0.08);
  const yMin = lo - pad;
  const yMax = hi + pad;
  const sx = (z) => padL + (z / zMax) * (w - padL - padR);
  const sy = (v) => h - padB - ((v - yMin) / (yMax - yMin || 1)) * (h - padB - padT);

  const gridY = [0, 0.25, 0.5, 0.75, 1].map((t) => ({ v: yMin + (yMax - yMin) * t }));
  const gridX = [0, 0.25, 0.5, 0.75, 1].map((t) => zMax * t);

  let marks = "";
  steps.forEach(({ tag, z }) => {
    if (z > zMax) return;
    const p = M.profit(z);
    if (p < yMin || p > yMax) return;
    marks += `<circle cx="${sx(z).toFixed(1)}" cy="${sy(p).toFixed(1)}" r="3" fill="var(--color-warning)" stroke="var(--color-bg)" stroke-width="1.2"/>` +
      `<text x="${(sx(z) + 4).toFixed(1)}" y="${(sy(p) - 5).toFixed(1)}" font-size="8.5" fill="var(--color-text-tertiary)">${tag}</text>`;
  });
  const curve = `M${sx(0).toFixed(1)},${sy(M.profit(0)).toFixed(1)} L${sx(zMax).toFixed(1)},${sy(M.profit(zMax)).toFixed(1)}`;
  const slopeText =
    M.m > 0
      ? `斜率 = m = ${M.m.toFixed(4)} 元/kg（正：货量越大利润越高）`
      : M.m < 0
        ? `斜率 = m = ${M.m.toFixed(4)} 元/kg（负：货量越大亏得越多）`
        : "斜率 = m = 0（P = C，利润恒为 B）";

  $("#reg-chart2").innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" role="img">
      ${gridY
        .map(
          (g) => `<line x1="${padL}" y1="${sy(g.v).toFixed(1)}" x2="${w - padR}" y2="${sy(g.v).toFixed(1)}" stroke="var(--color-border-soft)" opacity=".55"/>
        <text x="${padL - 6}" y="${(sy(g.v) + 3).toFixed(1)}" font-size="9" fill="var(--color-text-tertiary)" text-anchor="end">${regShort(
          g.v
        )}</text>`
        )
        .join("")}
      <line x1="${padL}" y1="${sy(0).toFixed(1)}" x2="${w - padR}" y2="${sy(0).toFixed(1)}" stroke="var(--color-border)" stroke-width="1.2"/>
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${h - padB}" stroke="var(--color-border)"/>
      ${gridX
        .map(
          (z) =>
            `<text x="${sx(z).toFixed(1)}" y="${h - padB + 13}" font-size="9" fill="var(--color-text-tertiary)" text-anchor="middle">${regShort(
              z
            )}</text>`
        )
        .join("")}
      <path d="${curve}" fill="none" stroke="var(--color-primary)" stroke-width="2"/>
      ${marks}
      <text x="${padL}" y="${h - 4}" font-size="8.5" fill="var(--color-text-tertiary)">利润（元）· 货量（kg）—　${slopeText}</text>
    </svg>`;
}

function renderRegression() {
  if (REG.mode === "table") renderRegTablePanel();
  renderRegResults();
}

/* ── 取数面板的取值选择器 ── */
function openRegPicker(anchor, key) {
  hideCtx();
  const item = REG_GROUP_FIELDS.find((f) => f.key === key);
  const values = regFieldValues(item.field);
  const picked = REG_TABLE.picks[key];
  const pop = document.createElement("div");
  pop.className = "picker";
  pop.innerHTML = `
    <div class="tiny" style="padding:2px 4px 6px">${item.field} · 可多选（不勾 = 全部）</div>
    <div class="picker-list">
      ${values
        .map(
          (value) =>
            `<label class="picker-item"><input type="checkbox" data-reg-val="${value}" ${
              picked.includes(value) ? "checked" : ""
            } /><span>${value}</span></label>`
        )
        .join("")}
    </div>
    <div class="picker-foot">
      <button class="btn btn-ghost" data-reg-all>全选</button>
      <button class="btn btn-ghost" data-reg-none>清空</button>
      <span style="flex:1"></span>
      <button class="btn btn-primary" data-reg-ok>确定</button>
    </div>`;
  pop.querySelector("[data-reg-all]").addEventListener("click", () => {
    pop.querySelectorAll("[data-reg-val]").forEach((box) => {
      box.checked = true;
    });
  });
  pop.querySelector("[data-reg-none]").addEventListener("click", () => {
    pop.querySelectorAll("[data-reg-val]").forEach((box) => {
      box.checked = false;
    });
  });
  pop.querySelector("[data-reg-ok]").addEventListener("click", () => {
    REG_TABLE.picks[key] = [...pop.querySelectorAll("[data-reg-val]")]
      .filter((box) => box.checked)
      .map((box) => box.value);
    pop.remove();
    renderRegression();
  });
  const rect = anchor.getBoundingClientRect();
  pop.style.left = Math.min(rect.left, window.innerWidth - 290) + "px";
  pop.style.top = Math.min(rect.bottom + 4, window.innerHeight - 340) + "px";
  document.body.appendChild(pop);
  pop.addEventListener("click", (event) => event.stopPropagation());
}

/* ── 绑定 ── */
$$("#reg-mode button").forEach((btn) =>
  btn.addEventListener("click", () => {
    REG.mode = btn.dataset.mode;
    $$("#reg-mode button").forEach((b) => b.classList.toggle("on", b === btn));
    $("#reg-manual").hidden = REG.mode === "table";
    $("#reg-table").hidden = REG.mode !== "table";
    renderRegression();
  })
);

$$("#reg-pol button").forEach((btn) =>
  btn.addEventListener("click", () => {
    REG.pol = btn.dataset.pol;
    $$("#reg-pol button").forEach((b) => b.classList.toggle("on", b === btn));
    renderRegression();
  })
);

["#reg-p", "#reg-p0", "#reg-b", "#reg-z", "#reg-pol-p", "#reg-cline", "#reg-opcost"].forEach((sel) => {
  const el = $(sel);
  if (el) el.addEventListener("input", renderRegResults);
});

const regView = $("#view-regression");
if (regView) {
  regView.addEventListener("click", (event) => {
    const pick = event.target.closest("[data-reg-pick]");
    if (pick) {
      openRegPicker(pick, pick.dataset.regPick);
      return;
    }
  });
  regView.addEventListener("change", (event) => {
    const box = event.target.closest("[data-reg-group]");
    if (!box) return;
    REG_TABLE.group[box.dataset.regGroup] = box.checked;
    renderRegression();
  });
  regView.addEventListener("input", (event) => {
    const line = event.target.closest("[data-reg-cline]");
    if (line) {
      const prov = line.dataset.regCline;
      const value = Number(String(line.value).replace(/[,，\s]/g, ""));
      REG_TABLE.cLine[prov] = Number.isFinite(value) ? value : 0;
      renderRegResults();
      return;
    }
    const op = event.target.closest("#reg-opcost-table");
    if (op) {
      const value = Number(String(op.value).replace(/[,，\s]/g, ""));
      REG_TABLE.opCost = Number.isFinite(value) ? value : 0;
      $("#reg-opcost").value = REG_TABLE.opCost.toFixed(4);
      renderRegResults();
    }
  });
}

$$(".acc-head[data-acc]").forEach((btn) =>
  btn.addEventListener("click", () => {
    const body = btn.nextElementSibling;
    body.hidden = !body.hidden;
    btn.querySelector("span").textContent = body.hidden ? "▾" : "▴";
  })
);

