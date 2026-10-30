// 看板数值自洽性 + 渲染路径（按 #region 标记抽取真实代码）
const fs = require("fs");

const html = fs.readFileSync(process.argv[2], "utf8");
const start = html.indexOf("/* #region board");
const close = html.indexOf("/* #endregion board */", start);
if (start < 0 || close <= start) {
  console.error("BOARD_REGION_NOT_FOUND", start, close);
  process.exit(1);
}
const block = html.slice(html.indexOf("\n", start) + 1, close);
if (!block.includes("function buildBoardMerged")) {
  console.error("BOARD_REGION_WRONG");
  process.exit(1);
}

function makeEl(id) {
  return {
    id,
    innerHTML: "",
    value: "",
    textContent: "",
    hidden: false,
    disabled: false,
    dataset: {},
    classList: { toggle() {}, add() {}, remove() {} },
    addEventListener() {},
    querySelector() {
      return { textContent: "" };
    },
    querySelectorAll() {
      return [];
    }
  };
}

const store = new Map();
const $ = (sel) => {
  if (!store.has(sel)) store.set(sel, makeEl(sel));
  return store.get(sel);
};
const $$ = () => [];
const noop = () => {};

const sandbox = {
  $,
  $$,
  go: noop,
  closeFlyouts: noop,
  hideCtx: noop,
  toast: noop,
  state: { page: "board", project: null },
  document: { addEventListener: noop, createElement: () => makeEl("tmp"), body: { appendChild: noop } },
  window: { innerWidth: 1440, innerHeight: 900 }
};

const runner = new Function(
  "$",
  "$$",
  "go",
  "closeFlyouts",
  "hideCtx",
  "toast",
  "state",
  "document",
  "window",
  `${block}\nreturn { boardState, buildBoardMerged, flowSection, ratioSection, compareSection,
     renderBoard, applyBoardRange, BOARD_BANDS, boardDimSources, pruneDimValues };`
);

const api = runner(
  sandbox.$,
  sandbox.$$,
  sandbox.go,
  sandbox.closeFlyouts,
  sandbox.hideCtx,
  sandbox.toast,
  sandbox.state,
  sandbox.document,
  sandbox.window
);

// 1) 数值自洽性
const data = api.buildBoardMerged();
const problems = [];

if (!(data.sumVol > 0)) problems.push("sumVol <= 0");
if (!(data.weightedUnit > 0)) problems.push("weightedUnit <= 0");
if (!(data.weightedDisc > 0 && data.weightedDisc <= 1)) problems.push("weightedDisc 越界: " + data.weightedDisc);

const shareSum = data.rows.reduce(
  (acc, row) => acc + row.cells.reduce((a, c) => a + (data.sumVol > 0 ? c.vol / data.sumVol : 0), 0),
  0
);
if (Math.abs(shareSum - 1) > 1e-6) problems.push("占比合计 != 1，实际 " + shareSum.toFixed(6));

// 加权值必须等于用底层 现价/原价/重量 重算的结果
const sf = data.rows.reduce((a, r) => a + r.cells.reduce((x, c) => x + c.price, 0), 0);
const of = data.rows.reduce((a, r) => a + r.cells.reduce((x, c) => x + c.orig, 0), 0);
const wf = data.rows.reduce((a, r) => a + r.cells.reduce((x, c) => x + c.vol, 0), 0);
if (Math.abs(data.weightedDisc - sf / of) > 1e-9) problems.push("加权折扣不自洽");
if (Math.abs(data.weightedUnit - sf / wf) > 1e-9) problems.push("加权单价不自洽");
if (data.rows.some((row) => !row.label)) problems.push("存在空分组标签");

// 2) 渲染路径不抛错
let rendered = "";
try {
  const flow = api.flowSection(data);
  const disc = api.ratioSection(data, "discount");
  const price = api.ratioSection(data, "price");
  if (!flow.includes("货物流向数据")) problems.push("货物流向区块标题缺失");
  if (!disc.includes("综合折扣")) problems.push("折扣区块汇总缺失");
  if (!price.includes("综合单价")) problems.push("单价区块汇总缺失");
  if (!flow.includes('colspan="2"')) problems.push("流向表缺少公斤段双列表头");
  const cmp = api.compareSection(data);
  if (!cmp.includes("<svg")) problems.push("对比图表未渲染");
  if ((cmp.match(/<svg/g) || []).length < 1) problems.push("对比图表 svg 数异常");
  api.renderBoard();
  rendered = $("#board-body").innerHTML;
  if (rendered.length < 500) problems.push("渲染输出过短: " + rendered.length);
} catch (err) {
  problems.push("渲染抛错: " + err.message);
}

// 3) 多选逻辑
const originalSize = api.boardState.features.size;
api.boardState.features = new Set();
api.renderBoard();
if (!rendered.includes("已取消全部计算功能") && !$("#board-body").innerHTML.includes("已取消全部计算功能")) {
  problems.push("全不选时未显示空态");
}

api.boardState.features = new Set(["flow", "discount", "price"]);
api.renderBoard();
const full = $("#board-body").innerHTML;
if ((full.match(/board-section"/g) || []).length !== 3) problems.push("三选时区块数不为 3");

// 4) 月份切换必须改变结果
api.boardState.features = new Set(["flow"]);
api.boardState.range = "本月";
api.applyBoardRange();
const oct = api.buildBoardMerged().sumVol;
api.boardState.range = "上月";
api.applyBoardRange();
const sep = api.buildBoardMerged().sumVol;
if (Math.abs(oct - sep) < 1) problems.push("切换月份后累计货量未变化");
api.boardState.range = "本月";
api.applyBoardRange();

// 5) 维度候选值必须来自已选网点
const sources = api.boardDimSources();
if (sources.nets.length === 0) problems.push("候选网点为空");
if (sources.provinces.length === 0) problems.push("候选省份为空");
const onlyOne = api.boardState.nets.size === 1 ? [...api.boardState.nets][0] : null;
if (onlyOne) {
  api.boardState.dimValues = { 省份: [], 网点: [] };
  const pruned = api.pruneDimValues();
  if (pruned.网点.length !== 0) problems.push("单选网点后仍保留了多余网点取值");
}

console.log("默认功能数:", originalSize);
console.log("累计货量:", data.sumVol.toFixed(1), "kg");
console.log("综合折扣(加权):", data.weightedDisc.toFixed(4), " 简单平均:", data.simpleDisc.toFixed(4));
console.log("综合单价(加权):", data.weightedUnit.toFixed(3), " 简单平均:", data.simpleUnit.toFixed(3));
console.log("占比合计:", shareSum.toFixed(9));
console.log("本月/上月 累计货量:", oct.toFixed(1), "/", sep.toFixed(1));
console.log("候选网点/省份:", sources.nets.length, "/", sources.provinces.length);
console.log(problems.length ? "PROBLEMS: " + problems.join(" | ") : "BOARD_LOGIC_OK");
process.exit(problems.length ? 1 : 0);
