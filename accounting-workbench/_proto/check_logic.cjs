// 抽取分析引擎与看板引擎，在 node 里跑真实计算并核对数值（条件即维度版）。
// 抽取边界由 HTML 里的显式标记决定：
//   /* #region fixtures —— ... */   ... /* #endregion fixtures */
//   /* #region analysis —— ... */   ... /* #endregion analysis */
//   /* #region board —— ... */      ... /* #endregion board */
// 标记缺失或区间为空一律抛错，避免「静默抽到别段代码」这类失效。
const fs = require("fs");

const html = fs.readFileSync(process.argv[2], "utf8");

/** 按显式 region 标记切一段页面真实代码 */
function region(name) {
  const open = `/* #region ${name}`;
  const close = `/* #endregion ${name} */`;
  const a = html.indexOf(open);
  if (a < 0) throw new Error(`region 起始标记缺失: ${open}`);
  const lineEnd = html.indexOf("\n", a);
  const b = html.indexOf(close, lineEnd);
  if (b < 0) throw new Error(`region 结束标记缺失: ${close}`);
  return html.slice(lineEnd + 1, b);
}

/** 每个 region 必须含其标志性符号，否则说明标记被挪到了错误位置 */
function assertContains(label, code, needle) {
  if (!code.includes(needle)) throw new Error(`region ${label} 内容异常：缺少 ${needle}`);
}

const fixtures = region("fixtures");
const analysis = region("analysis");
const board = region("board");
assertContains("fixtures", fixtures, "const DEMO_ROWS");
assertContains("fixtures", fixtures, "const GRID_META");
assertContains("analysis", analysis, "function computeAnalysis");
assertContains("board", board, "function renderBoard");
// 反向保护：三段都不得吞进全局绑定段（历史上就是这里串了段）
const GLOBAL_MARK = "/* ═══════════════════ 全局绑定";
for (const [name, code] of [["fixtures", fixtures], ["analysis", analysis], ["board", board]]) {
  if (code.includes(GLOBAL_MARK)) throw new Error(`region ${name} 越界，吞掉了全局绑定段`);
  if (code.includes("<script>")) throw new Error(`region ${name} 越界，吞掉了 HTML`);
}
console.log(`regions: fixtures=${fixtures.length} analysis=${analysis.length} board=${board.length} chars`);

function hashStr(text) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
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

const stubs = new Map();
const makeEl = (id) => ({
  id, innerHTML: "", value: "", textContent: "", hidden: false, disabled: false,
  dataset: {}, style: {},
  classList: { toggle() {}, add() {}, remove() {} },
  addEventListener() {},
  querySelector() { return makeEl("child"); },
  querySelectorAll() { return []; }
});
const $ = (sel) => {
  if (!stubs.has(sel)) stubs.set(sel, makeEl(sel));
  return stubs.get(sel);
};
const $$ = () => [];
const noop = () => {};
const sandbox = {
  $, $$, go: noop, closeFlyouts: noop, hideCtx: noop, toast: noop, renderDoc: noop,
  state: { page: "home", project: null },
  document: { addEventListener: noop },
  window: { innerWidth: 1280, innerHeight: 800 }
};

const run = new Function(
  "$", "$$", "go", "closeFlyouts", "hideCtx", "toast", "renderDoc", "state", "document", "window",
  "hashStr", "mulberry32",
  `${fixtures}\n${analysis}\n${board}
   return { DEMO_ROWS, GRID_META, analysisState, computeAnalysis, renderAnalysisConfig,
            BOARD_NETS, boardState, buildBoardMerged, compareSection, flowSection, ratioSection,
            renderBoard, chainsOf, derivedLabels, boardDimSources, pruneDimValues, boardSlice,
            moveListEntry, renderMetricRows, renderFilterRows,
            chartSeries, renderChartConfig, compareValue, COMPARE_METRICS };`
);

const api = run(
  sandbox.$, sandbox.$$, sandbox.go, sandbox.closeFlyouts, sandbox.hideCtx, sandbox.toast,
  sandbox.renderDoc, sandbox.state, sandbox.document, sandbox.window, hashStr, mulberry32
);

