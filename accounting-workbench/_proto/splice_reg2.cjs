// 整块替换「盈亏平衡与折扣分析」的 HTML 视图与 JS 逻辑（按唯一标记，先替换靠后的 JS）
const fs = require("fs");
const target = "_proto/shell-demo.html";
let html = fs.readFileSync(target, "utf8");
const view = fs.readFileSync("_proto/new_reg_view.html", "utf8");
const logic = fs.readFileSync("_proto/new_reg_logic.js", "utf8");

const count = (hay, needle) => hay.split(needle).length - 1;

const jobs = [
  {
    name: "logic",
    start: "/* ═══════════════════ 盈亏平衡与折扣分析 ═══════════════════ */",
    end: "/* ═══════════════════ 设置 ═══════════════════ */",
    body: logic.trimEnd() + "\n\n"
  },
  {
    name: "view",
    start: "      <!-- ══ 盈亏平衡与折扣分析 ══ -->",
    end: "      <!-- ══ 设置 ══ -->",
    body: view.trimEnd() + "\n\n"
  }
];

for (const job of jobs) {
  if (count(html, job.start) !== 1) throw new Error(`${job.name} 起始标记数=${count(html, job.start)}`);
  if (count(html, job.end) !== 1) throw new Error(`${job.name} 结束标记数=${count(html, job.end)}`);
}

jobs
  .map((job) => ({ ...job, a: html.indexOf(job.start), b: html.indexOf(job.end) }))
  .sort((x, y) => y.a - x.a)
  .forEach((job) => {
    if (!(job.b > job.a)) throw new Error(`${job.name} 边界异常`);
    console.log(`${job.name}: ${job.b - job.a} -> ${job.body.length} bytes`);
    html = html.slice(0, job.a) + job.body + html.slice(job.b);
  });

fs.writeFileSync(target, html, "utf8");
