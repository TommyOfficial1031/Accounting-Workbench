// 换成「保本曲线 + 利润/利润率双轴」两张图
const fs = require("fs");
const target = "_proto/shell-demo.html";
let html = fs.readFileSync(target, "utf8");
const payload = fs.readFileSync("_proto/new_reg_charts2.js", "utf8").trimEnd() + "\n\n";

const START = "/**\n * 议价政策在「现价 – 货量」空间里也是一条直线：";
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
