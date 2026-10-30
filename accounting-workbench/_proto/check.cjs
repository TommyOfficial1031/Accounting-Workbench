// 静态语法检查：抽取 HTML 末尾 <script> 块并编译（不执行），验证 JS 无语法错误。
const fs = require("fs");
const path = process.argv[2];
const html = fs.readFileSync(path, "utf8");
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
if (blocks.length === 0) {
  console.error("NO_SCRIPT_FOUND");
  process.exit(1);
}
let ok = true;
blocks.forEach((code, i) => {
  try {
    new Function(code);
    console.log(`block ${i}: OK (${code.length} chars)`);
  } catch (err) {
    ok = false;
    console.error(`block ${i}: SYNTAX ERROR -> ${err.message}`);
  }
});

// 额外检查：HTML 中 id 引用是否都存在
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
const refs = new Set([...html.matchAll(/\$\("#([a-z0-9-]+)"\)/gi)].map((m) => m[1]));
// 这些 id 由 JS 运行时动态创建，HTML 里本就不存在，属预期
const DYNAMIC_IDS = new Set(["file-menu"]);
const missing = [...refs].filter((r) => !ids.has(r) && !r.startsWith("view-") && !DYNAMIC_IDS.has(r));
const dynamicViews = [...refs].filter((r) => r.startsWith("view-"));
console.log("ids:", ids.size, "refs:", refs.size);
if (missing.length) {
  ok = false;
  console.error("MISSING ELEMENTS:", missing.join(", "));
}
const pages = [...html.matchAll(/data-page="([a-z]+)"/g)].map((m) => m[1]);
const missingViews = [...new Set(pages)].filter((p) => !ids.has("view-" + p));
if (missingViews.length) {
  ok = false;
  console.error("MISSING VIEWS:", missingViews.join(", "));
}
console.log("dynamic view refs:", dynamicViews.join(", ") || "(none)");

// 额外检查：<script> 之前的 HTML 必须标签配平（JS 里拼的字符串不计入）
const bodyHtml = html.slice(0, Math.max(0, html.search(/<script>/i)));
let depth = 0;
let minDepth = 0;
for (const m of bodyHtml.matchAll(/<div\b|<\/div>/g)) {
  depth += m[0].startsWith("</") ? -1 : 1;
  if (depth < minDepth) minDepth = depth;
}
if (depth !== 0 || minDepth < 0) {
  ok = false;
  console.error("DIV_UNBALANCED:", { end: depth, min: minDepth });
} else {
  console.log("div balance: OK");
}
let secDepth = 0;
for (const m of bodyHtml.matchAll(/<section\b|<\/section>/g)) secDepth += m[0].startsWith("</") ? -1 : 1;
if (secDepth !== 0) {
  ok = false;
  console.error("SECTION_UNBALANCED:", secDepth);
}

console.log(ok ? "ALL_CHECKS_PASSED" : "CHECKS_FAILED");
process.exit(ok ? 0 : 1);