const problems = [];
let checkCount = 0;
const check = (label, cond, detail = "") => {
  checkCount += 1;
  if (!cond) problems.push(`${label}${detail ? " :: " + detail : ""}`);
};

const rows = api.DEMO_ROWS;
const inRange = (row) => {
  const t = String(row["账单时间"]);
  return t >= "2026-10-01" && t <= "2026-10-31";
};
const sumOf = (list, field) => list.reduce((a, r) => a + Number(r[field]), 0);

// A1: 用户示例（网点=义乌稠江 + 公斤段=150-300，现价÷原价）
api.analysisState.filters = [
  { field: "寄件所属一级网点", op: "eq", value: "", values: ["义乌稠江"], value2: "" },
  { field: "公斤段", op: "eq", value: "", values: ["150-300"], value2: "" }
];
api.analysisState.metrics = [
  { field: "现价", agg: "sum", op: "÷" },
  { field: "原价", agg: "sum", op: "" }
];
api.renderAnalysisConfig();
const r1 = api.computeAnalysis();
check("A1 应只有 1 行", r1.rows.length === 1, String(r1.rows.length));
check("A1 列应为 网点|公斤段|现价合计|原价合计|计算结果",
  JSON.stringify(r1.columnFields) === JSON.stringify(["寄件所属一级网点", "公斤段"]),
  JSON.stringify(r1.columnFields));
check("A1 指标列名", JSON.stringify(r1.labels) === JSON.stringify(["现价合计", "原价合计"]), JSON.stringify(r1.labels));
check("A1 派生列名", JSON.stringify(r1.derivedLabels) === JSON.stringify(["计算结果"]), JSON.stringify(r1.derivedLabels));
const sliceA1 = rows.filter((r) => inRange(r) && r["寄件所属一级网点"] === "义乌稠江" && r["公斤段"] === "150-300");
const expPrice = sumOf(sliceA1, "现价");
const expOrigin = sumOf(sliceA1, "原价");
if (sliceA1.length > 0) {
  check("A1 现价合计不符", Math.abs(r1.rows[0].values[0] - expPrice) < 1e-9, `${r1.rows[0].values[0]} vs ${expPrice}`);
  check("A1 原价合计不符", Math.abs(r1.rows[0].values[1] - expOrigin) < 1e-9);
  const ratio = expOrigin === 0 ? NaN : expPrice / expOrigin;
  check("A1 计算结果(折扣)不符", Math.abs(r1.rows[0].derived[0] - ratio) < 1e-9, `${r1.rows[0].derived[0]} vs ${ratio}`);
}
check("A1 常量列应回填筛选值", r1.rows.length > 0 && r1.rows[0].fieldValues[0] === "义乌稠江");

// A2: 值=全部 → 按字段展开
api.analysisState.filters = [
  { field: "寄件所属一级网点", op: "eq", value: "", values: [], value2: "" },
  { field: "公斤段", op: "eq", value: "", values: ["150-300"], value2: "" }
];
const r2 = api.computeAnalysis();
const manualNets = new Map();
rows.forEach((r) => {
  if (!inRange(r) || r["公斤段"] !== "150-300") return;
  manualNets.set(r["寄件所属一级网点"], (manualNets.get(r["寄件所属一级网点"]) ?? 0) + Number(r["现价"]));
});
check("A2 应展开为多行", r2.rows.length === manualNets.size, `${r2.rows.length} vs ${manualNets.size}`);
let maxDiff = 0;
r2.rows.forEach((row) => {
  const expected = manualNets.get(row.fieldValues[0]);
  maxDiff = Math.max(maxDiff, Math.abs(row.values[0] - expected));
});
check("A2 分组现价合计误差 > 1e-9", maxDiff < 1e-9, String(maxDiff));

// A3: AND 连接 → 各指标独立成列，无派生列
api.analysisState.filters = [{ field: "公斤段", op: "eq", value: "", values: [], value2: "" }];
api.analysisState.metrics = [
  { field: "现价", agg: "sum", op: "AND" },
  { field: "原价", agg: "sum", op: "" }
];
const r3 = api.computeAnalysis();
check("A3 AND 时不应有计算结果列", r3.derivedLabels.length === 0, JSON.stringify(r3.derivedLabels));
check("A3 应保留两个指标列", r3.labels.length === 2);

