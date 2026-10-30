// 把两个「一级/二级堆叠」的 picker 换成向右展开的级联面板。
// 按唯一标记切分，先替换靠后的区块，避免前面的插入影响后面的偏移。
const fs = require("fs");
const target = "_proto/shell-demo.html";
let html = fs.readFileSync(target, "utf8");
const parts = fs.readFileSync("_proto/new_pickers.js", "utf8").split("/* ====PICKER2==== */");
if (parts.length !== 2) throw new Error("载荷分割标记数量不对: " + parts.length);

const jobs = [
  {
    name: "openXAxisPicker",
    start: "function openXAxisPicker(anchor) {",
    end: "\nfunction chartSeries(res) {",
    body: parts[0].trimEnd() + "\n"
  },
  {
    name: "openDimPicker",
    start: "function openDimPicker(anchor) {",
    end: '\n\n$("#b-dims-btn")',
    body: parts[1].trimEnd() + "\n"
  }
];

const count = (hay, needle) => hay.split(needle).length - 1;
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
