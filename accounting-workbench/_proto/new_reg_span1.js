/** 表格取数 → 汇总成统一模型（每组自己的车线/操作/计划折扣/计划货量） */
function regTableModel() {
  const t = regTableResult();
  const costAll = t.groups.reduce((acc, g) => acc + g.C * g.z, 0);
  const C = t.z > 0 ? costAll / t.z : NaN;
  const mNow = t.z > 0 ? t.profitNow / t.z : NaN;
  const mPlan = t.zPlan > 0 ? t.profitPlan / t.zPlan : NaN;
  return {
    tableMode: true,
    groups: t.groups,
    missing: t.missing,
    P0: t.P0,
    P: t.P,
    Pplan: t.Pplan,
    C,
    m: mNow,
    mPlan,
    d: t.d,
    dPlan: t.dPlan,
    B: 0,
    Bnow: 0,
    Z: t.zPlan,
    Znow: t.z,
    revenue: t.revenuePlan,
    revenueNow: t.revenueNow,
    profitNow: t.profitNow,
    rate: t.revenuePlan !== 0 ? t.profitPlan / t.revenuePlan : NaN,
    rateNow: t.revenueNow !== 0 ? t.profitNow / t.revenueNow : NaN,
    /* 不含杂费：价差就是全部利润 */
    priceGap: t.profitPlan,
    fee: 0,
    onePct: (t.P0 * t.zPlan) / 100,
    lineNow: (z) => mNow * z,
    profit: (z) => (Number.isFinite(mPlan) ? mPlan * z : NaN)
  };
}

/** 手动输入 → 统一模型（单组、含杂费 B） */
function regManualModel() {
  const P0 = Math.max(0, regNum("#reg-p0", 0));
  const P = Math.max(0, regNum("#reg-p", 0));
  const C = Math.max(0, regNum("#reg-cline", 0)) + Math.max(0, regNum("#reg-opcost", 0));
  const B = Math.max(0, regNum("#reg-b", 0));
  const Z = Math.max(0, regNum("#reg-z", 1));
  const Znow = Math.max(0, regNum("#reg-znow", 0));
  const Bnow = Math.max(0, regNum("#reg-bnow", 0));
  const m = P - C;
  const d = P0 > 0 ? P / P0 : NaN;
  const dPlan = Math.min(1, Math.max(0, regNum("#reg-dplan", d)));
  const Pplan = P0 > 0 ? P0 * dPlan : NaN;
  const mPlan = Number.isFinite(Pplan) ? Pplan - C : NaN;
  const revenue = Pplan * Z + B;
  const profit = mPlan * Z + B;
  const profitNow = m * Znow + Bnow;
  const revenueNow = P * Znow + Bnow;
  return {
    tableMode: false,
    groups: null,
    P0,
    P,
    C,
    B,
    Z,
    Znow,
    Bnow,
    m,
    d,
    dPlan,
    Pplan,
    mPlan,
    revenue,
    profitNow,
    lineNow: (z) => m * z + Bnow,
    profit: (z) => mPlan * z + B,
    now: profit,
    rate: revenue !== 0 ? profit / revenue : NaN,
    rateNow: revenueNow !== 0 ? profitNow / revenueNow : NaN,
    priceGap: mPlan * Z,
    fee: B,
    onePct: (P0 * Z) / 100
  };
}

function regModel() {
  return REG.mode === "table" ? regTableModel() : regManualModel();
}

/** 结论表刻度：没有需要覆盖的固定成本，所以按计划货量的倍数看 */
function regSteps(M) {
  return [0.5, 1, 1.5, 2, 3].map((r) => ({ tag: `${r}×`, z: M.Z * r }));
}

