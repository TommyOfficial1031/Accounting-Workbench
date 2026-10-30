// 用新版导出模块替换旧版（从「导出：一个文件夹」到 openChartZoom 之前）
const fs = require("fs");
const target = "_proto/shell-demo.html";
let html = fs.readFileSync(target, "utf8");
const payload = fs.readFileSync("_proto/new_reg_export2.js", "utf8").trimEnd() + "\n\n";

const START = "/* ═══════════════════ 导出：一个文件夹 + 4 个文件 ═══════════════════ */";
const END = "function openChartZoom(box) {";
const count = (hay, needle) => hay.split(needle).length - 1;
if (count(html, START) !== 1) throw new Error("start=" + count(html, START));
if (count(html, END) !== 1) throw new Error("end=" + count(html, END));
const a = html.indexOf(START);
const b = html.indexOf(END, a);
console.log(`replace ${b - a} -> ${payload.length}`);
html = html.slice(0, a) + payload + html.slice(b);

/* 补导出弹窗的样式 */
const cssAnchor = "  .reg-mini-legend { display: flex; flex-wrap: wrap; gap: 2px 10px; font-size: calc(10px * var(--text-scale));\n    color: var(--color-text-tertiary); }";
if (!html.includes(cssAnchor)) throw new Error("css 锚点没找到");
html = html.replace(
  cssAnchor,
  cssAnchor +
    `
  /* 导出弹窗 */
  .reg-export-dialog { width: 600px; max-width: 96vw; padding: 12px 14px; }
  .reg-exp-tools { display: flex; align-items: center; gap: 8px; padding: 0 2px 6px; }
  .reg-exp-list { max-height: 380px; overflow: auto; border: 1px solid var(--color-border-soft);
    border-radius: 10px; padding: 4px; }
  .reg-exp-row { display: flex; align-items: flex-start; gap: 9px; padding: 7px 8px; border-radius: 8px;
    cursor: pointer; }
  .reg-exp-row:hover { background: var(--color-hover); }
  .reg-exp-row input { margin-top: 2px; }
  .reg-exp-main { display: flex; flex-direction: column; gap: 2px; min-width: 0;
    font-size: calc(12px * var(--text-scale)); }
  .reg-exp-main b { font-weight: 500; }
  .reg-exp-main i { font-style: normal; font-size: calc(10.5px * var(--text-scale));
    color: var(--color-text-tertiary); }`
);

fs.writeFileSync(target, html, "utf8");
console.log("ok");