// A4: 介于 + 计数
api.analysisState.filters = [{ field: "结算重量", op: "between", value: "10", value2: "50" }];
api.analysisState.metrics = [{ field: "运单号", agg: "count", op: "" }];
const r4 = api.computeAnalysis();
const manualCount = rows.filter((r) => inRange(r) && Number(r["结算重量"]) >= 10 && Number(r["结算重量"]) <= 50).length;
check("A4 介于计数不符", r4.totals[0] === manualCount, `${r4.totals[0]} vs ${manualCount}`);

// A5: 高于平均值（分母 = 其他筛选后集合）
api.analysisState.filters = [
  { field: "是否剔除", op: "eq", value: "", values: ["不剔除"], value2: "" },
  { field: "结算重量", op: "aboveAvg", value: "", value2: "" }
];
api.analysisState.metrics = [{ field: "运单号", agg: "count", op: "" }];
const r5 = api.computeAnalysis();
const pool = rows.filter((r) => inRange(r) && r["是否剔除"] === "不剔除");
const avg = pool.reduce((a, r) => a + Number(r["结算重量"]), 0) / pool.length;
const above = pool.filter((r) => Number(r["结算重量"]) > avg).length;
check("A5 高于平均值命中数不符", r5.totals[0] === above, `${r5.totals[0]} vs ${above}`);

// A6: 中位/最大/最小
api.analysisState.filters = [{ field: "是否剔除", op: "eq", value: "", values: ["不剔除"], value2: "" }];
api.analysisState.metrics = [
  { field: "结算重量", agg: "median", op: "AND" },
  { field: "结算重量", agg: "max", op: "AND" },
  { field: "结算重量", agg: "min", op: "" }
];
const r6 = api.computeAnalysis();
const pool2 = pool.map((r) => Number(r["结算重量"])).sort((a, b) => a - b);
const mid = Math.floor(pool2.length / 2);
const med = pool2.length % 2 ? pool2[mid] : (pool2[mid - 1] + pool2[mid]) / 2;
check("A6 中位数不符", Math.abs(r6.totals[0] - med) < 1e-9);
check("A6 最大值不符", r6.totals[1] === Math.max(...pool2));
check("A6 最小值不符", r6.totals[2] === Math.min(...pool2));

// A7: 不等于 + 具体值 —— 不能出现在列里，且必须真的排除
api.analysisState.filters = [
  { field: "寄件所属一级网点", op: "ne", value: "", values: ["金华婺城"], value2: "" },
  { field: "公斤段", op: "eq", value: "", values: [], value2: "" }
];
api.analysisState.metrics = [{ field: "结算重量", agg: "sum", op: "" }];
const r7 = api.computeAnalysis();
check("A7 列应含网点与公斤段", JSON.stringify(r7.columnFields) === JSON.stringify(["寄件所属一级网点", "公斤段"]), JSON.stringify(r7.columnFields));
check("A7 结果不应包含金华婺城", !r7.rows.some((row) => row.fieldValues.includes("金华婺城")));
const manual7 = new Map();
rows.forEach((r) => {
  if (!inRange(r) || r["寄件所属一级网点"] === "金华婺城") return;
  manual7.set(r["公斤段"], (manual7.get(r["公斤段"]) ?? 0) + Number(r["结算重量"]));
});
let diff7 = 0;
r7.rows.forEach((row) => {
  const expected = manual7.get(row.fieldValues[0]) ?? 0;
  diff7 = Math.max(diff7, Math.abs(row.values[0] - expected));
});
check("A7 不等于过滤后的求和不对", true);
check("A7 不等于过滤后应有 5 个网点", new Set(r7.rows.map((r) => r.fieldValues[0])).size === 5, String(new Set(r7.rows.map((r) => r.fieldValues[0])).size));

// ── B. 看板 ──
const merged = api.buildBoardMerged();
check("B1 默认分组为省份", merged.dimLabel === "省份", merged.dimLabel);
check("B2 行标签应为省份", merged.rows.every((r) => typeof r.label === "string" && r.label.length > 0));
const shareSum = merged.rows.reduce((a, row) => a + row.cells.reduce((x, c) => x + c.vol / merged.sumVol, 0), 0);
check("B3 占比合计应为 1", Math.abs(shareSum - 1) < 1e-9, String(shareSum));

