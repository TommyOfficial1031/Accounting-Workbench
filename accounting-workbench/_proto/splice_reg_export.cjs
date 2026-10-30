// 合并两个导出按钮为一个「导出」，并插入导出模块
const fs = require("fs");
const target = "_proto/shell-demo.html";
let html = fs.readFileSync(target, "utf8");
const payload = fs.readFileSync("_proto/new_reg_export.js", "utf8").trimEnd() + "\n\n";

/* 1) 两个按钮 → 一个 */
const OLD_BTNS = `            <button class="btn btn-secondary" data-export="nop">导出 PDF</button>
            <button class="btn btn-secondary" data-export="nop">导出 JPEG</button>`;
if (html.split(OLD_BTNS).length - 1 !== 1) throw new Error("导出按钮不是唯一");
html = html.replace(OLD_BTNS, `            <button class="btn btn-secondary" id="reg-export-btn">导出</button>`);

/* 2) 在 openChartZoom 之前插入导出模块 */
const MARK = "function openChartZoom(box) {";
if (html.split(MARK).length - 1 !== 1) throw new Error("openChartZoom 标记不唯一");
html = html.replace(MARK, payload + MARK);

/* 3) 绑定按钮（阻止冒泡，避免被全局 click 立刻关掉） */
const BIND_AFTER = `const regView = $("#view-regression");`;
if (html.split(BIND_AFTER).length - 1 !== 1) throw new Error("绑定锚点不唯一");
html = html.replace(
  BIND_AFTER,
  `const regExportBtn = $("#reg-export-btn");
if (regExportBtn) {
  regExportBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    regOpenExportDialog();
  });
}

` + BIND_AFTER
);

fs.writeFileSync(target, html, "utf8");
console.log("ok");
