// 图板改成「每卡一张小图，一行 3 个」；并给手动模式恢复外壳
const fs = require("fs");
const target = "_proto/shell-demo.html";
let html = fs.readFileSync(target, "utf8");
const payload = fs.readFileSync("_proto/new_reg_minicharts.js", "utf8").trimEnd() + "\n\n";

const START = "/**\n * 表格取数：每组一对线（虚线 = 调整前，实线 = 调整后，同组同色）";
const END = "\n/** 手动输入：单组两条线（含杂费 B） */";

const count = (hay, needle) => hay.split(needle).length - 1;
if (count(html, START) !== 1) throw new Error("start=" + count(html, START));
if (count(html, END) !== 1) throw new Error("end=" + count(html, END));

const a = html.indexOf(START);
const b = html.indexOf(END, a);
if (!(b > a)) throw new Error("边界异常");
console.log(`group chart ${b - a} -> ${payload.length}`);
html = html.slice(0, a) + payload + html.slice(b);

/* 手动模式：画之前先确保外壳还在（表格模式会把容器换成小图网格） */
const MANUAL_HEAD = "function regDrawManualLines(M) {";
if (html.split(MANUAL_HEAD).length - 1 !== 1) throw new Error("manual fn 不是唯一");
html = html.replace(
  MANUAL_HEAD,
  MANUAL_HEAD +
    "\n  const host = $(\"#reg-charts\");\n  if (host && !$(\"#reg-chart\")) {\n    host.className = \"reg-charts\";\n    host.innerHTML = REG_CHART_SHELL;\n  }"
);

fs.writeFileSync(target, html, "utf8");