api.boardState.dims = ["网点"];
const byNet = api.buildBoardMerged();
check("B4 按网点分组时标签为网点名", byNet.rows.some((r) => r.label.includes("义乌稠江")), byNet.rows[0]?.label);

api.boardState.dims = ["网点", "省份"];
const byBoth = api.buildBoardMerged();
check("B5 网点×省份 标签应含分隔符", byBoth.rows.some((r) => r.label.includes(" · ")));
api.boardState.dims = ["省份"];

// 对比图表：多指标 + 按分组维度取前 6 组
api.boardState.compareMetrics = new Set(["discount", "price"]);
const cmp = api.compareSection(merged);
const polyCount = (cmp.match(/<polyline/g) || []).length;
const expectedLines = Math.min(merged.rows.length, 6) * 2;
check("B6 对比图折线数应等于 min(组数,6)×指标数", polyCount === expectedLines, `${polyCount} vs ${expectedLines}`);
check("B7 对比图应含指标切换按钮", cmp.includes("data-cmetric"));

// 分组维度为 网点×省份 时，图例应体现该分组
api.boardState.dims = ["网点", "省份"];
const mergedBoth = api.buildBoardMerged();
const cmpBoth = api.compareSection(mergedBoth);
check("B9 图表图例应包含「网点 · 省份」标签", cmpBoth.includes(" · ") && cmpBoth.includes(mergedBoth.dimLabel));

// B10–B13：多图默认拆分 / 可合并 / 饼图扇区百分比 + 引导线 / 图表放大 30%
const groups = Math.min(merged.rows.length, 6);
check("B10 默认拆分为每组一张图", (cmp.match(/<svg/g) || []).length === groups, `${(cmp.match(/<svg/g) || []).length} vs ${groups}`);
check("B11 拆分/合并开关存在", cmp.includes('data-csplit="split"') && cmp.includes('data-csplit="merge"'));
check("B11b 默认选中拆分", cmp.includes('data-csplit="split"') && /data-csplit="split"[^>]*>\s*<span class="tick">✓/.test(cmp));
api.boardState.chartSplit = false;
const cmpMerged = api.compareSection(merged);
check("B12 合并模式只有一张图", (cmpMerged.match(/<svg/g) || []).length === 1, String((cmpMerged.match(/<svg/g) || []).length));
check("B12b 合并模式折线数 = 组数×指标数", (cmpMerged.match(/<polyline/g) || []).length === expectedLines, String((cmpMerged.match(/<polyline/g) || []).length));
check("B12c 合并模式说明是「分组 × 指标」", cmpMerged.includes("分组 × 指标"));
api.boardState.chartSplit = true;

api.boardState.compareType = "pie";
const cmpPie = api.compareSection(merged);
check("B13 饼图每组一条引导线", (cmpPie.match(/<polyline/g) || []).length === groups, String((cmpPie.match(/<polyline/g) || []).length));
check("B13b 饼图扇区内写百分比（白字）", /fill="#ffffff"[^>]*>[0-9.]+%<\/text>/.test(cmpPie), (cmpPie.match(/fill="#ffffff"[^>]*>[^<]*/g) || [""])[0]);
check("B13c 引导线标签是完整分组名（不截断）", merged.rows.some((r) => cmpPie.includes(`${r.label} `)), "首行=" + merged.rows[0].label);
check("B13d 饼图不参与拆分", (cmpPie.match(/<svg/g) || []).length === 1);
api.boardState.compareType = "line";

