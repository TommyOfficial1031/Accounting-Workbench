\# Tauri 局部规范



继承根目录 AGENTS.md。以下为补充与覆盖。



\## 职责

\- 只负责：窗口管理、菜单、文件对话框、sidecar 生命周期。

\- 禁止在 Rust 侧实现业务逻辑。

\- 禁止在 Rust 侧处理数据。



\## Sidecar

\- 启动时 spawn backend 可执行文件。

\- 捕获 stdout 中的 PORT=<port>。

\- 暴露 command get\_backend\_port 给前端。

\- 应用退出时必须 kill sidecar。



\## 菜单

\- 菜单项与前端工具栏保持一致。

\- 菜单事件通过 emit 发给前端。

