// 两张图合并为一张「货量 – 利润」
const fs = require("fs");
const target = "_proto/shell-demo.html";
let html = fs.readFileSync(target, "utf8");
const payload = fs.readFileSync("_proto/new_reg_chart5.js", "utf8").trimEnd() + "\n\n";

const START = "/**\n * 图 1：货量 – 现价";
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