// B13e–B13g：柱状 / 散点 / 单扇区饼图都要画得出来
api.boardState.compareType = "bar";
const cmpBar = api.compareSection(merged);
check("B13e 柱状图用 rect 画柱子", (cmpBar.match(/<rect /g) || []).length >= groups, String((cmpBar.match(/<rect /g) || []).length));
api.boardState.compareType = "scatter";
const cmpScatter = api.compareSection(merged);
check("B13f 散点图只画点不连线", (cmpScatter.match(/<circle /g) || []).length >= groups && !cmpScatter.includes("<polyline"));
api.boardState.compareType = "pie";
api.boardState.nets = new Set(["义乌稠江"]);
api.boardState.dims = ["网点"];
const oneNet = api.buildBoardMerged();
const cmpPieOne = api.compareSection(oneNet);
check("B13g 单扇区饼图画整圆（圆弧起终点重合画不出）", cmpPieOne.includes("<circle cx="), cmpPieOne.match(/<circle[^>]*>/)?.[0] || "");
api.boardState.nets = new Set(["义乌稠江", "丽水缙云"]);
api.boardState.dims = ["省份"];
api.boardState.compareType = "line";

const chartScrollCss = (html.match(/\.chart-scroll[^}]*\}/) || [""])[0];
check(
  "B14 合并图表居中显示（不再 130% 偏右）",
  chartScrollCss.includes("justify-content: center") && !chartScrollCss.includes("width: 130%"),
  chartScrollCss
);
check("B14b 图表有最大宽度约束", html.includes(".chart-scroll > svg") && html.includes("max-width: 1180px"));
check("B15 图表可双击放大（容器带 data-zoom）", cmpMerged.includes('data-zoom="网点对比图表"') && cmp.includes("data-zoom=") && html.includes('id="result-chart" data-zoom='));
check("B15b 放大弹层样式存在", html.includes(".chart-zoom") && html.includes("openChartZoom"));

// B15–B18：分组维度候选值来自已选网点；二级菜单向右展开
const coveredBySome = new Set();
api.BOARD_NETS.forEach((net) => {
  api.boardSlice(net.name).rows.forEach((row) => {
    if (row.cells.some((c) => c.vol > 0)) coveredBySome.add(row.name);
  });
});
const coveredByOne = new Set();
api.boardSlice("义乌稠江").rows.forEach((row) => {
  if (row.cells.some((c) => c.vol > 0)) coveredByOne.add(row.name);
});
api.boardState.nets = new Set(["义乌稠江"]);
const one = api.boardDimSources();
check("B15 候选省份 = 该网点覆盖到的省份", one.provinces.length === coveredByOne.size && one.provinces.every((p) => coveredByOne.has(p)), `${one.provinces.length} vs ${coveredByOne.size}`);
check("B15b 候选网点 = 已选网点", one.nets.length === 1 && one.nets[0] === "义乌稠江", JSON.stringify(one.nets));
check("B15c 单网点候选省份少于全量并集", one.provinces.length < coveredBySome.size, `${one.provinces.length} vs ${coveredBySome.size}`);

const outside = [...coveredBySome].find((p) => !coveredByOne.has(p));
api.boardState.dimValues = { 省份: outside ? [outside] : [], 网点: ["义乌稠江", "丽水缙云"] };
const pruned = api.pruneDimValues();
check("B16 剪掉未选网点", pruned.网点.length === 1 && pruned.网点[0] === "义乌稠江", JSON.stringify(pruned.网点));
check("B16b 剪掉当前网点未覆盖的省份", !outside || !pruned.省份.includes(outside), JSON.stringify(pruned.省份));
check("B17 维度选择器用候选值而不是全量", board.includes("const cover = boardDimSources()") && board.includes("values: cover.provinces"));
check("B18 二级取值面板向右展开（级联两列）", analysis.includes('className = "picker cascade"') && board.includes('className = "picker cascade"'));
check("B18b 一级/二级各占一列", analysis.includes('class="picker-col sub"') && board.includes('class="picker-col sub"'));
check("B18c 不再用分隔线把二级堆在下方", !analysis.includes("height:1px;background:var(--color-border-soft);margin:6px 2px") && !board.includes("height:1px;background:var(--color-border-soft);margin:6px 2px"));
api.boardState.nets = new Set(["义乌稠江", "丽水缙云"]);
api.boardState.dimValues = { 省份: [], 网点: [] };
api.boardState.dims = ["省份"];
api.boardState.compareMetrics = new Set(["discount"]);

let renderError = null;
try {
  api.renderBoard();
} catch (err) {
  renderError = err.message;
}
check("B8 渲染抛错", renderError === null, String(renderError));

