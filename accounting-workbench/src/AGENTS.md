\# 前端局部规范



继承根目录 AGENTS.md。以下为补充与覆盖。



\## 允许引入的库

react, react-dom, zustand, ag-grid-community, ag-grid-react,

echarts, echarts-for-react, lucide-react, clsx

测试：vitest（仅作为 devDependency，用于纯函数单测，不进入运行时）



\## 分层约束

\- api/ 只做 HTTP 调用与错误转换，禁止业务逻辑。

\- stores/ 只存状态与 action，禁止直接 fetch。

\- components/ 只做展示与交互，禁止直接调 api/。

\- pages/ 组合 components，通过 stores/ 触发 api/。



\## 状态约定

\- 每个 store 只管理一个领域：project / table / analysis / history / settings。

\- 禁止跨 store 直接读写，必须通过 action。



\## 类型约定

\- 所有 API 响应必须有对应 TS 类型，定义在 types/api.ts。

\- 禁止 any，必要时用 unknown + 类型守卫。



\## 样式约定

\- 使用 CSS Modules。

\- 颜色、间距、圆角必须引用 variables.css 中的变量。

\- 禁止硬编码颜色值。