/* ── 表格取数面板 ── */
function renderRegTablePanel() {
  /* 字段自检：折叠成一行 */
  const check = $("#reg-field-check");
  if (check) {
    const found = REG_REQUIRED.filter((field) => regHasField(field)).length;
    check.innerHTML =
      `<div class="kv"><b>字段识别</b><span class="chip ${found === REG_REQUIRED.length ? "chip-ok" : ""}">${found}/${
        REG_REQUIRED.length
      } 已找到</span></div>` +
      `<div class="tiny" style="line-height:1.9">` +
      REG_REQUIRED.map(
        (field) =>
          `<span style="margin-right:10px;color:${regHasField(field) ? "inherit" : "var(--color-danger)"}">${
            regHasField(field) ? "✓" : "✕"
          } ${field}</span>`
      ).join("") +
      `</div>`;
  }

  /* 分组筛选条件：一个维度一行（chip + 选择 + 分组开关） */
  const rows = $("#reg-group-rows");
  if (rows) {
    rows.innerHTML = REG_GROUP_FIELDS.map((item) => {
      const picked = REG_TABLE.picks[item.key];
      const has = regHasField(item.field);
      const chips =
        picked.length === 0
          ? `<span class="chip">全部</span>`
          : picked
              .slice(0, 2)
              .map((v) => `<span class="chip chip-ok">${v}</span>`)
              .join("") + (picked.length > 2 ? `<span class="chip">+${picked.length - 2}</span>` : "");
      return `<div class="reg-dim-row">
        <div class="reg-dim-name">${item.field}${has ? "" : ' <span class="chip" style="color:var(--color-danger)">缺失</span>'}</div>
        <div class="reg-dim-chips">${chips}</div>
        <button class="btn btn-ghost reg-dim-pick" data-reg-pick="${item.key}" ${has ? "" : "disabled"}>选择</button>
        <label class="reg-dim-flag"><input type="checkbox" data-reg-group="${item.key}" ${
          REG_TABLE.group[item.key] ? "checked" : ""
        } ${has ? "" : "disabled"} /> 分组</label>
      </div>`;
    }).join("");
  }

  const t = regTableResult();
  const stats = $("#reg-group-stats");
  if (stats) {
    const rowsCount = t.groups.reduce((acc, g) => acc + g.count, 0);
    const dims = REG_GROUP_FIELDS.filter((item) => REG_TABLE.group[item.key]).map((item) => item.field);
    stats.innerHTML = t.missing.length
      ? `<span style="color:var(--color-danger)">缺少字段：${t.missing.join("、")}</span>`
      : `当前条件：命中 <b>${rowsCount}</b> 行 / <b>${t.groups.length}</b> 组（按 ${dims.length ? dims.join(" · ") : "不分组合计"}）`;
  }

  /* 自动填充：每组一张卡，P0/P/折扣自动，其余手填 */
  const auto = $("#reg-auto");
  if (auto) {
    if (t.missing.length > 0) {
      auto.innerHTML = `<div class="warn-line tiny">缺少字段：${t.missing.join("、")}，无法自动填充</div>`;
    } else if (t.groups.length === 0) {
      auto.innerHTML = `<div class="tiny">当前筛选没有数据</div>`;
    } else {
      auto.innerHTML = t.groups
        .map((g, idx) => {
          const num = (v, d = 4) => (Number.isFinite(v) ? v.toFixed(d) : "—");
          return `<div class="card-soft reg-auto-card">
          <div class="kv"><b>${g.label}</b><span class="tiny">${g.count} 行 · ${regInt(g.z)} kg</span></div>
          <div class="reg-ro-row">
            <span>P0 <b>${num(g.P0)}</b></span><span>P <b>${num(g.P)}</b></span><span>折扣 <b>${regPct(g.d)}</b></span>
          </div>
          <div class="reg-in-row">
            <label>车线成本（元/kg）<input class="input" data-reg-key="${idx}" data-reg-g="cLine" value="${g.cLine.toFixed(4)}" /></label>
            <label>操作成本（元/kg）<input class="input" data-reg-key="${idx}" data-reg-g="opCost" value="${g.opCost.toFixed(4)}" /></label>
          </div>
          <div class="reg-in-row">
            <label>计划调整折扣<input class="input" data-reg-key="${idx}" data-reg-g="dPlan" value="${num(g.dPlan, 3)}" /></label>
            <label>计划承诺货量（kg）<input class="input" data-reg-key="${idx}" data-reg-g="zPlan" value="${regInt(g.zPlan).replace(/,/g, "")}" /></label>
          </div>
          <div class="tiny">C ${num(g.C)} · 调整前 ${regMoney(g.profitNow)} · 调整后 ${regMoney(g.profitPlan)}</div>
        </div>`;
        })
        .join("");
    }
  }
}

