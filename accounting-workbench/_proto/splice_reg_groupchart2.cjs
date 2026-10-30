// 图：起点改为（货量, 利润）；图例改成「调整前利润…调整后利润…」
const fs = require("fs");
const target = "_proto/shell-demo.html";
let html = fs.readFileSync(target, "utf8");
const payload = fs.readFileSync("_proto/new_reg_groupchart2.js", "utf8").trimEnd() + "\n\n";

const START = "/**\n * 表格取数：每组一对线";
const END = "\n/** 手动输入：单组两条线（含杂费 B） */";

const count = (hay, needle) => hay.split(needle).length - 1;
if (count(html, START) !== 1) throw new Error("start=" + count(html, START));
if (count(html, END) !== 1) throw new Error("end=" + count(html, END));

const a = html.indexOf(START);
const b = html.indexOf(END, a);
if (!(b > a)) throw new Error("边界异常");
console.log(`chart ${b - a} -> ${payload.length}`);
html = html.slice(0, a) + payload + html.slice(b);
fs.writeFileSync(target, html, "utf8");
