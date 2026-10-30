// 用 _proto/new_compare.js 整体替换 compareSection 区块（按唯一标记切分，不用行号）
const fs = require("fs");
const target = "_proto/shell-demo.html";
const html = fs.readFileSync(target, "utf8");
const payload = fs.readFileSync("_proto/new_compare.js", "utf8");

const START = "function compareSection(data) {";
const END = '\ndocument.addEventListener("click", (event) => {\n  const typeBtn';
const count = (hay, needle) => hay.split(needle).length - 1;
if (count(html, START) !== 1) throw new Error("起始标记不唯一: " + count(html, START));
if (count(html, END) !== 1) throw new Error("结束标记不唯一: " + count(html, END));
const a = html.indexOf(START);
const b = html.indexOf(END, a);
if (!(b > a)) throw new Error("区块边界异常");
const before = html.slice(0, a);
const after = html.slice(b);
const next = before + payload.trimEnd() + "\n" + after;
fs.writeFileSync(target, next, "utf8");
console.log("replaced bytes:", b - a, "->", payload.trimEnd().length);