/* ── 结果区（两卡 + 分析段 + 一图 + 底部表） ── */
function renderRegResults() {
  const M = regModel();
  if (!M.tableMode) {
    if ($("#reg-d")) $("#reg-d").value = Number.isFinite(M.d) ? M.d.toFixed(3) : "";
    if ($("#reg-c")) $("#reg-c").value = Number.isFinite(M.C) ? M.C.toFixed(4) : "";
    if ($("#reg-pplan")) $("#reg-pplan").value = Number.isFinite(M.Pplan) ? M.Pplan.toFixed(4) : "";
  }

  const prof = M.tableMode ? M.profit(M.Z) : M.profit(M.Z);
  const before = M.profitNow;
  const nGroups = M.tableMode ? M.groups.length : 1;

  /* 卡 ①：调整前 */
  $("#reg-before-value").textContent = regMoney(before);
  $("#reg-before-note").innerHTML = M.tableMode
    ? `Σ（现价 − C组）× 数据货量，共 ${nGroups} 组` +
      `<br/>利润 = ${regMoney(before)}` +
      `<br/>利润率 = ${regMoney(before)} ÷ 现价合计 ${regMoney(M.revenueNow)} = ${regPct(M.rateNow, 2)}`
    : `单公斤利润 = 现价 ${M.P.toFixed(4)} − C ${M.C.toFixed(4)} = ${signOf(M.m)}${Math.abs(M.m).toFixed(4)} 元/kg` +
      `<br/>利润 = ${signOf(M.m)}${Math.abs(M.m).toFixed(4)} × ${regInt(M.Znow)} + ${regInt(M.Bnow)} = ${regMoney(before)}` +
      `<br/>利润率 = ${regMoney(before)} ÷ ${regMoney(M.P * M.Znow + M.Bnow)} = ${regPct(M.rateNow, 2)}`;

  /* 卡 ②：调整后 */
  $("#reg-after-value").textContent = regMoney(prof);
  $("#reg-after-note").innerHTML = M.tableMode
    ? `Σ（计划现价 − C组）× 计划货量，共 ${nGroups} 组` +
      `<br/>利润 = ${regMoney(prof)}` +
      `<br/>利润率 = ${regMoney(prof)} ÷ 计划收入 ${regMoney(M.revenue)} = ${regPct(M.rate, 2)}`
    : `单公斤利润 = 计划现价 ${Number.isFinite(M.Pplan) ? M.Pplan.toFixed(4) : "—"} − C ${M.C.toFixed(4)} = ${
        signOf(M.mPlan)
      }${Math.abs(M.mPlan).toFixed(4)} 元/kg` +
      `<br/>利润 = ${signOf(M.mPlan)}${Math.abs(M.mPlan).toFixed(4)} × ${regInt(M.Z)} + ${regInt(M.B)} = ${regMoney(prof)}` +
      `<br/>利润率 = ${regMoney(prof)} ÷ ${regMoney(M.revenue)} = ${regPct(M.rate, 2)}`;

  /* 调整盈亏情况分析 */
  const advice = $("#reg-advice");
  if (advice) {
    if (!Number.isFinite(prof)) {
      advice.innerHTML = "填完字段与成本，这里给出调整盈亏情况分析。";
    } else if (M.tableMode) {
      advice.innerHTML =
        `调整后的针对计划承诺货量 <b>${regInt(M.Z)} kg</b> 政策盈利为 <b>${regMoney(prof)}</b>。其中：` +
        `折扣盈利 <b>${regMoney(prof)}</b>（${signOf(M.mPlan)}${Math.abs(M.mPlan).toFixed(4)} 元/kg），` +
        `利润率 ${regPct(M.rate, 2)}。` +
        `在计划货量下，1 百分点折扣 ≈ <b>${regMoney(M.onePct)}</b>。`;
    } else {
      const gross = Math.abs(M.priceGap) + Math.abs(M.B);
      const pctText = (v) => (v === null ? "—" : `${v >= 0 ? "" : "−"}${Math.abs(v).toFixed(1)}%`);
      const sGap = gross > 0 ? (M.priceGap / gross) * 100 : null;
      const sFee = gross > 0 ? (M.B / gross) * 100 : null;
      advice.innerHTML =
        `调整后的针对计划承诺货量 <b>${regInt(M.Z)} kg</b> 政策盈利为 <b>${regMoney(prof)}</b>。其中：` +
        `折扣盈利 <b>${regMoney(M.priceGap)}</b>（${signOf(M.mPlan)}${Math.abs(M.mPlan).toFixed(4)} 元/kg，对利润贡献率 ${pctText(
          sGap
        )}），` +
        `杂费盈利 <b>${regMoney(M.B)}</b>（对利润贡献率 ${pctText(sFee)}）。` +
        `在计划货量下，1 百分点折扣 ≈ <b>${regMoney(M.onePct)}</b> 杂费。`;
    }
  }

  const f = $("#reg-formula");
  if (f) {
    f.innerHTML = M.tableMode
      ? "P0 = Σ原价 ÷ Σ结算重量　P = Σ现价 ÷ Σ结算重量　d = P ÷ P0（每组各算一套）" +
        "<br/>C = 车线成本 + 操作成本（每组手填）" +
        "<br/>调整前 利润 = (P − C) × 数据货量；调整后 利润 = (P0·计划折扣 − C) × 计划货量" +
        "<br/>利润率 = 利润 ÷ 收入；本轮不含杂费，价差就是全部利润" +
        "<br/>合计：各组利润、货量、收入分别相加；1 个百分点折扣 = P0 × 计划货量 ÷ 100"
      : "P = P0 × d　m = P − C（单公斤利润）" +
        "<br/>利润 = (P − C) × Z + B　利润率 = 利润 ÷ (P × Z + B)" +
        "<br/>图中的两条线：调整前 L = m·Z + 当前杂费；调整后 L = m调·Z + B";
  }
  const fn = $("#reg-formula-note");
  if (fn) {
    fn.innerHTML = M.tableMode
      ? "表格取数是独立计算：只认你选定的那 6 列字段的全量数据，与分析页的时间范围/筛选无关。"
      : "不亏本 L ≥ 0：给定 Z、B → d ≥ (C − B ÷ Z) ÷ P0；给定 d、B → Z ≤ B ÷ (C − P)；给定 d、Z → B ≥ (C − P) × Z。";
  }

  regDrawTrendLines(M);
  renderRegBottom(M);
}

