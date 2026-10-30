// 用新版「表格取数」整段替换旧段
const fs = require("fs");
const target = "_proto/shell-demo.html";
let html = fs.readFileSync(target, "utf8");

const span = fs.readFileSync("_proto/new_reg_span1.js", "utf8").trimEnd() + "\n\n";
const groupChart = fs.readFileSync("_proto/new_reg_groupchart.js", "utf8").trimEnd() + "\n\n";

/* 1) 先把旧的 regDrawTrendLines 改名成 regDrawManualLines，并插入分发函数 */
const OLD_CHART = "function regDrawTrendLines(M) {";
if (html.split(OLD_CHART).length - 1 !== 1) throw new Error("chart fn 不是唯一");
html = html.replace(
  OLD_CHART,
  "function regDrawTrendLines(M) {\n  return M.tableMode ? regDrawGroupLines(M) : regDrawManualLines(M);\n}\n\n" +
    groupChart +
    "/** 手动输入：单组两条线（含杂费 B） */\nfunction regDrawManualLines(M) {"
);

/* 2) 用新实现替换 regModel…renderRegBottom 这一段 */
const START = "/** 统一取数：表格模式读汇算，手动模式读输入框 */";
const END = "function regDrawTrendLines(M) {";
const count = (hay, needle) => hay.split(needle).length - 1;
if (count(html, START) !== 1) throw new Error("start=" + count(html, START));
if (count(html, END) !== 1) throw new Error("end=" + count(html, END));
const a = html.indexOf(START);
const b = html.indexOf(END, a);
if (!(b > a)) throw new Error("边界异常");
console.log(`span ${b - a} -> ${span.length}`);
html = html.slice(0, a) + span + html.slice(b);

fs.writeFileSync(target, html, "utf8");
