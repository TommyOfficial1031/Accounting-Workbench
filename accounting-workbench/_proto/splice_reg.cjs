// 把 reg_view.html / reg_logic.js 拼进 shell-demo.html（按唯一标记定位，先校验再写）
const fs = require("fs");
const FILE = "_proto/shell-demo.html";
const NL = "\n";

let html = fs.readFileSync(FILE, "utf8");
const view = fs.readFileSync("_proto/reg_view.html", "utf8").replace(/\r\n/g, NL).trimEnd();
const logic = fs.readFileSync("_proto/reg_logic.js", "utf8").replace(/\r\n/g, NL).trimEnd();

function replaceRegion(text, startMarker, endMarker, payload, label) {
  const i = text.indexOf(startMarker);
  if (i < 0) throw new Error("start marker not found: " + label);
  if (text.indexOf(startMarker, i + 1) >= 0) throw new Error("start marker duplicated: " + label);
  const j = text.indexOf(endMarker, i + startMarker.length);
  if (j < 0) throw new Error("end marker not found: " + label);
  const from = text.lastIndexOf(NL, i) + 1;
  const to = text.lastIndexOf(NL, j) + 1;
  if (to <= from) throw new Error("bad region: " + label);
  console.log(`${label}: 替换 ${to - from} 字符 -> ${payload.length} 字符`);
  return text.slice(0, from) + payload + NL + NL + text.slice(to);
}

const before = html.length;
html = replaceRegion(
  html,
  "<!-- ══ 线性回归 ══ -->",
  "<!-- ══ 设置 ══ -->",
  view,
  "视图 HTML"
);
html = replaceRegion(
  html,
  "/* ═══════════════════ 回归 ═══════════════════ */",
  "/* ═══════════════════ 设置 ═══════════════════ */",
  logic,
  "视图 JS"
);

if (html.indexOf("<!-- ══ 线性回归 ══ -->") >= 0) throw new Error("old view comment still present");
if (html.indexOf("function renderRegression") < 0) throw new Error("renderRegression missing after splice");

fs.writeFileSync(FILE, html, "utf8");
console.log(`写入完成：${before} -> ${html.length} 字符`);