/** 底部表：手动模式看「不同货量的利润」，表格模式看「按分组的汇算明细」 */
function renderRegBottom(M) {
  const body = $("#reg-concl-body");
  if (!body) return;
  if (M.tableMode) {
    const t = regTableResult();
    $("#reg-concl-title").textContent = "汇算明细（按分组）";
    $("#reg-concl-hint").textContent = `合计货量 ${regInt(t.z)} kg · 计划货量 ${regInt(t.zPlan)} kg`;
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
        <th>分组</th><th class="num">行数</th><th class="num">数据货量</th><th class="num">P0</th><th class="num">P</th>
        <th class="num">折扣</th><th class="num">C</th><th class="num">计划折扣</th><th class="num">计划货量</th>
        <th class="num">调整前</th><th class="num">调整后</th><th class="num">利润率</th>
      </tr></thead>
      <tbody>
        ${t.groups
          .map(
            (g) => `<tr>
          <td>${g.label}</td>
          <td class="num">${g.count}</td>
          <td class="num">${regInt(g.z)}</td>
          <td class="num">${Number.isFinite(g.P0) ? g.P0.toFixed(4) : "—"}</td>
          <td class="num">${Number.isFinite(g.P) ? g.P.toFixed(4) : "—"}</td>
          <td class="num">${regPct(g.d)}</td>
          <td class="num">${g.C.toFixed(4)}</td>
          <td class="num">${regPct(g.dPlan)}</td>
          <td class="num">${regInt(g.zPlan)}</td>
          <td class="num">${regMoney(g.profitNow)}</td>
          <td class="num">${regMoney(g.profitPlan)}</td>
          <td class="num">${regPct(g.ratePlan, 2)}</td>
        </tr>`
          )
          .join("")}
        <tr class="total">
          <td>合计</td>
          <td class="num">${t.groups.reduce((a, g) => a + g.count, 0)}</td>
          <td class="num">${regInt(t.z)}</td>
          <td class="num">${Number.isFinite(t.P0) ? t.P0.toFixed(4) : "—"}</td>
          <td class="num">${Number.isFinite(t.P) ? t.P.toFixed(4) : "—"}</td>
          <td class="num">${regPct(t.d)}</td>
          <td class="num">—</td>
          <td class="num">${regPct(t.dPlan)}</td>
          <td class="num">${regInt(t.zPlan)}</td>
          <td class="num">${regMoney(t.profitNow)}</td>
          <td class="num">${regMoney(t.profitPlan)}</td>
          <td class="num">${regPct(t.revenuePlan !== 0 ? t.profitPlan / t.revenuePlan : NaN, 2)}</td>
        </tr>
      </tbody></table>`;
    return;
  }

  $("#reg-concl-title").textContent = "不同承诺货量下的保本折扣、利润与利润率";
  $("#reg-concl-hint").textContent = "货量越大，保本折扣越接近 C ÷ P0；利润 = (P − C) × Z + B";
  body.innerHTML = `<table class="table">
    <thead><tr>
      <th>相对计划货量</th><th class="num">承诺货量（kg）</th><th class="num">该量下的保本折扣</th>
      <th class="num">中心利润（元）</th><th class="num">利润率</th><th>判定</th>
    </tr></thead>
    <tbody>${regSteps(M)
      .map(({ tag, z }) => {
        const p = M.profit(z);
        const rev = M.Pplan * z + M.B;
        const rate = rev !== 0 ? p / rev : NaN;
        const need = M.P0 > 0 && z > 0 ? (M.C - M.B / z) / M.P0 : NaN;
        const judge =
          p > 1e-9
            ? M.mPlan < 0
              ? '<span class="chip" style="color:var(--color-warning)">盈利（B 兜底）</span>'
              : '<span class="chip chip-ok">盈利</span>'
            : p < -1e-9
              ? '<span class="chip" style="color:var(--color-danger)">亏损</span>'
              : '<span class="chip">持平</span>';
        return `<tr>
          <td>${tag}</td>
          <td class="num">${Math.round(z).toLocaleString("zh-CN")}</td>
          <td class="num">${Number.isFinite(need) ? regPct(need) : "—"}</td>
          <td class="num">${regMoney(p)}</td>
          <td class="num">${regPct(rate, 2)}</td>
          <td>${judge}</td>
        </tr>`;
      })
      .join("")}</tbody></table>`;
}