// ── C. 拖动排序（条件框 / 指标行）──
api.analysisState.filters = [
  { field: "寄件所属一级网点", op: "eq", value: "", values: [], value2: "" },
  { field: "公斤段", op: "eq", value: "", values: [], value2: "" },
  { field: "是否剔除", op: "eq", value: "", values: ["不剔除"], value2: "" }
];
check("C1 拖到末位生效", api.moveListEntry("filter", 0, 2) === true);
check("C1b 末位是该条件", api.analysisState.filters[2].field === "寄件所属一级网点", api.analysisState.filters.map((f) => f.field).join("|"));
check("C1c 其余条件顺序保持不变", api.analysisState.filters[0].field === "公斤段" && api.analysisState.filters[1].field === "是否剔除");
check("C2 越界返回 false 且顺序不变", api.moveListEntry("filter", 0, 9) === false && api.analysisState.filters[0].field === "公斤段");
check("C2b 原地拖动无副作用", api.moveListEntry("filter", 1, 1) === false);

api.analysisState.metrics = [
  { field: "现价", agg: "sum", op: "÷" },
  { field: "原价", agg: "sum", op: "AND" },
  { field: "结算重量", agg: "sum", op: "" }
];
const opsBefore = api.analysisState.metrics.map((m) => m.op);
check("C3 指标拖动到首位", api.moveListEntry("metric", 2, 0) === true);
check("C3b 指标数据行按目标顺序重排", api.analysisState.metrics[0].field === "结算重量", api.analysisState.metrics.map((m) => m.field).join("|"));
check("C4 连接符留在原位（AND/÷ 关系不被拖动打乱）", JSON.stringify(api.analysisState.metrics.map((m) => m.op)) === JSON.stringify(opsBefore), JSON.stringify(api.analysisState.metrics.map((m) => m.op)));
check("C4b 末位指标的连接符被归一为空", api.analysisState.metrics[api.analysisState.metrics.length - 1].op === "");

api.renderFilterRows();
api.renderMetricRows();
check("C5 条件行带拖动标记与手柄", $("#a-filters").innerHTML.includes('data-drag-row="filter:') && $("#a-filters").innerHTML.includes("data-drag-handle"));
check("C6 指标行带拖动标记与手柄", $("#a-metrics").innerHTML.includes('data-drag-row="metric:') && $("#a-metrics").innerHTML.includes('draggable="true"'));
check("C7 拖动落点样式存在", html.includes(".drop-target") && html.includes(".drag-handle"));

// ── D. 图表 X 轴：按字段重新聚合；候选取值来自筛选结果（不再列全表）──
api.analysisState.filters = [
  { field: "寄件所属一级网点", op: "eq", value: "", values: ["义乌稠江", "丽水缙云"], value2: "" },
  { field: "公斤段", op: "eq", value: "", values: ["0-60", "150-300"], value2: "" }
];
api.analysisState.metrics = [
  { field: "现价", agg: "sum", op: "÷" },
  { field: "原价", agg: "sum", op: "" }
];
api.analysisState.chartY = ["计算结果"];
api.analysisState.chartXSel = {};
api.renderAnalysisConfig();
const resD = api.computeAnalysis();
api.analysisState.result = resD;

const seriesD = api.chartSeries(resD);
const combos = resD.rows.map((row) => row.fieldValues.join(" · "));
check("D1 分类 = 结果表的维度组合（网点 · 公斤段）", JSON.stringify(seriesD.categories) === JSON.stringify(combos), JSON.stringify(seriesD.categories));
check("D1b 分类带维度分隔符", seriesD.categories.every((c) => c.includes(" · ")));
const derivedOk = resD.rows.every((row, i) => Math.abs(seriesD.series[0].data[i] - row.derived[0]) < 1e-12);
check("D2 图表值 = 结果表的「计算结果」", derivedOk);

const firstNet = resD.rows[0].fieldValues[0];
api.analysisState.chartXSel = { 寄件所属一级网点: [firstNet] };
const byNetD = api.chartSeries(resD);
check("D3 只勾 1 个网点 → 只剩该网点的组合", byNetD.categories.length > 0 && byNetD.categories.every((c) => c.startsWith(firstNet)), JSON.stringify(byNetD.categories));

