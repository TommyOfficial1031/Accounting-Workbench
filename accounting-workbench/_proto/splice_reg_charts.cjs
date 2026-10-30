// 用「现价–货量」图 + 沿政策线的利润散点替换旧的两张图
const fs = require("fs");
const target = "_proto/shell-demo.html";
let html = fs.readFileSync(target, "utf8");
const payload = fs.readFileSync("_proto/new_reg_charts.js", "utf8").trimEnd() + "\n\n";

const START = "/* 图 1：折扣 – 货量（成本线 d* 是水平线；灰虚线 = 议价政策） */";
const END = "function renderRegression() {";

const count = (hay, needle) => hay.split(needle).length - 1;
if (count(html, START) !== 1) throw new Error("起始标记数=" + count(html, START));
if (count(html, END) !== 1) throw new Error("结束标记数=" + count(html, END));

const a = html.indexOf(START);
const b = html.indexOf(END, a);
if (!(b > a)) throw new Error("边界异常");
console.log(`replace ${b - a} -> ${payload.length} bytes`);
html = html.slice(0, a) + payload + html.slice(b);
fs.writeFileSync(target, html, "utf8");
