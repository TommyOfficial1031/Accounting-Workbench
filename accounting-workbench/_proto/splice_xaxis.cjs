// 用「按维度组合过滤结果行」的模型整体替换：X 轴选择 + chartSeries + renderChartConfig
const fs = require("fs");
const target = "_proto/shell-demo.html";
let html = fs.readFileSync(target, "utf8");
const axis = fs.readFileSync("_proto/new_xaxis.js", "utf8");
const config = fs.readFileSync("_proto/new_xconfig.js", "utf8");

const START = "/** X 轴选择：左列一级字段 → 右侧展开二级取值（取值只列当前筛选后仍在的） */";
const END = "\nconst CHART_COLORS";
const body = (axis + config).trimEnd() + "\n";

const count = (hay, needle) => hay.split(needle).length - 1;
if (count(html, START) !== 1) throw new Error("起始标记数=" + count(html, START));
if (count(html, END) !== 1) throw new Error("结束标记数=" + count(html, END));

const a = html.indexOf(START);
const b = html.indexOf(END, a);
if (!(b > a)) throw new Error("边界异常");
console.log(`replace ${b - a} -> ${body.length} bytes`);
html = html.slice(0, a) + body + html.slice(b);
fs.writeFileSync(target, html, "utf8");