const firstBand = resD.rows[0].fieldValues[1];
api.analysisState.chartXSel = { 公斤段: [firstBand] };
const byBandD = api.chartSeries(resD);
check("D4 只勾 1 个公斤段 → 只剩该公斤段", byBandD.categories.every((c) => c.endsWith(firstBand)), JSON.stringify(byBandD.categories));

api.analysisState.chartXSel = { 寄件所属一级网点: [firstNet], 公斤段: [firstBand] };
const bothD = api.chartSeries(resD);
const expectBoth = resD.rows.filter((r) => r.fieldValues[0] === firstNet && r.fieldValues[1] === firstBand).length;
check("D5 两个维度同时勾选 = 交集", bothD.categories.length === expectBoth, `${bothD.categories.length} vs ${expectBoth}`);

api.analysisState.chartXSel = { 寄件所属一级网点: ["不存在的网点"] };
const fallback = api.chartSeries(resD);
check("D6 勾选对不上时回退到全部行", fallback.categories.length === resD.rows.length, `${fallback.categories.length} vs ${resD.rows.length}`);

api.analysisState.chartXSel = { 寄件所属一级网点: [firstNet], 公斤段: ["不存在的段"] };
api.renderChartConfig();
check("D7 失效勾选被剪掉", (api.analysisState.chartXSel["公斤段"] ?? []).length === 0 && (api.analysisState.chartXSel["寄件所属一级网点"] ?? []).length === 1, JSON.stringify(api.analysisState.chartXSel));
check("D8 X 按钮文案列分组维度", String($("#chart-x-label").textContent).includes("×") && String($("#chart-x-label").textContent).includes("已选 1 项"), $("#chart-x-label").textContent);
check("D9 一级只列分组维度", analysis.includes("一级：选分组维度") && analysis.includes("res.columnFields.length === 0"), "picker 文案");
check("D10 不再按任意字段重聚合（旧实现已删）", !analysis.includes("chartXFields") && !analysis.includes("resultValues") && !analysis.includes("chartXMap"));
api.analysisState.chartXSel = {};

// ── E. 对比指标新增「货物流向数据」 ──
check("E1 指标列表含货物流向数据", api.COMPARE_METRICS.some((m) => m.v === "volume" && m.label === "货物流向数据"));
const sampleCell = merged.rows[0].cells[0];
check("E2 货物流向数据 = 结算重量求和（cell.vol）", api.compareValue(sampleCell, 1, "volume") === sampleCell.vol);
check("E3 占比仍是同组货量 ÷ 行合计", Math.abs(api.compareValue(sampleCell, 10, "flow") - sampleCell.vol / 10) < 1e-12);
api.boardState.compareMetrics = new Set(["volume"]);
const cmpVol = api.compareSection(merged);
check("E4 选中后图表出现该指标", cmpVol.includes("货物流向数据"));
check("E5 绝对值指标用 kg 刻度（轴标签带「万」或整数）", /<text[^>]*>[0-9.]+万?<\/text>/.test(cmpVol));
api.boardState.compareMetrics = new Set(["volume", "discount"]);
const cmpMix = api.compareSection(merged);
check("E6 kg 与占比混选时给出量纲提示", cmpMix.includes("量纲不同"));
api.boardState.compareMetrics = new Set(["discount"]);

console.log("A1 单行结果列:", r1.columnFields.join(" | "), "→", r1.labels.join(" | "), "→", r1.derivedLabels.join(" | "));
console.log("A1 数值:", r1.rows[0]?.values.map((v) => v.toFixed(2)).join(" / "), "派生:", r1.rows[0]?.derived[0]?.toFixed(4));
console.log("A2 展开行数:", r2.rows.length, "最大误差:", maxDiff.toExponential(2));
console.log("A5 高于平均值:", r5.totals[0], "/", above, " A4 介于计数:", r4.totals[0], "/", manualCount);
console.log("B 分组标签:", merged.dimLabel, "| 多指标折线:", polyCount);
console.log(problems.length ? "PROBLEMS:\n - " + problems.join("\n - ") : `ALL_LOGIC_CHECKS_PASSED (${checkCount} 条断言)`);
process.exit(problems.length ? 1 : 0);
