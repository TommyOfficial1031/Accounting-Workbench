import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import "./styles/variables.css";
import "./styles/theme.css";
import "./styles/global.css";
import "./styles/controls.css";

/* 关掉 WebView2 自带的右键菜单（用户反馈 2026-10-28：表格右键时两个菜单叠在一起）。
 * 表格/行号/列头都有我们自己的菜单；输入框里保留原生菜单，方便粘贴。 */
document.addEventListener("contextmenu", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const editable = target.closest("input, textarea, [contenteditable='true']");
  if (editable !== null) return;
  event.preventDefault();
});

/* 拖文件进窗口的兜底（用户 2026-10-28 反馈：首页「将文件拖到此处创建新项目」没反应）。
 *
 * 正常情况下走 Tauri 的拖放事件（tauri.conf 已开 dragDropEnabled，Rust 侧再补发一条
 * `aw://file-dropped`），此时 WebView2 的 HTML5 拖放事件不会触发，这段代码不执行。
 * 万一 Tauri 的拖放处理没装上：①别让 WebView2 自己导航到那个文件（会白屏）；
 * ②把能拿到的路径转发出去，界面至少能给用户一句明确提示，而不是静默无反应。 */
for (const type of ["dragover", "drop"] as const) {
  window.addEventListener(type, (event) => {
    event.preventDefault();
    if (type !== "drop") return;
    const paths: string[] = [];
    for (const file of Array.from(event.dataTransfer?.files ?? [])) {
      const path = (file as File & { path?: unknown }).path;
      if (typeof path === "string" && path.trim() !== "") paths.push(path);
    }
    window.dispatchEvent(new CustomEvent("aw:html5-drop", { detail: { paths } }));
  });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);