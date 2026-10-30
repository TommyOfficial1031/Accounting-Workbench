// 盈亏平衡页 · UI 逻辑断言（用桩 DOM 执行页面里的真实代码 + 真实演示数据）
const fs = require("fs");
const html = fs.readFileSync("_proto/shell-demo.html", "utf8");

const region = (name) => {
  const open = `/* #region ${name}`;
  const close = `/* #endregion ${name} */`;
  const a = html.indexOf(open);
  const b = html.indexOf(close, a);
  if (a < 0 || b < 0) throw new Error("region 缺失: " + name);
  return html.slice(html.indexOf("\n", a) + 1, b);
};
const START = "/* ═══════════════════ 盈亏平衡与折扣分析 ═══════════════════ */";
const END = "/* ═══════════════════ 设置 ═══════════════════ */";
const i = html.indexOf(START);
const j = html.indexOf(END, i);
if (i < 0 || j < 0) throw new Error("找不到区块标记");
const code = html.slice(i, j);
const fixtures = region("fixtures");

function hashStr(text) {
  let h = 2166136261 >>> 0;
  for (let k = 0; k < text.length; k += 1) {
    h ^= text.charCodeAt(k);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed;
  return function next() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const defaults = {};
for (const m of html.matchAll(/id="(reg-[a-z0-9-]+)"[^>]*value="([^"]*)"/g)) defaults[m[1]] = m[2];

function makeDom() {
  const store = new Map();
  const el = (sel) => {
    if (!store.has(sel)) {
      store.set(sel, {
        sel,
        value: defaults[sel.replace(/^#/, "")] ?? "0",
        textContent: "",
        innerHTML: "",
        hidden: false,
        title: "",
        classList: { toggle() {}, add() {}, remove() {} },
        addEventListener() {},
        querySelector: () => ({ textContent: "" }),
        querySelectorAll: () => [],
        get nextElementSibling() { return { hidden: false, textContent: "" }; }
      });
    }
    return store.get(sel);
  };
  return { store, $: el, $$: () => [] };
}

function boot(opts = {}) {
  const dom = makeDom();
  const factory = new Function(
    "$", "$$", "document", "hideCtx", "toast",
    hashStr.toString() + "\n" + mulberry32.toString() + "\n" + fixtures + "\n" + code +
      "\n; return { renderRegression, REG, REG_TABLE, regModel, regTableResult, regProvCandidates, regCommitPicks, regAdviceText, regExportFolderName, regExportParts, regExportFileList, regZipStore, regPdfFromJpeg, regXlsxFromGroups, regXlsxRows, DEMO_ROWS };"
  );
  const api = factory(dom.$, opts.$$ || dom.$$, { addEventListener() {} }, () => {}, () => {});
  return { dom, api };
}

let fails = 0;
function ok(name, cond, extra = "") {
  if (cond) console.log("  PASS  " + name);
  else { fails++; console.log("  FAIL  " + name + (extra ? "  -> " + extra : "")); }
}
const txt = (dom, sel) => {
  const e = dom.store.get(sel);
  return e ? String(e.innerHTML || e.textContent || "") : "";
};
const plain = (s) => s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const money = (v) => (v < 0 ? "-¥" : "¥") + Math.round(Math.abs(v)).toLocaleString("zh-CN");
const regMoneyLike = (v) => money(Number.isFinite(v) ? v : 0);

console.log("== 面板：顺序与默认 ==");
{
  ok("分段控件顺序 = 表格取数 | 手动输入",
    html.indexOf('data-mode="table"') < html.indexOf('data-mode="manual"') &&
      html.indexOf('data-mode="table"') > html.indexOf('id="reg-mode"'));
  ok("表格取数按钮默认 on", /data-mode="table"[^>]*class="on"|class="segmented" id="reg-mode"><button class="on" data-mode="table"/.test(html));
  ok("手动面板默认隐藏", /<div id="reg-manual" hidden>/.test(html));
  ok("表格面板默认显示", /<div id="reg-table">/.test(html));
  const { api } = boot();
  ok("REG.mode 默认 table", api.REG.mode === "table", api.REG.mode);
}

console.log("== 表格模式：未勾取值 → 一张合计卡片 ==");
{
  const { dom, api } = boot();
  api.renderRegression();
  const t = api.regTableResult();
  ok("默认只有一张卡片", t.groups.length === 1 && t.groups[0].label === "全部", `${t.groups.length} / ${t.groups[0].label}`);
  ok("统计行说明「未勾取值，合成合计一行」",
    plain(txt(dom, "#reg-group-stats")).includes("未勾取值，合成合计一行"), plain(txt(dom, "#reg-group-stats")));
  ok("统计行给出命中行数与卡片数",
    plain(txt(dom, "#reg-group-stats")).includes(`命中 ${api.DEMO_ROWS.length} 行`) &&
      plain(txt(dom, "#reg-group-stats")).includes("1 张卡片"), plain(txt(dom, "#reg-group-stats")));
  ok("自动填充卡片 = 每组一张", (txt(dom, "#reg-auto").match(/reg-auto-card/g) || []).length === t.groups.length);

  const g = t.groups[0];
  const rows = api.DEMO_ROWS;
  const z = rows.reduce((a, r) => a + Number(r["结算重量"]), 0);
  const price = rows.reduce((a, r) => a + Number(r["现价"]), 0);
  const orig = rows.reduce((a, r) => a + Number(r["原价"]), 0);
  ok("组 P0 = Σ原价 ÷ Σ结算重量", Math.abs(g.P0 - orig / z) < 1e-9, `${g.P0} vs ${orig / z}`);
  ok("组 P = Σ现价 ÷ Σ结算重量", Math.abs(g.P - price / z) < 1e-9);
  ok("组折扣 = P ÷ P0", Math.abs(g.d - g.P / g.P0) < 1e-12);
  ok("默认 C = 0 车线 + 0.08 操作", Math.abs(g.C - 0.08) < 1e-12, String(g.C));
  ok("调整前 = (P − C) × 数据货量", Math.abs(g.profitNow - (g.P - g.C) * g.z) < 1e-9);
  ok("没填四个值 → filled = false、调整后为 NaN", g.filled === false && Number.isNaN(g.profitPlan), `${g.filled} / ${g.profitPlan}`);
  ok("计划折扣/计划货量先取当前折扣与数据货量作提示",
    Math.abs(g.dPlan - g.d) < 1e-12 && Math.abs(g.zPlan - g.z) < 1e-9);

  ok("卡片显示 原价/现价/折扣（只读）", /原价\s*<b>0\.\d{4}<\/b>/.test(txt(dom, "#reg-auto")) && txt(dom, "#reg-auto").includes("现价 <b>"));
  ok("卡片含 4 个可填字段",
    (txt(dom, "#reg-auto").match(/data-reg-g="/g) || []).length === t.groups.length * 4,
    String((txt(dom, "#reg-auto").match(/data-reg-g="/g) || []).length));
  ok("输入框默认值只作 placeholder（value 为空）",
    /data-reg-g="cLine" value="" placeholder="0\.0000"/.test(txt(dom, "#reg-auto")), (txt(dom, "#reg-auto").match(/data-reg-g="cLine"[^>]*/) || [""])[0]);

  ok("卡① 用合计口径（Σ 组）", plain(txt(dom, "#reg-before-note")).includes("Σ（现价 − C组）× 数据货量"), plain(txt(dom, "#reg-before-note")));
  ok("卡① 值 = 各组调整前之和", plain(txt(dom, "#reg-before-value")) === money(t.profitNow), plain(txt(dom, "#reg-before-value")));
  ok("没填值时卡② 显示 —", plain(txt(dom, "#reg-after-value")) === "—", plain(txt(dom, "#reg-after-value")));
  ok("分析段提示先填四个值（已填 0 / 1 组）",
    plain(txt(dom, "#reg-advice")).includes("填完每张卡片的四个值") && plain(txt(dom, "#reg-advice")).includes("已填 0 / 1 组"),
    plain(txt(dom, "#reg-advice")));
}

console.log("== 表格模式：填完四个值 → 出调整后结果 ==");
{
  const { dom, api } = boot();
  api.renderRegression();
  const key = api.regTableResult().groups[0].label;
  api.REG_TABLE.g[key] = { cLine: 0.2, opCost: 0.05, dPlan: 0.6, zPlan: 5000 };
  api.renderRegression();
  const t = api.regTableResult();
  const g = t.groups[0];
  ok("filled = true", g.filled === true);
  ok("调整后 = (P0×0.6 − 0.25) × 5000", Math.abs(g.profitPlan - (g.P0 * 0.6 - 0.25) * 5000) < 1e-9, String(g.profitPlan));
  ok("卡② 出值（= 调整后合计）", plain(txt(dom, "#reg-after-value")) === money(t.profitPlan), plain(txt(dom, "#reg-after-value")));
  ok("分析段套模板（不含杂费）",
    plain(txt(dom, "#reg-advice")).includes("政策盈利为") && !plain(txt(dom, "#reg-advice")).includes("杂费盈利"),
    plain(txt(dom, "#reg-advice")));
  ok("分析段含利润率与 1 百分点换算",
    plain(txt(dom, "#reg-advice")).includes("利润率") && plain(txt(dom, "#reg-advice")).includes("1 百分点折扣 ≈"),
    plain(txt(dom, "#reg-advice")));
  ok("汇算表该行出调整后与利润率", txt(dom, "#reg-concl-body").includes(regMoneyLike(t.profitPlan)),
    txt(dom, "#reg-concl-body").slice(0, 120));
}

console.log("== 表格模式：勾选值 = 组合展开（3 网点 × 2 公斤段 × 2 省份 = 12 张）==");
{
  const { dom, api } = boot();
  const nets = [...new Set(api.DEMO_ROWS.map((r) => String(r["寄件所属一级网点"])))].slice(0, 3);
  const allBands = [...new Set(api.DEMO_ROWS.map((r) => String(r["公斤段"])))];
  const bands = allBands.slice(0, 2);
  const allProvs = [...new Set(api.DEMO_ROWS.map((r) => String(r["目的所属省份"])))];
  const provs = allProvs.slice(0, 2);
  api.REG_TABLE.picks = { net: nets, band: bands, prov: provs };
  api.renderRegression();
  const t = api.regTableResult();
  ok("组合数 = 3×2×2 = 12", t.groups.length === 12, String(t.groups.length));
  const expect = [];
  nets.forEach((n) => bands.forEach((b) => provs.forEach((p) => expect.push(`${n} · ${b} · ${p}`))));
  ok("卡片按 网点 → 公斤段 → 省份 的顺序展开", JSON.stringify(t.groups.map((g) => g.label)) === JSON.stringify(expect),
    t.groups.map((g) => g.label).slice(0, 3).join(" | "));
  const probe = t.groups[0];
  const rows = api.DEMO_ROWS.filter(
    (r) => String(r["寄件所属一级网点"]) === nets[0] && String(r["公斤段"]) === bands[0] && String(r["目的所属省份"]) === provs[0]
  );
  ok("每组只取该组合的行", probe.count === rows.length, `${probe.count} vs ${rows.length}`);
  ok("12 张卡片都渲染出来", (txt(dom, "#reg-auto").match(/reg-auto-card/g) || []).length === 12);
  ok("统计行给出维度项数", plain(txt(dom, "#reg-group-stats")).includes("3 项") && plain(txt(dom, "#reg-group-stats")).includes("2 项"),
    plain(txt(dom, "#reg-group-stats")));
}

console.log("== 表格模式：改某组的 4 个手填字段 ==");
{
  const { dom, api } = boot();
  api.renderRegression();
  const key = api.regTableResult().groups[0].label;
  api.REG_TABLE.g[key] = { cLine: 0.2, opCost: 0.05, dPlan: 0.6, zPlan: 5000 };
  api.renderRegression();
  const g = api.regTableResult().groups[0];
  ok("车线 + 操作 → C = 0.25", Math.abs(g.C - 0.25) < 1e-12, String(g.C));
  ok("C 变了 → 调整前利润 = (P − 0.25) × 货量", Math.abs(g.profitNow - (g.P - 0.25) * g.z) < 1e-9);
  ok("计划折扣 → 计划现价 = P0 × 0.6", Math.abs(g.Pplan - g.P0 * 0.6) < 1e-12);
  ok("计划货量生效", Math.abs(g.zPlan - 5000) < 1e-9);
  ok("调整后利润 = (计划现价 − C) × 5000", Math.abs(g.profitPlan - (g.Pplan - 0.25) * 5000) < 1e-9);
  ok("合计计划货量跟着变", Math.abs(api.regTableResult().zPlan - (5000 + api.regTableResult().groups.slice(1).reduce((a, x) => a + x.zPlan, 0))) < 1e-9);
  ok("汇算表里出现该组的计划货量 5,000", txt(dom, "#reg-concl-body").includes("5,000"));
}

console.log("== 分组筛选：勾选后立刻出卡片（回归：checkbox.value 是 \"on\" 的 bug）==");
{
  const { dom, api } = boot();
  const net = String(api.DEMO_ROWS[0]["寄件所属一级网点"]);
  api.regCommitPicks("net", [net]);
  ok("勾选值按真实取值存下来（不是 on）",
    JSON.stringify(api.REG_TABLE.picks.net) === JSON.stringify([net]), JSON.stringify(api.REG_TABLE.picks.net));
  const t = api.regTableResult();
  ok("勾了一个网点 → 1 张卡片且命中行数 > 0", t.groups.length === 1 && t.groups[0].count > 0, `${t.groups.length} / ${t.groups[0].count}`);
  ok("卡片标签 = 该网点", t.groups[0].label === net, t.groups[0].label);
  ok("自动填充出现卡片", (txt(dom, "#reg-auto").match(/reg-auto-card/g) || []).length === 1);
  ok("按钮里显示的是取值 chip（不是 on）",
    txt(dom, "#reg-group-rows").includes(`>${net}<`) && !txt(dom, "#reg-group-rows").includes(">on<"),
    (txt(dom, "#reg-group-rows").match(/chip chip-ok">([^<]*)</g) || [""]).join(","));
  ok("统计行命中行数 > 0", !plain(txt(dom, "#reg-group-stats")).includes("命中 0 行"), plain(txt(dom, "#reg-group-stats")));
  ok("卡① 有值（不是 ¥0）", plain(txt(dom, "#reg-before-value")) !== "¥0", plain(txt(dom, "#reg-before-value")));
}

console.log("== 表格模式：级联 ==");
{
  const { api } = boot();
  const nets = [...new Set(api.DEMO_ROWS.map((r) => String(r["寄件所属一级网点"])))];
  const net = nets[0];
  api.REG_TABLE.picks.net = [net];
  const provs = api.regProvCandidates();
  const covered = [...new Set(api.DEMO_ROWS.filter((r) => String(r["寄件所属一级网点"]) === net).map((r) => String(r["目的所属省份"])))];
  ok("省份候选 = 该网点覆盖的省份", provs.length === covered.length && covered.every((p) => provs.includes(p)), `${provs.length} vs ${covered.length}`);
  api.renderRegression();
  const t = api.regTableResult();
  ok("只勾一个网点 → 一张卡片且货量 = 该网点", t.groups.length === 1 && Math.abs(t.groups[0].z - api.DEMO_ROWS.filter((r) => String(r["寄件所属一级网点"]) === net).reduce((a, r) => a + Number(r["结算重量"]), 0)) < 1e-6,
    String(t.groups.length));
  ok("组标签只含已勾维度", t.groups[0].label === net, t.groups[0].label);
}

console.log("== 表格模式：多维度分组（金东三部 · 安徽省 · 0-60）==");
{
  const { dom, api } = boot();
  const nets = [...new Set(api.DEMO_ROWS.map((r) => String(r["寄件所属一级网点"])))];
  const net = nets[0];
  const prov = String(api.DEMO_ROWS.find((r) => String(r["寄件所属一级网点"]) === net)["目的所属省份"]);
  const band = String(api.DEMO_ROWS.find((r) => String(r["寄件所属一级网点"]) === net)["公斤段"]);
  api.REG_TABLE.picks = { net: [net], band: [band], prov: [prov] };
  api.renderRegression();
  const t = api.regTableResult();
  const rows = api.DEMO_ROWS.filter(
    (r) => String(r["寄件所属一级网点"]) === net && String(r["目的所属省份"]) === prov && String(r["公斤段"]) === band
  );
  ok("三条件并集只命中一组", t.groups.length === 1, String(t.groups.length));
  ok("组标签是三个维度拼接", t.groups[0].label === `${net} · ${band} · ${prov}`, t.groups[0].label);
  const z = rows.reduce((a, r) => a + Number(r["结算重量"]), 0);
  const pr = rows.reduce((a, r) => a + Number(r["现价"]), 0);
  const og = rows.reduce((a, r) => a + Number(r["原价"]), 0);
  ok("P = Σ现价 ÷ Σ结算重量（该组合）", Math.abs(t.groups[0].P - pr / z) < 1e-9);
  ok("P0 = Σ原价 ÷ Σ结算重量（该组合）", Math.abs(t.groups[0].P0 - og / z) < 1e-9);
}

console.log("== 表格模式：图与底部表 ==");
{
  const { dom, api } = boot();
  api.REG_TABLE.picks = { net: [], band: [], prov: [] };
  api.renderRegression();
  const grid = txt(dom, "#reg-charts");
  ok("图区用三列网格", String(dom.store.get("#reg-charts").className || "").includes("grid3"), String(dom.store.get("#reg-charts").className));
  ok("一张卡片一张小图",
    (grid.match(/class="card-soft reg-mini"/g) || []).length === api.regTableResult().groups.length,
    String((grid.match(/class="card-soft reg-mini"/g) || []).length));
  ok("未填值时小图只有虚线（调整前）",
    grid.includes('stroke-dasharray="6 4"') && !grid.includes('stroke-width="2.2"'));
  ok("每张小图都能双击放大（带 data-zoom）", (grid.match(/data-zoom="/g) || []).length === api.regTableResult().groups.length);
  ok("每张小图带图例（data-zoom-legend）", (grid.match(/data-zoom-legend/g) || []).length === api.regTableResult().groups.length);
  ok("每张小图都带 X / Y 轴标签", (grid.match(/货量（kg）/g) || []).length === api.regTableResult().groups.length && (grid.match(/利润（元）/g) || []).length === api.regTableResult().groups.length);
  ok("未填值时图例写「调整后：填完四个值后显示」", plain(grid).includes("调整后：填完四个值后显示"),
    plain(grid.match(/<div class="reg-mini-legend"[^>]*>([\s\S]*?)<\/div>/)[1]));
  const firstSvg = grid.match(/<svg[\s\S]*?<\/svg>/)[0];
  const ticks = [...firstSvg.matchAll(/text-anchor="(?:start|middle|end)">([\d,]+)<\/text>/g)].map((m) => Number(m[1].replace(/,/g, "")));
  ok("X 刻度不从 0 起（围绕计算点取范围）", ticks.length > 0 && Math.min(...ticks) > 0, JSON.stringify(ticks));
  ok("汇算表有分组列与合计行",
    txt(dom, "#reg-concl-body").includes("分组") && txt(dom, "#reg-concl-body").includes("合计"));
  ok("汇算表不再有杂费列", !txt(dom, "#reg-concl-body").includes("杂费"));
  ok("汇算表没有「行数」列", !txt(dom, "#reg-concl-body").includes("<th class=\"num\">行数</th>"));
  ok("利润率后面有「判定」列", /利润率<\/th><th>判定<\/th>/.test(txt(dom, "#reg-concl-body")));
  ok("未填值行的判定写「待填值」", txt(dom, "#reg-concl-body").includes("待填值"));
}

console.log("== 表格模式：填完四个值后，小图出现实线与两条参考线 ==");
{
  const { dom, api } = boot();
  api.REG_TABLE.picks = { net: [], band: [], prov: [] };
  api.renderRegression();
  const key = api.regTableResult().groups[0].label;
  api.REG_TABLE.g[key] = { cLine: 0.2, opCost: 0.05, dPlan: 0.7, zPlan: 600 };
  api.renderRegression();
  const grid = txt(dom, "#reg-charts");
  ok("出现调整后实线", grid.includes('stroke-width="2.2"'));
  ok("出现基准盈利参考线（红色虚线）",
    grid.includes('stroke="var(--color-danger)" stroke-width="1.2" stroke-dasharray="5 3"') && grid.includes("基准盈利线"));
  ok("出现计划承诺货量参考线（灰色虚线）",
    /stroke="var\(--color-text-secondary\)" stroke-width="1.1" stroke-dasharray="4 3"/.test(grid) && grid.includes("计划货量 600"),
    (grid.match(/计划货量[^<]*/) || [""])[0]);
  ok("图例出调整后利润", /调整后 -?¥[\d,]+\s*（-?[\d.]+%）/.test(plain(grid)), plain(grid.match(/<div class="reg-mini-legend"[^>]*>([\s\S]*?)<\/div>/)[1]));
  ok("汇算表该行判定为 盈利/亏损/持平 之一", /<span class="chip[^>]*">(盈利|亏损|持平)<\/span>/.test(txt(dom, "#reg-concl-body")));
}

console.log("== 分组筛选：每个字段一个下拉勾选窗口 ==");
{
  const { dom, api } = boot();
  api.renderRegression();
  const rowsHtml = txt(dom, "#reg-group-rows");
  ok("三个维度各有一个下拉按钮",
    (rowsHtml.match(/class="reg-dim-values"/g) || []).length === 3, String((rowsHtml.match(/class="reg-dim-values"/g) || []).length));
  ok("不再有「分组」勾选框（勾值即拆卡）", !rowsHtml.includes("data-reg-group"));
  ok("下拉按钮绑定取值键", ["net", "band", "prov"].every((k) => rowsHtml.includes(`data-reg-pick="${k}"`)));
  ok("下拉按钮右侧有 caret", rowsHtml.includes("reg-dim-caret"));
  ok("取值区显示当前值 chip（默认全部）", (rowsHtml.match(/>全部</g) || []).length === 3);
}

console.log("== 缺字段时给提示而不是崩 ==");
{
  const { dom, api } = boot();
  api.DEMO_ROWS.forEach((row) => { row["原价"] = ""; });
  let threw = null;
  try { api.renderRegression(); } catch (e) { threw = e; }
  ok("缺字段不抛异常", threw === null, threw ? threw.message : "");
  ok("统计行提示缺字段", plain(txt(dom, "#reg-group-stats")).includes("缺少字段"), plain(txt(dom, "#reg-group-stats")));
  ok("自动填充提示缺字段", plain(txt(dom, "#reg-auto")).includes("缺少字段"), plain(txt(dom, "#reg-auto")));
  ok("汇算表提示缺字段", plain(txt(dom, "#reg-concl-body")).includes("缺少字段"));
}

console.log("== 手动输入模式：仍然含杂费 ==");
{
  const { dom, api } = boot();
  api.REG.mode = "manual";
  dom.store.get("#reg-znow").value = "150000";
  dom.store.get("#reg-p0").value = "0.5";
  dom.store.get("#reg-p").value = "0.3";
  dom.store.get("#reg-bnow").value = "3000";
  dom.store.get("#reg-cline").value = "0.2";
  dom.store.get("#reg-opcost").value = "0.15";
  dom.store.get("#reg-dplan").value = "0.6";
  dom.store.get("#reg-b").value = "3000";
  dom.store.get("#reg-z").value = "150000";
  api.renderRegression();
  ok("手动模式 C = 0.3500", dom.store.get("#reg-c").value === "0.3500", dom.store.get("#reg-c").value);
  ok("卡① = -¥4,500", plain(txt(dom, "#reg-before-value")) === "-¥4,500", plain(txt(dom, "#reg-before-value")));
  ok("卡① 计算过程含 B当前", plain(txt(dom, "#reg-before-note")).includes("+ 3,000"), plain(txt(dom, "#reg-before-note")));
  ok("卡② = -¥4,500", plain(txt(dom, "#reg-after-value")) === "-¥4,500", plain(txt(dom, "#reg-after-value")));
  ok("分析段含杂费盈利", plain(txt(dom, "#reg-advice")).includes("杂费盈利"), plain(txt(dom, "#reg-advice")));
  ok("分析段含贡献率", plain(txt(dom, "#reg-advice")).includes("对利润贡献率"), plain(txt(dom, "#reg-advice")));
  ok("图是单组两条线（有起点/竖线标注）",
    txt(dom, "#reg-chart").includes("基准盈利参考线") && txt(dom, "#reg-chart").includes("计划承诺货量"));
  ok("底部表是货量倍数表", txt(dom, "#reg-concl-body").includes("相对计划货量"));
}

console.log("== 图内标签不互压（表格模式 10 组 / 手动模式）==");
{
  const items = (svg) =>
    [...svg.matchAll(/<text([^>]*)>([^<]*)<\/text>/g)]
      .filter((m) => !m[1].includes("transform"))
      .map((m) => {
        const attr = m[1];
        const x = Number((attr.match(/x="([-\d.]+)"/) || [0, 0])[1]);
        const y = Number((attr.match(/y="([-\d.]+)"/) || [0, 0])[1]);
        const size = Number((attr.match(/font-size="([\d.]+)"/) || [0, 11])[1]);
        const anchor = (attr.match(/text-anchor="(\w+)"/) || [0, "start"])[1];
        const text = m[2];
        let bw = 0;
        for (const ch of text) bw += /[\u2E80-\u9FFF\uFF00-\uFFEF]/.test(ch) ? size : size * 0.55;
        const x0 = anchor === "end" ? x - bw : anchor === "middle" ? x - bw / 2 : x;
        return { text, x0, x1: x0 + bw, y0: y - size, y1: y };
      });
  const hitsOf = (svg) => {
    const list = items(svg);
    const hits = [];
    for (let a = 0; a < list.length; a += 1) {
      for (let b = a + 1; b < list.length; b += 1) {
        const A = list[a], B = list[b];
        if (Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0) > 2 && Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0) > 2) {
          hits.push(`${A.text} <> ${B.text}`);
        }
      }
    }
    return hits;
  };
  const { dom, api } = boot();
  api.renderRegression();
  ok("表格模式（10 组）标签不互压", hitsOf(txt(dom, "#reg-chart")).length === 0, hitsOf(txt(dom, "#reg-chart")).join(" | "));

  api.REG.mode = "manual";
  dom.store.get("#reg-znow").value = "100000";
  dom.store.get("#reg-p0").value = "0.4";
  dom.store.get("#reg-p").value = "0.32";
  dom.store.get("#reg-bnow").value = "3000";
  dom.store.get("#reg-cline").value = "0.25";
  dom.store.get("#reg-opcost").value = "0.08";
  dom.store.get("#reg-dplan").value = "0.6";
  dom.store.get("#reg-b").value = "1500";
  dom.store.get("#reg-z").value = "120000";
  api.renderRegression();
  ok("手动模式标签不互压", hitsOf(txt(dom, "#reg-chart")).length === 0, hitsOf(txt(dom, "#reg-chart")).join(" | "));
}

console.log("== 导出：小图取数（回归：曾用 $ 取不到 NodeList）==");
{
  /* 渲染完再把真实 HTML 喂给假的 $$，模拟浏览器里的 NodeList */
  let chartHtml = "";
  const fakeQuery = (sel) => {
    const n = (chartHtml.match(/class="card-soft reg-mini"/g) || []).length;
    if (sel.includes("reg-mini-box svg")) return Array.from({ length: n }, (_, i) => ({ idx: i }));
    if (sel.includes("reg-mini-title")) return Array.from({ length: n }, (_, i) => ({ textContent: `组${i + 1}` }));
    if (sel.includes("reg-mini-legend"))
      return Array.from({ length: n }, () => ({
        textContent: "调整前 ¥1 调整后 ¥2",
        querySelectorAll: () => [
          { textContent: "调整前 ¥1", style: { color: "#0071e3" }, querySelector: (q) => (q === "i.dash" ? {} : null) },
          { textContent: "调整后 ¥2", style: { color: "#0071e3" }, querySelector: () => null }
        ]
      }));
    return [];
  };
  const { dom, api } = boot({ $$: fakeQuery });
  api.REG_TABLE.picks = { net: ["金东三部"], band: [], prov: [] };
  api.renderRegression();
  chartHtml = txt(dom, "#reg-charts");
  const parts = api.regExportParts();
  const t = api.regTableResult();
  ok("表格模式取到全部小图（数量 = 卡片数）", parts.length === t.groups.length, `${parts.length} vs ${t.groups.length}`);
  ok("每张图带上标题", parts.every((p) => typeof p.title === "string" && p.title.length > 0), parts.map((p) => p.title).join(","));
  ok("每张图带上图例", parts.every((p) => typeof p.legend === "string" && p.legend.length > 0));
  ok(
    "图例带线段样式（调整前虚线 / 调整后实线）",
    parts.every(
      (p) =>
        Array.isArray(p.legendItems) &&
        p.legendItems.length === 2 &&
        p.legendItems[0].dash === true &&
        p.legendItems[1].dash === false &&
        p.legendItems.every((item) => item.color && item.label)
    ),
    JSON.stringify(parts[0] && parts[0].legendItems)
  );

  api.REG.mode = "manual";
  api.renderRegression();
  const manualParts = api.regExportParts();
  ok("手动模式退回单张图", manualParts.length === 1, String(manualParts.length));
  api.REG.mode = "table";
}

console.log("== 导出：一个按钮、一个文件夹、4 类文件 ==");
{
  const { api } = boot();
  ok("页头只剩一个「导出」按钮", html.includes('id="reg-export-btn"') && !html.includes('data-export="nop"'));
  ok("按钮文案 = 导出", /id="reg-export-btn">导出</.test(html));

  api.REG_TABLE.picks = { net: [], band: [], prov: [] };
  api.renderRegression();
  const folder = api.regExportFolderName(new Date(2026, 9, 22, 14, 30));
  ok("文件夹名：全部 + 标题 + 时间戳", folder === "全部盈亏平衡与折扣分析 - 2026-10-22 14：30", folder);

  api.REG_TABLE.picks = { net: ["金东三部"], band: ["0-60"], prov: ["安徽省"] };
  api.renderRegression();
  const folder2 = api.regExportFolderName(new Date(2026, 0, 3, 9, 5));
  ok("文件夹名带勾选值（· 分隔）",
    folder2 === "金东三部 · 0-60 · 安徽省盈亏平衡与折扣分析 - 2026-01-03 09：05", folder2);
  ok("手动模式文件夹名前缀 = 手动测算", (() => {
    api.REG.mode = "manual";
    const name = api.regExportFolderName(new Date(2026, 0, 3, 9, 5));
    api.REG.mode = "table";
    return name.startsWith("手动测算");
  })());

  const M2 = api.regModel();
  const list = api.regExportFileList(M2);
  ok("清单 = 1 PDF + 1 网格 JPEG + N 小图 + 1 XLSX", list.length === M2.groups.length + 3, String(list.length));
  ok("PDF 文件名", list[0].name === "盈亏平衡与折扣分析.pdf", list[0].name);
  ok("网格 JPEG 文件名", list[1].name === "小图网格.jpg", list[1].name);
  ok("单张小图按序号命名", list[2].name === "小图-01-金东三部 · 0-60 · 安徽省.jpg", list[2].name);
  ok("XLSX 文件名", list[list.length - 1].name === "汇算明细表.xlsx", list[list.length - 1].name);

  const zip = api.regZipStore([
    { name: "a.txt", data: new TextEncoder().encode("hello") },
    { name: "b/c.txt", data: new TextEncoder().encode("world") }
  ]);
  ok("ZIP 以 PK 开头", String.fromCharCode(zip[0], zip[1]) === "PK");
  const zipText = Buffer.from(zip).toString("latin1");
  ok("ZIP 含文件名与 EOCD", zipText.includes("a.txt") && zipText.includes("b/c.txt") && zipText.includes("PK\u0005\u0006"));

  const pdf = api.regPdfFromJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), 1200, 900);
  const pdfText = Buffer.from(pdf).toString("latin1");
  ok("PDF 头 / 尾正确", pdfText.startsWith("%PDF-1.4") && pdfText.trimEnd().endsWith("%%EOF"));
  ok("PDF 内嵌 JPEG（DCTDecode + MediaBox）",
    pdfText.includes("/DCTDecode") && pdfText.includes("/MediaBox [0 0 1200 900]"));
  const xrefAt = Number(pdfText.slice(pdfText.lastIndexOf("startxref") + 9).trim().split("\n")[0]);
  ok("startxref 指向 xref 表", pdfText.slice(xrefAt, xrefAt + 4) === "xref", String(xrefAt));

  const xlsx = api.regXlsxFromGroups(M2);
  const xlsxRaw = Buffer.from(xlsx);
  ok("XLSX 是 ZIP 容器", String.fromCharCode(xlsx[0], xlsx[1]) === "PK");
  const xlsxNames = xlsxRaw.toString("latin1");
  ok("XLSX 含 workbook 与 sheet", xlsxNames.includes("xl/workbook.xml") && xlsxNames.includes("xl/worksheets/sheet1.xml"));
  const xlsxXml = xlsxRaw.toString("utf8");
  ok("XLSX 表头用新字段名", ["原价", "现价", "成本", "判定"].every((k) => xlsxXml.includes(k)),
    (xlsxXml.match(/原价|现价|成本|判定/g) || []).join(","));
  const rows = api.regXlsxRows(M2);
  ok("XLSX 有合计行", rows[rows.length - 1][0] === "合计", String(rows[rows.length - 1][0]));
  ok("XLSX 带标题行「汇算明细表」", xlsxXml.includes("汇算明细表"));
  ok("XLSX 折扣等列用百分比格式", xlsxXml.includes('numFmtId="164"') && xlsxXml.includes('formatCode="0.0%"'));
  ok("导出弹窗支持勾选文件", html.includes("data-exp-pick") && html.includes("reg-exp-row"));
  /* 填满四个值后再看分析文案 */
  const gk = api.regTableResult().groups[0].label;
  api.REG_TABLE.g[gk] = { cLine: 0.2, opCost: 0.05, dPlan: 0.7, zPlan: 600 };
  api.renderRegression();
  const adv = api.regAdviceText(api.regModel());
  ok("分析文案有 html / plain 两版", adv.html.includes("<b>") && !adv.plain.includes("<b>"), adv.plain.slice(0, 40));
  ok("分析文案含政策盈利与利润率", adv.plain.includes("政策盈利为") && adv.plain.includes("利润率"), adv.plain.slice(0, 60));
}

console.log("== 细节修正：图例配色 / X 轴勾选 / 放大层 / 页头按钮 / toast ==");
{
  ok("小图调色板用真实色值（canvas 能画）", html.includes('const PALETTE = ["#0071e3"'), html.slice(html.indexOf("const PALETTE"), html.indexOf("const PALETTE") + 60));
  ok("调色板里不再有 var(--…)", !/const PALETTE = \[[^\]]*var\(--/.test(html));
  ok("X 轴勾选读 dataset.xvalue（不是 .value）", html.includes("[data-xvalue]") && html.includes("box.dataset.xvalue"));
  ok("页头有「返回表格」并已绑定", html.includes('id="reg-back-table"') && html.includes("regBackTable"));
  ok("toast 改为上方居中", html.includes("top: 14px; left: 50%; transform: translateX(-50%); z-index: 300"));
  ok("放大层支持多图", html.includes("const svgs = [...box.querySelectorAll(\"svg\")];") && html.includes("chart-zoom-grid"));
  ok("放大层带图例（含 .chart-legend）", html.includes(".reg-mini-legend, .chart-legend"));
  ok("放大层清掉原图尺寸限制", html.includes('clone.removeAttribute("style")') && html.includes('preserveAspectRatio", "xMidYMid meet'));
  ok("PDF 调整后括号写利润率", html.includes("（利润率 ${regPct(M.rate, 2)}）"));
  ok("拆分/合并按钮推到右边", html.includes('<span style="flex:1"></span>${type === "pie" ? "" : splitChips}'));
}

console.log("== 排序口径：项目管理按创建时间 / 历史记录按最后保存 ==");
{
  ok("项目管理按创建时间倒序", html.includes('String(b.created).localeCompare(String(a.created))'));
  ok("历史记录按最后保存时间倒序", html.includes("const items = [...PROJECTS].sort((a, b) => String(b.saved).localeCompare(String(a.saved)));"));
  ok("每条项目都带最后保存时间", (html.match(/saved:"/g) || []).length === 10, String((html.match(/saved:"/g) || []).length));
  ok("历史记录条目显示最后保存时间", html.includes("最后保存 ${p.saved}"));
  ok("项目管理仍显示最近打开", html.includes("${p.opened}"));
  ok("两个页面的副标题点明排序口径", html.includes("按创建时间排序") && html.includes("按最后保存时间排序"));
}

console.log(fails === 0 ? "\nALL_UI_PASSED" : `\nUI_FAILED (${fails})`);
process.exit(fails === 0 ? 0 : 1);
