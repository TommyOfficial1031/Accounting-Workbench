# 交接计划：三页 1:1 复刻（对着 `_proto/shell-demo.html` 改）

> 换窗口继续时，先把这份文档读完，再动代码。里面每一条“踩过的坑”都是真实报错，重复踩会浪费一整轮。

---

## 0. 环境与命令（照抄即可）

```powershell
# 后端测试（Python 用 E:\python3.9.6\python.exe，不是 bundled DSH python）
cd backend; & "E:\python3.9.6\python.exe" -m pytest tests -q

# 真实数据全链路（导入 → 看板 → 盈亏平衡 → 导出 → 项目）
cd backend; & "E:\python3.9.6\python.exe" scripts\e2e_real_data.py
cd backend; & "E:\python3.9.6\python.exe" scripts\check_caliber.py   # 口径是否真的生效

# 前端
$env:TEMP="$PWD\.build-tmp"; $env:TMP="$PWD\.build-tmp"
$env:Path="C:\Users\13774\.nodejs\node-v24.21.0-win-x64;$env:Path"
npx tsc --noEmit
npx vitest run

# 原型五套 check（改 _proto/shell-demo.html 时才需要）
node _proto/check.cjs _proto/shell-demo.html
node _proto/check_logic.cjs _proto/shell-demo.html
node _proto/check_board.cjs _proto/shell-demo.html
node _proto/check_regression.cjs
node _proto/check_regression_ui.cjs

# 打包（三步，缺一不可）
& "E:\python3.9.6\python.exe" backend\build.py          # sidecar（后端改动后必做）
npx tauri build --no-bundle                              # exe
$env:TEMP="$PWD\.build-tmp\mknsis"; $env:TMP="$env:TEMP"   # 见坑 17，不然 mmap 失败
.build-tmp\nsis\nsis-3.11\makensis.exe installer\windows\workbench.nsi
.build-tmp\nsis\nsis-3.11\makensis.exe /DNOWEBVIEW2 installer\windows\workbench.nsi   # 精简包
```

**权限**：`npx vitest` / `npx vite build`（esbuild 要起子进程）/ `npx tauri build` / PyInstaller / `makensis`
在沙箱下会 `spawn EPERM` 或 mmap 失败，必须用 `danger-full-access` 执行。

---

## 1. 当前已完成（可验收）

| 模块 | 状态 |
|---|---|
| 三页整页化 | 盈亏平衡 / 一键算看板 / 分析 都是整页视图（`view: "regression" \| "board" \| "analysis"`），不再是弹窗 |
| 盈亏平衡 | 左侧：分段切换、字段识别六格、计算口径（是否剔除 / 物品来源，含「全部」）、三行分组下拉（点外部自动收起）、每组计算卡片（只读行 + 四个输入）；右侧：两张结论卡、分析段、小图 3 列网格（双击放大带图例、彩色线段图例）、汇算明细表；自动重算（400ms 防抖 + 签名去重） |
| 一键算看板 | 四个区块（货物流向表 / 综合折扣 / 综合单价 / 对比图表）、对比指标四选、图表四型（折线/柱状/饼图带引线/散点）、分组拆分 vs 合并一张、双击放大、时间快捷（本月/上月）、勾选即重算 |
| 分析（2026-10-24 重做完成） | **1:1 复刻 `#view-analysis`**：左右分栏（58% 配置 / 结果区）；左：时间范围（本月/上月/自定义 + 两个日期）、筛选条件（分组 badge、`+`、每行 = ⋮⋮▲▼ + 字段按钮 + 运算符下拉 + 值控件 + ✕）、指标（计算 badge、`+`、每行 = ⋮⋮▲▼ + 字段 + 聚合 + ✕，行间 `AND + − × ÷` 连接符）、结果表列预览；底部「开始计算 + 状态」；右：表格/图表 tab + 导出下拉（xlsx/xls/CSV/PDF/JPEG）、紧凑列宽结果表 + 合计行 + 扫描/命中行数说明；图表 = 图表类型/ X 轴 / Y 指标 chips |
| 分析数据链路 | 行模型 `filterRows`/`metricRows`（`src/utils/analysisRows.ts`，有单测）→ `AnalysisConfig`；文本 eq/ne = 分组维度、取值多选 → `in/not_in`；`/api/compute` 新增 `between / startsWith / endsWith / notContains / aboveAvg / belowAvg`（平均值分母 = 时间范围内 + 其余条件）；`meta` 新增 `totals / scanned / ranged / filtered / group_counts`；`/api/values` 支持 `time_range` |
| 表格页（2026-10-24 重做完成） | 右上角按原型：已保存点 + **固定规则 · 保存 · 分析 · 一键算**（一键算 `btn btn-primary`，从左侧栏挪出来）；固定规则 = 向右展开的二级菜单（左列口径 + 右列分组/指标/派生 + 开始分析，缺字段弹窗）；左侧栏删掉「高级计算」（分析与一键算都在表格页，盈亏平衡在分析页头部） |
| 表格选中 | 单元格 / 行号（新增 52px 行号列）/ 列头三种模式，Ctrl·⌘·Shift 累加；高亮 = `cellClassRules` + `headerClass`（`aw-sel-cell/aw-sel-row/aw-sel-col/aw-sel-header`）；底部状态条**移出网格容器**（原 `.grid{height:100%}` 把它挤没了），显示「A5 · 列名 / 值 … 」/「已选 N 行」/「已选 N 列：…」+ 整表求和平均（选中数值列时走 `/api/compute` 现算） |
| 表格工具栏（2026-10-25） | 原型 `.toolbar`：撤销 / 重做（按 `can_undo/can_redo` 置灰）· 重置 · `+ 行` `+ 列` `− 行` `− 列` · 查找框（只高亮已加载行，Esc 清空） |
| 右键菜单 + 剪贴板（2026-10-25） | 单元格 / 行号 / 列头三种右键菜单：剪切 · 复制 · 粘贴 · 插入行/列 · 删除 · 以此列分析；TSV 与 Excel 互通（`utils/gridClipboard.ts`，粘贴带数值列类型转换、超 4000 格截断）；剪切走 `cut_paste`（粘完清源）；复制只取已加载行（状态条明说） |
| 快捷键 | `mod+S` 保存、`mod+Shift+K` 分析、`mod+Shift+N` 新建、`mod+Z / Shift+Z / Y` 撤销重做、`mod+A` 全选、`mod+C/X/V` 复制剪切粘贴、`Ctrl+F` 查找 |
| 设置页（2026-10-25） | `#view-settings`：主题（浅色/深色，`data-theme`）、字号（小/标准/大/特大，html `zoom` 0.9–1.2）+ 预览、数据目录说明、关于；左侧栏设置菜单的四项快捷操作现在真的生效，localStorage 持久化（`stores/settingsStore.ts`） |
| 帮助页（2026-10-25） | `#view-help`：快速上手 / 导入须知 / 固定规则口径 / 占比说明 / 快捷键 / 常见问题六分页，文案照原型 `HELP_DOCS` |
| P2 补齐（2026-10-25） | 车线成本 / 操作成本进项目快照；看板「综合折扣 / 综合单价」改成带汇总行的区块（`.summary-pill`）；导出提示改成页头下方的横条 + 全局 toast |
| 第二轮反馈 10 条（2026-10-25） | ①项目管理里新建成功 → 项目管理窗口一起关；②表格「分析」按钮把选中列带进分析页（文本 → 筛选条件、数值 → 指标，空选走自由分析）；③条件/指标行拖动排序修好（`dragstart` 补 `setData`）；④分析页「表格/图表」与帮助页目录选中态修好（CSS Module 把 `.on` 哈希了，改 `:global(.on)`）；⑤图表加可编辑标题 + 图例 + X 轴标签自动倾斜缩字号 + 饼图静态占比；⑥图表导出 PDF/JPEG 也弹保存路径（`/api/chart/render` 支持 `path` 直写盘）；⑦盈亏平衡利润线改值轴两点直线；⑧图表起点 =（当前货量, 当前利润），X 轴到 `max(2×当前, 1.5×计划)`；⑨左侧栏新增「导出文件管理」页（SQLite 记录 + Rust 命令打开文件/路径）；⑩一键算按 `#view-board` 重构（参数行 / 功能胶囊 / 口径行 / 矩阵 sticky / 汇总 pill / 对比图表） |
| 第三轮反馈 11 条（2026-10-26） | ①条件/指标行改指针拖拽（HTML5 drag 在 WebView2 不可靠）；②分析图表双击标题/图例改名 + 双击画布放大；③X 轴二级取值级联（`x_values`）+ 图例改名（`label_aliases`）导出前烘焙进结果表；④盈亏平衡计划线带数值、手动图例带利润/利润率、判定胶囊上色；⑤轴线回 0 起点（线仍从当前货量画）；⑥分组筛选加「时间」维度（默认勾选、只给自定义日期）；⑦删掉口径提示行并收紧卡片留白；⑧表格行高 28→22 / 表头 32→26 / 字号 12→11 / 行号列 52→40；⑨一键算：自定义日期可切、网点多选修好、分组维度二级取值、对比图表与前三块互斥、重复区块修复；⑩去掉系统标题栏（`decorations:false` + 自绘 TitleBar + 8 向拉伸热区）；⑪项目管理/历史记录独立成页 |
| 导出文件管理（2026-10-25） | 新页 `pages/ExportManagerPage.tsx` + 侧边栏「导出文件」；记录表 `export_records`（SQLite，与项目同库）；接口 `GET/POST/DELETE /api/exports`；导出成功自动登记（表格/图表 = 单文件，盈亏平衡 = 文件夹 1 条）；「打开文件」「打开路径」走 Rust `open_file` / `open_folder`（资源管理器定位） |
| 指标区表达式重构（2026-10-27） | 指标从「行 + 连接符」换成**指标框 + 表达式记号**：区块标题栏 `+` = 新增一个指标（指标1…N，各自独立框）；框内右侧 `+` = 往当前指标追加字段槽；运算符只剩 `＋ － × ÷ ( )`（AND 取消），允许嵌套括号；选 `(` 自动补 `)` 占位、选 `)` 把前面字段整体括起来并把间距收紧到 2px、框内末尾恒留一个运算符位；每框可「合并 / 展开」；后端拿到 `(m1 - m2) / m3` 这种带括号的派生表达式，`buildAnalysisConfig` ↔ `rowsFromConfig` 双向可逆（缺省别名 `计算结果` / `计算结果N`，固定规则名字照旧） |
| 三块板块比例锁定（2026-10-27） | 分析页左栏：时间范围固定 96px、筛选条件 / 指标各拿剩余高度的 45%（剩 10% 是底部「开始计算」条，等于两块 1:1 分剩余空间），每块内部 `overflow: auto`，页面不再整体撑高；两个变量 `--zone-time-height` / `--zone-filter-weight` / `--zone-metric-weight` 就在 `.config` 里，改数字即可微调 |
| 图标全链路（2026-10-27） | 用户选 A 版（浅色卡片 + 深色线稿：圆角机身 + 显示屏 + 4 键）；`scripts/make_icons.py` 生成 16/24/32/48/64/128/256/512/1024 PNG，`npx tauri icon` 出自 `src-tauri/icons/*`（多尺寸 icon.ico 16/24/32/48/64/256 + icon.icns + Square*Logo）；侧边栏 logo 与标题栏小方块改用同一个 `src/assets/app-icon.png`；NSIS 的 Icon / UninstallIcon 仍走 `src-tauri/icons/icon.ico`（已替换） |
| 后端 | 口径过滤（`exclude`/`source`，`"全部"` = 不过滤）、导出文件夹（PDF/网格 JPG/单图 JPG/XLSX）、项目保存（items/total） |
| 安装包 | NSIS 离线包 + 精简包；安装前清旧进程、覆盖前清只读属性、写前探测目录可写性 |
| 需求 6：组合 X 轴（2026-10-28） | 图表 X 轴可叠加多个维度，刻度 = 各维度取值「·」连接（顺序 = 维度添加顺序；不勾取值 = 该维度全部）；排序/TopN 在组合列上做；导出前把组合列烘焙成结果表新列（`applyChartDisplay`），后端 matplotlib 只认列名；配置随项目快照保存，老的单字段配置自动升成 1 个维度（§9.1） |
| 需求 11：数据目录可改（2026-10-28） | 设置页「数据 → 更改目录」→ Tauri 目录对话框 → `PATCH /api/settings` → 复制 → 校验 → 原子替换 → 落设置（指针在 `%APPDATA%\accounting-workbench\settings.json`），旧目录整份保留；热切换后老项目照常打开；卸载提示改成「数据保留在你自选的数据目录」（§9.2） |

**真实数据实测结果（100 行 × 45 列）**

```
不剔除   -> 货量 4558.82 · P0 0.6442
剔除     -> 货量  260.00 · P0 0.0000
全部     -> 货量 4818.82 · P0 0.6095
普通物品 -> 货量 2311.82 · P0 0.3576
审报物品 -> 货量 2247.00 · P0 0.9391
```

---

## 2. 与原型 `shell-demo.html` 的差距（按优先级）

### P0 — 功能不对（用户已投诉）

| # | 差距 | 现状 | 要做成什么样 |
|---|---|---|---|
| 1 | 表格界面右上角入口 | ✅ 已改（2026-10-24）：固定规则 · 保存 · 分析 · 一键算，一键算 = 主按钮，左侧栏「高级计算」已移除 | — |
| 2 | 固定规则按钮 | ✅ 已改：向右展开的二级菜单（`.picker.cascade` 形态），选中后进分析页并预填；缺字段弹窗 | — |
| 3 | 单元格 / 整列选中 | ✅ 已改：新增行号列、三种选中模式、`aw-sel-*` 高亮、状态条移出网格（现在真的看得见） | 待用户实测确认手感 |
| 4 | 分析页布局 | ✅ 已重做（2026-10-24）：两区式 = 筛选条件 + 指标，行内删除/排序，见 §1 | 保持与 `_proto` 一致；后续只做 P1 视觉微调 |
| 5 | 分析页结果区 | ✅ 已改：`.resultTable { width: max-content }` + 容器横向滚动 + 合计行（无分组时不出合计行） | — |
| 6 | 「筛选条件」行 | ✅ 已改：筛选即分组维度，行内 运算符 + 值（文本多选 / 数值输入 / 介于双输入 / 无需填值） | — |

### P1 — 视觉与文案对齐（2026-10-25 已做完）

| 项 | 结果 |
|---|---|
| 字号层级 | ✅ 三个页面统一走 `src/styles/controls.css`（头部注释即对照表）：页标题 15/25px、区块标题 13px·600、字段标签 11px |
| 卡片 | ✅ `.card-soft` 与盈亏平衡页 `.cardSoft` 都改成原型值：圆角 10、内边距 12、边框 `--color-border-soft`、浅底 `--color-bg-sunken` |
| 分段控件 | ✅ 盈亏平衡页改用全局 `.segmented`（26px、0 12px、白底+阴影），模块内那份重复定义已删 |
| 表格 | ✅ AG Grid 走 CSS 变量对齐原型：行高 28px、表头 32px、字号 12px、单元格内边距 10px；盈亏平衡/看板的表头 7px 10px、行高 28px |
| 文案 | ✅ 结论卡「① 政策调整前 · 利润 / 利润率」「② 政策调整后 …」、分析段标题「调整盈亏情况分析」、汇总头「汇算明细（按分组）　合计货量 … · 计划货量 … · 利润 = (P0·计划折扣 − C) × 计划货量」 |
| 小图 | ✅ 标题 11px·500 secondary、图例 10px tertiary、卡片内边距 8px 10px 6px |

### P2 — 交互细节（2026-10-25 已做完）

- ✅ 盈亏平衡 `车线成本 / 操作成本` 已进 `RegressionInputs` + 项目快照（`pageState.RegressionSnapshot.cLine/opCost`），重开项目填得回。
- ✅ 看板「综合折扣 / 综合单价」改成带汇总行的区块（`.summary-pill`：加权值 + 简单平均 + Σ 明细行）。
- ✅ 导出提示改成页头按钮下方的横条（可关闭）+ 全局 toast，不再埋在右侧中间。

---

## 3. 踩过的坑（每条都真实踩过，别再踩）

1. **React effect 死循环 → 界面抖动 → WebView 白屏**
   依赖里放「每次渲染新建的对象」（如 `timeRange ?? {start,end,field}` 兜底对象）会让 `useCallback` 每次换身份 → effect 每次触发 → setState → 再渲染，无限循环，最终栈溢出把整个窗口打白。
   **做法**：拆成基元值（`timeStart/timeEnd/timeField`）+ `useMemo`；effect 里用 `JSON.stringify` 签名 + `useRef` 去重。

2. **前端传了口径，后端不生效 —— 路由器重建 config 时丢字段**
   `regression_router.py` 里 `RegressionTableConfig(...)` 只挑了 `time_range/dims/picks/policies`，`exclude/source` 被丢掉，所以切口径毫无变化。
   **做法**：任何 router 里 new config 都必须把新字段透传；`check_caliber.py` 就是为这条守的。

3. **422 的两个真实来源**
   - 分析页没选日期时 `timeRange` 是 `""` → `date` 解析失败 → 422。前端必须把空串回落到 `1970-01-01 ~ 2999-12-31`。
   - 手动测算把输入清空 → `Number("") = 0` → 后端 `p0 > 0` 校验失败 → 422。前端要先判 `p0>0 && z_plan>0` 再发请求。

4. **Windows 文件名不能有半角冒号**
   导出文件夹名 `YYYY-MM-DD HH：MM` 必须全角冒号，否则 `WinError 267 目录名称无效`。前端 `formatStamp()` + 后端 `folder_name()` 双保险。

5. **ECharts 自带图例与自定义图例叠字**
   图表里 `legend` 默认显示，和 HTML 线段图例重叠成「调整12」。**图表一律 `legend: { show: false }`**，图例用 HTML 自己画并按组上色（`color: PALETTE[i]`），`<i>` 用 `currentColor` 才会跟随。

6. **虚线看不见**
   调整前虚线斜率与调整后相同（折扣填成一样）时被实线盖住。**给虚线 `z: 5` + `width: 2.6`**，并在图例注明「两线重合」。

7. **markLine 用分类轴会显示序号**
   `{ xAxis: axis.findIndex(...) }` 的 label 默认显示的是分类序号（所以出现「12」）。要么改成值轴（`type: "value"` + 两个端点，线天然是直的），要么显式 `label: { formatter: '计划货量 10000' }`。

8. **ECharts 弯线**
   20–40 个采样点画同一条直线，视觉上会有弧度感/台阶。**用值轴 + 仅两个端点**最稳。

9. **`.nsi` 必须 UTF-8 with BOM**；`.ps1` 也必须 BOM（否则 Windows PowerShell 5.1 中文乱码/解析错误）。

10. **源码是 CRLF**：做字符串替换前先 `\r\n → \n`，替换完写回时再 `\n → \r\n`，否则 patch 静默不生效。

11. **`String.replace` 的 `$$` 陷阱**：替换串里有 `$` 要用函数式替换或 `split().join()`。

12. **AG Grid 选中**：只加 `onCellClicked` 不保证有可视反馈；`enableRangeSelection` 在 v32 社区版行为不确定。选中态要么用 `cellSelection`，要么自己维护 state 并用 `getRowStyle`/`cellClassRules` 上色。当前底部状态条已经接上，但**用户反馈看不到**，先查布局是否把它挤没了。

13. **`/api/import` 收 JSON 路径，不是 multipart**
   `{"path": "C:\\...\\xlsx"}`。测试脚本一开始用 `files=` 直接报错。

14. **`/api/regression/export/table` 要 `result`（计算结果）+ `out_dir`**
   不是配置文件。字段名是 `out_dir` 不是 `target_dir`。

15. **`/api/projects` 返回 `{items, total}`**，不是 `{projects}`。

16. **`optional` 与 pydantic 默认值**：`Field(default=None, "普通物品", description=...)` 这种写法会 `SyntaxError: positional argument follows keyword argument`，务必只留 `Field(default=None, description=...)`。

17. **`makensis` 报 `Internal compiler error #12345: error creating mmap`**
    沙箱给它的 `TEMP`（`...\dsh-xxxx`）无法在大文件上建 mmap。**先把 `$env:TEMP`/`$env:TMP` 指到
    `$PWD\.build-tmp\mknsis` 再跑**，一次就过。

18. **`npx vitest` 默认 glob 会去扫 `_proto/`**，撞上 e2e 残留的假 HOME
    （`_proto/_e2e_home`、`_e2e_full_home`、`_mei_tmp`、`_sidecar_run`，里面有 `Content.IE5` 之类的
    ACL 拒绝目录）→ `EPERM: scandir`。已在 `vite.config.ts` 里限定 `test.include = ["src/**/*.test.{ts,tsx}"]`。
    **那几个残留目录删不掉（Access denied），别再花时间删**。

19. **zustand v5 + `renderToString` 读不到新状态**：服务端渲染用的是 `getInitialState()`。
    做组件冒烟测试要先把当前状态拷进初始状态：
    `Object.assign(useAnalysisStore.getInitialState(), useAnalysisStore.getState())`。
    （见 `src/components/analysis/AnalysisWindow.smoke.test.tsx`）

20. **指标连接符挂在「上一行」上**：原型的 `renderMetricRows` 用的是 `metrics[index-1].op`，
    所以第 i 行上方的下拉要读/写 `metricRows[i-1].op`，写成 `row.op` 会永远显示 AND。

21. **分析页 store 已换成行模型**：`filters / groupBy / metrics / ratios` 这些字段都没有了，
    现在是 `filterRows / metricRows / derivedMetrics / timePreset` + `utils/analysisRows.ts` 的纯函数。
    发请求、保存项目、图表配置统一走 `buildAnalysisConfig`。

22. **AG Grid 的 `columnHeaderClicked` 不带原生事件**：`event.column` 类型是
    `Column | ProvidedColumnGroup`，也读不到 ctrlKey。**做法** = 在 `mousedown` 捕获阶段把修饰键存进 ref，
    点列头时读 ref；取列 id 前先 `if (!("getColId" in column)) return`。

23. **AG Grid 的选中高亮只能靠全局类名**：`cellClassRules` / `headerClass` 挂的类名在 AG Grid 自己生成的
    DOM 上，不在 CSS Module 作用域里。写成 `DataGrid.module.css` 里的 `.grid :global(.aw-sel-cell)`；
    改完选中态要 `api.refreshCells({force:true}) + api.refreshHeader()` 才会重算。

24. **测试里只要间接 import 了 ag-grid，chai 的 `toContain` 就抛
    `Right-hand side of 'instanceof' is not callable`**（全局类型探测被弄坏）。冒烟测试统一用
    `expect(html.includes("x")).toBe(true)`，别用 toContain。

25. **状态条被挤没的真实原因**：`.grid { height: 100% }` 放在 flex 列里会把后面的兄弟节点顶出可视区。
    正确结构 = `.wrap(flex column) > .grid(flex:1;min-height:0) + footer(28px)`。

26. **AG Grid 的右键事件也分三种**：`onCellContextMenu`（带原生 `event`，有坐标）、
    `onColumnHeaderContextMenu`（**不带** `event`）。列头右键坐标要在 `mousedown/click` 捕获阶段存进 ref。

27. **系统剪贴板在 WebView 里可能被拒**：`navigator.clipboard.readText/writeText` 一律 try/catch，
    失败就退化到 `tableStore.clipboard`（内部 TSV 矩阵）。粘贴用后端 `paste` / `cut_paste` 指令，
    `cut_paste` 一次提交「清源 + 写入」，别自己拼两次 set_cells（撤销会变成两步）。

28. **字号缩放别去改每个 px 字号**：全应用 px 写死，改 `html { zoom }` 最省事（0.9/1/1.1/1.2），
    与浏览器缩放同效果；主题走 `data-theme` + `theme.css` 里已有的深色变量。

29. **CSS Module 会哈希后代里的 `.on`**：`.tabs button.on` 编译成 `.tabs_x button._on_x`，而 JSX 写的是
    字面量 `"on"` → 选中态永远不生效（分析页 tab、帮助页目录都中过招）。全局类名一律写 `:global(.on)`。
    查法：`npx vite build` 后在 `dist/assets/*.css` 搜 `._on_`。

30. **HTML5 拖拽在 Chromium 必须 `dragstart` 里 `setData`**：只 `setDragRow(id)` 不会产生有效 drop，
    看起来「拖动排序没反应」。要 `effectAllowed="move"` + `setData("text/plain", id)`，`dragover`
    里 `preventDefault()` + `dropEffect="move"`，`drop` 时优先读 `dataTransfer.getData`。

31. **利润线画不直是轴的问题**：`xAxis.type = "category"` + 多点采样会被 ECharts 平滑/按索引排布；
    改 `type: "value"` 且**只喂两个端点** `[[z0, y0], [z1, y1]]`，markLine 用 `{xAxis: 数值}`（别再塞索引）。

32. **盈亏平衡图表范围（用户定稿）**：起点 =（当前货量, 当前利润），终点 `max(2×当前, 1.5×计划)`；
    手动模式用输入的 `z_now / z_plan`，分组模式用该组数据货量。`null` 计划值别当 0 用。

33. **图表落盘要后端写**：`renderChart` 只返回 Blob（浏览器下载）。桌面端走
    `POST /api/chart/render {path}` → 后端 `write_bytes` 并回 `{path, bytes}`；导出成功后统一
    `useExportStore.getState().record({path, kind, name})` 登记（失败不影响导出）。

34. **zustand v5 的 SSR 测试读 `getInitialState()`**：`setState` 之后必须
    `Object.assign(useXStore.getInitialState(), useXStore.getState())` 再 `renderToString`，
    否则渲染出来的还是初始状态（导出文件管理页的 smoke 测试就这么写）。

35. **看板口径值来自数据本身**：`是否剔除` / `物品来源` 的取值是「否/是」「派件/…」这种，不是原型里的
    「不剔除/剔除」。选项要由 `/api/values` 驱动，当前值不在选项里就落「全部」（发空串，后端不筛）。
36. **拖拽排序别用 HTML5 drag**：WebView2 里 `draggable` + `dragstart/setData` 仍可能被行内输入框吃掉；
    用 pointer 事件（pointerdown 记 id → pointermove 里 `document.elementFromPoint().closest("[data-drag-row]")`
    → pointerup 落位），行上挂 `data-drag-row`。

37. **图表「显示层」只在渲染前生效**：双击改的图例名（`label_aliases`）与 X 轴取值筛选（`x_values`）都是前端配置，
    后端渲染 PDF/JPEG 只认结果表列名 —— 导出前必须用 `applyChartDisplay()` 把列名/行筛选烘焙进结果表。

38. **无边框窗口要自己补三样**：`decorations:false` + 自绘标题栏（`data-tauri-drag-region` 拖动、双击最大化）
    + 四边四角 `startResizeDragging` 热区；capability 里要显式给
    `core:window:allow-minimize / allow-toggle-maximize / allow-close / allow-start-dragging / allow-start-resize-dragging`。

39. **盈亏平衡图的「轴」与「线」分开看**：轴从 0 起（xAxis.min=0），利润线只画「当前货量 → max(2×当前, 1.5×计划)」
    两点的连线；参考线标签要把数值拼进 formatter，否则只显示四个字。

40. **一键算的四个功能块**：`compare` 与前三块互斥（点图表取消前三块），且 map 渲染时要 `if (key === "compare") return null`，
    否则会掉进折扣/单价分支、重复出「公斤段单价」。


---

## 4. 关键文件地图

```
src/pages/RegressionPage.tsx       盈亏平衡整页（最重要，改动最多）
src/pages/RegressionPage.module.css
src/pages/BoardPage.tsx / .module.css
src/pages/AnalysisPage.module.css  分析页样式（按原型重写）
src/pages/SettingsPage.tsx / .module.css     设置页（主题 / 字号 / 数据 / 关于）
src/pages/HelpPage.tsx / .module.css         帮助页（原型 HELP_DOCS 五分页，占比说明已随功能删除）
src/pages/ExportManagerPage.tsx / .module.css 导出文件管理页（文件名/时间/项目/创建人/路径 + 打开）
src/stores/exportStore.ts          导出记录（load/record/remove/clear + openFile/openFolder）
src/stores/projectRef.ts           当前项目只读快照（避免 store 循环依赖）
src/api/exports.ts                 导出记录接口
src/utils/platform.ts              pickOpenPath / pickSavePath / invokeCommand（Tauri 命令壳）
src/stores/settingsStore.ts        主题 + 字号（localStorage 持久化，html zoom）
src/components/analysis/AnalysisWindow.tsx   分析页
src/components/analysis/Picker.tsx           字段选择器 / 取值多选器（原型 .picker）
src/components/analysis/FixedRuleMenu.tsx    表格页固定规则二级菜单（向右展开）
src/components/chart/ChartConfigPanel.tsx    图表三行控件（类型 / X 轴 / Y 指标 chips）
src/utils/analysisRows.ts          行模型 ↔ AnalysisConfig（纯函数，有单测）· 指标是 MetricBox（tokens = slot/op/paren）
src/utils/gridSelection.ts         表格选中模型（cell/row/col/all + 状态条文案，有单测）
src/utils/gridClipboard.ts         TSV 剪贴板（复制范围 / 粘贴落点，有单测）
src/components/table/DataGrid.tsx  表格 + 行号列 + 选中高亮 + 右键菜单 + 状态条
src/components/table/ContextMenu.tsx 右键菜单（原型 .ctx）
src/pages/WorkspacePage.tsx        表格页（右上角按钮组 + 工具栏 + 查找框）
src/styles/controls.css            原型通用控件（.btn/.input/.segmented/.table/.flyout，有对照表注释）
src/components/layout/Sidebar.tsx   左侧菜单（已按原型去掉「高级计算」，设置/帮助进页面）
src/stores/econStore.ts             boardInputs / regressionInputs / runTableModel / exportTable
src/stores/analysisStore.ts         filterRows / metricBoxes / timePreset / compute / exportTable / exportChart
backend/accounting_backend/compute/filters.py     15 种运算符（含 between / 开头是 / 平均值）
backend/accounting_backend/compute/engine.py      meta: totals / scanned / ranged / filtered / group_counts
backend/accounting_backend/compute/field_values.py 字段取值（可按时间范围收窄）
backend/accounting_backend/compute/regression.py   table_groups 口径过滤 + 盈亏数学
backend/accounting_backend/compute/board.py        build_board
backend/accounting_backend/routers/regression_router.py  ← 坑 2 就在这
backend/accounting_backend/routers/chart_router.py       path 直写盘（坑 33）
backend/accounting_backend/storage/export_store.py       导出记录表 export_records
backend/accounting_backend/routers/export_records_router.py  /api/exports
src-tauri/src/commands.rs                                 get_backend_port / open_file / open_folder
backend/accounting_backend/io/regression_exporter.py      导出文件夹
_proto/shell-demo.html              唯一设计基准（1:1 目标）
assets/icon/candidates/             图标候选（A/B/C 三版 256 + 三联张 + 小尺寸实测）
assets/icon/A/                      挑定版的 16/24/32/48/64/128/256/512/1024 PNG
src/assets/app-icon.png             侧边栏 logo / 标题栏小方块用的 256px 图标（Vite 打包成 hash 资源）
scripts/make_icons.py               图标生成器（Pillow；candidates / master / render 三个子命令）
backend/tests/test_compute_derived_parens.py  派生表达式括号求值（嵌套 / 优先级 / 分母 0 留空）
backend/scripts/e2e_real_data.py    真实数据全链路（含分析页：compute / 新运算符 / values）
backend/scripts/check_caliber.py    口径守门
```

---

## 5. 下一窗口的执行顺序（建议）

1. ~~先把 `_proto/shell-demo.html` 的三页 CSS/结构抽成一份对照表~~ ✅ 落到 `src/styles/controls.css`（头部注释即对照表）+ `variables.css` 补齐 `--color-bg-sunken / --color-warn-*`。
2. ~~**分析页重做**（P0 第 4–6 条）~~ ✅ 已完成并出包（2026-10-24）。
3. ~~**表格页右上角**：加「一键算」按钮，固定规则改二级菜单（P0 #1–2）~~ ✅ 已完成并出包（2026-10-24）。
4. ~~**表格选中**：状态条可见 + 单元格/整行/整列高亮（P0 #3）~~ ✅ 已完成并出包（2026-10-24）。
5. ~~**视觉对齐**：按第 2 节 P1 逐项改 CSS 与文案~~ ✅ 已完成并出包（2026-10-25）。
6. ~~**表格工具栏 + 右键菜单 + 剪贴板 + 快捷键**~~ ✅ 已完成并出包（2026-10-25）。
7. ~~**设置页 + 帮助页 + P2 三项**~~ ✅ 已完成并出包（2026-10-25）。
8. ~~**占比四模式**：用户 2026-10-25 决定「砍掉」~~ ✅ 已从前端与后端**全部删除**
   （`compute/ratios.py`、`AnalysisConfig.ratios`、`ImportResponse.ratio_presets`、
   `ProjectDetail.ratio_presets`、`tableStore.ratioPresets`、帮助页与帮助弹窗的占比说明；
   后端测试 160 → 152，删掉了 8 条占比用例）。要算占比用指标行 `÷` 连接符。
9. 每改完一页：`pytest` → `tsc` → `vitest` → `scripts/e2e_real_data.py` → `backend/build.py`（若动后端）→ `tauri build` → `makensis` → 交用户验收。

### 还剩下的（只能真机验证）

1. ~~**分析页图表两处刻意简化**~~ → 渲染仍用 ECharts（原型手绘 SVG，这条继续挂着）；X 轴的「维度 → 已勾选取值」级联多选 + 跨维度组合已在 2026-10-28 第三轮补上（§9.1）。
2. 待真机实测：新工具栏/右键菜单/剪贴板手感、主题与字号缩放（`html zoom`）、
   帮助页与设置页的观感、行号列宽度。

### 待用户实测确认的点（这三条只有真机能验）

1. 表格点单元格 / 行号 / 列头，高亮与状态条是否够明显（Ctrl 点列头可累加多列）。
2. 固定规则二级菜单在窗口右边缘的展开位置是否顺手。
3. 侧边栏去掉「高级计算」后，找盈亏平衡是否习惯（路径：表格 → 分析 → 右上「盈亏平衡分析」）。

---

## 6. 用户已明确的要求（不要违背）

- 三页必须**严格 1:1 复刻 `_proto/shell-demo.html`**（样式、分区、控件、交互、文案）。
- 安装包必须**完全离线**可用；只做 Windows。
- 权限类操作直接执行，不要反复确认；方案类问题才问。
- 界面文字与排版要做**视觉对齐**。
- 每次交付前跑**完整测试**，并用真实表格 `C:\Users\13774\Desktop\网络部\网点数据看板\数据原表（前100行）.xlsx` 验证。

### ~~待做：指标区表达式重构（用户 2026-10-27 定稿需求）~~ ✅ 已完成（2026-10-27）

**两个 `+` 的语义（必须区分清楚）**
- 区块标题栏右侧 `+`：新增**一个指标**（指标1…N），每个指标一个独立框。
- 指标框内右侧 `+`：往**当前指标内**追加一个字段槽（字段 + 计算方式，见图3 样式）。
- 提示文案改成：`点击右侧 + 新增指标，点击指标框内 + 新增计算字段`。

**指标框内容**：一行表达式 `字段(计算方式) 运算符 字段(计算方式) …`
- 运算符只保留 `＋ － × ÷ ( )`，**取消 AND**（指标之间不再有连接符，改为并列的指标框）。
- 允许**嵌套括号**；`(` 与 `)` 都作为运算符提供。
- 选 `)` 时：把同一指标内 `)` 前面的所有字段整体括起来，字段框间距自动收紧缩小，并在下方自动补一个运算符选择位。
- 选 `(` 后自动补一个 `)` 占位，可再点 `)` 关闭。

**尺寸/对齐**
- 指标框 : 字段框 宽度比 = **1.3 : 1**。
- 字段框相对指标框左侧**缩进 1 个 tab（24px）**，右侧与指标框**垂直对齐**。

**保留**：现有的「展开 / 合并」按钮（不删除）。

**后端**：派生表达式按括号拼成 `(原价合计 - 现价合计) ÷ 原价合计`，别名继续 `计算结果N` / `指标N`。需要 `analysisRows.derivedMetricsOf` 支持括号序列，且 `buildAnalysisConfig` 与 `rowsFromConfig` 双向可逆。

### ~~待做：三块板块比例锁定~~ ✅ 已完成（2026-10-27）

时间范围 / 筛选条件 / 指标三块**固定高度**（超出各自内部滚动），比例按用户图7：
- 时间范围：固定 ~96px（日期行 + 标题）
- 筛选条件：占剩余高度 45%
- 指标：占剩余高度 45%（剩余 10% 给底部「开始计算」条）
具体数值等用户看过一版再微调；每块内部 `overflow: auto`，不再把页面整体撑高。

### ~~待做：图标全链路替换~~ ✅ 已完成（2026-10-27，用户选 A 版）

1. 先出 2–3 版 256px 计算器图标（深色线稿、圆角机身 + 显示屏 + 4 键），用户挑定；
2. 生成 16/24/32/48/64/128/256 PNG + icon.ico（多尺寸）+ icns；
3. 替换 `src-tauri/icons/*`、侧边栏 logo、标题栏小方块、`installer/windows/workbench.nsi` 的 `Icon`/`UninstallIcon`（换完要清理 shell 图标缓存再验收）。

---

## 7. 2026-10-27 这轮怎么落的（改之前先读这段）

### 7.1 指标框模型（`src/utils/analysisRows.ts`）

- 一个指标 = 一个 `MetricBox`，`tokens` 是有序记号数组：
  `{kind:"slot", slot:{id, field, agg, alias?}}` / `{kind:"op", id, value:"＋"|"－"|"×"|"÷"}` / `{kind:"paren", id, value:"("|")"}`。
- **框内末尾恒留一个 `op` 记号**（默认 ＋）：它既是「下一个运算符位」，也是选 `)` 的落点；
  `appendMetricSlot()` 追加字段后会再补一个，`defaultMetricBox()` / `boxesFromMetrics()` 也都补。
- `applyOpChoice()` 是三条交互的唯一实现：四则直接改值；`(` 在运算符后插左括号并在末尾补 `)`；
  `)` 在运算符位前插右括号（前面没配平的 `(` 就在开头补一个），运算符位原样留着。
- `atomsOf()` 是表达式兜底：丢空槽、配平括号、删悬空运算符（`a ＋`、`( )` 都会被清掉），
  所以界面上怎么乱点，发给后端的表达式都合法（`(m1 - m2) / m3` 这种嵌套括号后端 ast 直接吃）。
- 别名：字段列还是「字段 + 聚合简称」，固定规则给的 `现价合计 / 货量 / 单公斤价格 / 折扣` 照旧；
  多字段指标框多出一列「计算结果」（只有一个计算框时叫「计算结果」，多个才编号 `计算结果1/2`）。
- `rowsFromConfig()` 用 `parseExpression()` 把派生表达式按「别名 / id 最长匹配」拆回记号，
  所以保存 → 打开 → 再保存是幂等的；解析不了的（比如 `m1 * 2` 这种带常量）挂在 `rawExpression` 上原样保留，不丢列。
- **旧项目快照兼容**：`pageState.analysis.metricBoxes`（新）优先，没有就走 `boxesFromLegacyRows(metricRows)`
  按 AND 切开。别再按 `row.op` 找连接符了，`AnalysisMetricRow` 还是老的（只在 `LegacyMetricRow` 里）。

### 7.2 布局的可调旋钮（`src/pages/AnalysisPage.module.css`）

```css
.config {
  --zone-time-height: 96px;   /* 时间范围固定高度 */
  --zone-filter-weight: 1;    /* 筛选条件 : 指标 = 1 : 1 → 各 45%（剩下 10% 是底部条） */
  --zone-metric-weight: 1;    /* 想试 40%/50% 就写 0.8 / 1.2 */
}
.sectionMetric {
  --metric-box-ratio: 1.3;    /* 指标框 : 字段框 宽度比（1 就是字段框铺满整行） */
  --tab: 24px;                /* 字段框左缩进 = 1 个 tab */
}
```
实测（1180px 窗口、左栏 58%）：指标框 499px、字段框 365px，比值 1.37（含 24px 缩进与内边距），缩进 25px。

### 7.3 图标

- 生成器 `scripts/make_icons.py`：`candidates` 出三版候选 + 三联张；`master A` 出 1024 原图；`render A` 出全套 PNG。
- `npx tauri icon assets/icon/A/1024x1024.png` 写 `src-tauri/icons/`（多尺寸 ico、icns、Square*Logo）；
  它顺带生成的 `android/` `ios/` 已删（只做 Windows）。
- 侧边栏 logo / 标题栏小方块用 `src/assets/app-icon.png`（Vite 打包成 hash 资源，`vite-env.d.ts` 已有 vite/client 类型）。
- 换完图标要清 shell 缓存，见 §0 之外的命令：
  `ie4uinit.exe -show`（Win10/11 刷新图标缓存）；不行再删 `%LOCALAPPDATA%\IconCache.db` 与 `%LOCALAPPDATA%\Microsoft\Windows\Explorer\iconcache_*.db` 后重启资源管理器。

### 7.4 新增的坑

41. **指标区模型换了**：`analysisStore.metricRows` → `metricBoxes`，动作名也全换了
    （`addMetricBoxes` / `addMetricSlots` / `updateMetricSlot` / `removeMetricSlot` / `removeMetricBox` /
    `moveMetricBox(To)` / `setMetricOp` / `removeMetricParenToken` / `toggleMetricCollapse`）。
    旧名（`addMetricRows` / `setMetricConnector` / `collapseMetricChains` / `appendMetricToGroup` / `toggleMetricGroup`）
    已删，`App.tsx` 里「以此列分析」也改成走 `addMetricBoxes`。
42. **静态页面自查的野路子**（不开 Tauri 也能看布局）：把分析页 `renderToString` 成 HTML（临时 test 里写文件），
    用正则 `_([A-Za-z0-9]+)_[a-z0-9]{5,6}` 脱掉 CSS Modules 哈希，再把 `src/styles/*.css` + `AnalysisPage.module.css`
    拼成一个普通 CSS（`:global(.on)` 要替换成 `.on`），最后 `msedge --headless=new --screenshot` 截图。
    查完记得删临时 test（`src/**/*.test.tsx` 会被 vitest 扫到）。
43. **`vite build` 里有 `import appIcon from "../../assets/app-icon.png"` 这类资源**：改图标时别只换 `src-tauri/icons`，
    `src/assets/app-icon.png` 也要同步（它是界面里那个 logo 的来源）。

---

## 8. 2026-10-28 第二轮反馈 13 条（13 条全部完成；第 6、11 条见 §9）

| # | 需求 | 落点 |
|---|---|---|
| 1 | 删掉图表上方的标题编辑框（图表里已有标题） | `components/chart/ChartConfigPanel.tsx` 去掉 `.title` 那个 input；`config.title` 留空即自动生成 |
| 2 | 导出下拉点别处不收起 | `AnalysisWindow` 加 `exportRef` + `mousedown` 外部点击关闭（`useEffect` 依赖 `exportOpen`） |
| 3 | 结果表没有横向滚动条 | `.resultBody` 改 flex 列 + `.tableWrap { flex:1; min-height:0; overflow:auto }`，横条落在可见区底部 |
| 4 | 时间范围卡片底被切 | `--zone-time-height: 96px → 106px`，`.sectionTime .sectionBody` 内边距收到 `8px 12px 10px` |
| 5 | 导出命名 | 表格：`分析结果_项目名 · 表格名_YYYY-MM-DD HH：MM.xlsx`；图表：`X轴取值 · Y轴指标分析_YYYY-MM-DD HH：MM.pdf`（取 `x_values` 前 6 个、`show_fields[0]`；全角冒号） |
| 6 | X 轴跨字段取交集（多维度组合） | ✅ 2026-10-28 第三轮：`ChartConfig.x_dims` 叠维度 + 取值；刻度 = 各维度取值「·」连接（顺序 = 添加顺序，不勾 = 全部）；`chartData.xDimsOf/normalizeChartConfig/prepareChartData/applyChartDisplay` 一条链；导出前烘焙成结果表新列（列名 `字段1·字段2…`）+ `sort_by=custom` 保证预览=导出；老的单字段配置自动升成 1 个维度；浮层改 portal（滚动容器会裁切）+ 取值上限 120/关键字筛选；刻度分隔符「 · 」带空格。详见 §9.1 |
| 7 | 取消行列上限 | 后端 `io/importer.py` 删 `MAX_ROWS/MAX_COLS` 与 `_apply_limits()`；`WelcomePage`/`HelpPage`/`AGENTS.md` 文案同步；测试 163 → 164 |
| 8 | 首页拖文件建项目 | WebView2 拿不到 HTML5 drop 的完整路径 → `App.tsx` 用 `getCurrentWebview().onDragDropEvent` 监听 drop，`NewProjectDialog` 新增 `initialPath`（预填路径 + 文件名当项目名） |
| 9 | 侧边栏排版 | `.brand` 高 +12px、logo 22→30、标题 13→16、副标题 10→11、`gap` 10→12 |
| 10 | 右键菜单重叠 | `main.tsx` 全局 `contextmenu` `preventDefault`（输入框/可编辑区除外，保留原生粘贴菜单） |
| 11 | 数据目录可改 | ✅ 2026-10-28 第三轮：指针文件 `%APPDATA%\accounting-workbench\settings.json`；`GET/PATCH /api/settings`；`services/settings_service.py` 复制→校验→原子替换→落设置（旧目录整份保留、失败回滚到原目录）；设置页「数据 → 数据目录」显示当前路径 + 打开 + 更改目录 + 说明条；`.nsi` 卸载文案改成「数据保留在你自选的数据目录」。详见 §9.2 |
| 12 | 一键算默认勾选 | `BoardPage` 的 `features` 初值 → `["flow","discount","price"]`（compare 不勾；页面条件渲染，切走即卸载，回来仍生效） |
| 13 | 放大图表没图例 | `BoardPage` 放大弹窗内补 `.zoomLegend`（同一份 `legendItems`、`currentColor` 上色），`.zoomBody` 可滚动 |

**新增的坑**
44. **WebView2 里 HTML5 drop 事件拿不到文件路径**：必须用 `@tauri-apps/api/webview` 的 `onDragDropEvent`（`payload.type === "drop"` 时读 `paths[0]`），
    capability 只要 `core:default` 即可，不用额外权限。
45. **右键菜单是「原生 + 自绘」两份**：表格/列头都有自绘菜单，必须全局关掉原生菜单，否则叠在一起（图 11）；
    但输入框里要留原生菜单（粘贴），所以 `preventDefault` 只对非输入区生效。



---

## 9. 2026-10-28 第三轮：需求 6（组合 X 轴）+ 需求 11（数据目录可改）

### 9.1 需求 6：X 轴跨字段取交集（多维度组合）

**数据模型**（`src/types/api.ts`）：`ChartConfig.x_dims?: { field: string; values?: string[] }[]`。

- 语义：`values === undefined` = 该维度全部取值（沿用「不勾 = 全部」）；`values: []` = 该维度一条都不留（图表空）。
- `x_axis` / `x_values` 始终与 `x_dims[0]` 同步，老的单字段逻辑一行没改。
- 老项目快照只有 `x_axis + x_values`：`normalizeChartConfig()`（`src/utils/chartData.ts`）把它升成 1 个维度；
  脏字段（标题不是字符串、排序值非法、`x_dims` 重复字段、成环的别名）一律丢掉，旧项目不会读崩。

**组合标签**：各维度取值按「维度添加顺序」用 `·`（不带空格，按用户给的例子）连接，例如
`金华婺城·浙江省·0-60`。排序：`sort_by = "x"` 时按「各维度取值顺序」的元组排（= 笛卡尔积顺序），
`sort_by = "y"` 时照旧按指标合计排；Top N 作用在分类列表上。

**导出 PDF/JPEG**：后端 matplotlib 只认结果表列名，所以 `applyChartDisplay()` 做四件事：
①按各维度勾选的取值筛行；②新增一列（列名 = `字段1·字段2…`）写入组合标签；③按预览顺序重排行并把
`sort_by` 改成 `custom`（后端不再重排）；④清空 `x_dims`、`x_axis` 指向新列。
这样「预览看到什么，导出就是什么」（含 Top N 取到的项）。后端 `schemas/chart.py` 只多一个 `x_dims`
（接受但不参与渲染），`chart/builder.py` 不用改。

**界面**（`components/chart/ChartConfigPanel.tsx`）：X 轴按钮文案 = `字段1 × 字段2 · 已选 N 项 / 全部`；
级联菜单左边勾维度（带组合序号 1/2/3 + 该维度已选取值数），右边改当前维度的取值；
「全选 / 取消全选」只作用于当前维度。样式走 CSS Modules + 变量（`.dimRow/.dimRowOn/.dimOrder/.dimMeta`）。

**浮层为什么用 portal（2026-10-28 真机反馈「点不开 / 卡住」的根因）**：分析页右侧 `.resultBody` 是
`overflow: auto` 的滚动容器，弹层渲染在里面会被裁掉、还会撑出横向滚动条把图表画布挤变形。
现在弹层 `createPortal` 到 `document.body`、`position: fixed` + 视口夹取（`left` 夹进窗口、
下方放不下就往上弹、`max-height` 按剩余高度收），开关弹层不再动结果区的滚动条与布局。
二级取值列表另外加了「上限 120 项 + 关键字筛选」（真机数据 23 万行时一列可能有十几万个取值），
「全选」= 该维度不筛（不把几十万个取值写进配置）。

**刻度分隔符**：`X_DIM_SEPARATOR = " · "`（两边带空格，用户 2026-10-28 定稿）；
烘焙成结果表列名时用 `·`（`X_DIM_NAME_SEPARATOR`，无空格），导出表头更好看。

### 9.2 需求 11：数据目录可改

**配置指针**：`%APPDATA%\accounting-workbench\settings.json`（内容 `{"data_dir": "..."}`）。
不能放在数据目录里（会自我引用）；`ACCOUNTING_WORKBENCH_CONFIG_DIR` 可覆盖（测试 / e2e 用）。
`paths.get_data_dir()` 读指针（进程内缓存，`set_data_dir()` 会同步刷新）；无指针 / 空值 / 坏 JSON 一律回默认
`~/.accounting-workbench`，所以老用户升级后行为不变。

**迁移流程**（`services/settings_service.py`，失败绝不半迁移）：

1. 校验：不能是当前目录、不能互相嵌套、不能是文件、真写探针确认可写、目标里不能已有
   `projects.db` / `projects` / `datasets`（有就报错换目录，不合并、不覆盖）；
2. 复制到目标里的暂存目录 `.aw-migrate-<时间>-<pid>`（跳过 `logs`、`.mplcache`、`settings.json`、SQLite 临时文件）；
3. `projects.db` 用 `sqlite3.Connection.backup()` 复制（WAL 里已提交的事务不会丢），
   再校验「文件数 + `projects` / `export_records` 行数」，不一致就清掉暂存目录并报错；
4. 逐项 `os.replace` 搬进目标根目录（同盘 = 原子重命名），任何一步失败删掉已搬的副本；
5. 最后才写指针；指针写失败就把新副本删掉、回滚到原目录（旧目录从未被改动）；
6. 旧目录从头到尾只读不改，迁移完仍完整保留一份。

**接口**：`GET /api/settings` → `{data_dir, default_data_dir, is_default, project_count}`；
`PATCH /api/settings {data_dir}` → `{settings, migration: {data_dir, previous_dir, copied_files, kept_previous}}`。
错误码：`DATA_DIR_INVALID` / `DATA_DIR_UNCHANGED` / `DATA_DIR_NOT_WRITABLE` / `DATA_DIR_NOT_EMPTY` /
`DATA_DIR_MIGRATE_FAILED` / `DATA_DIR_SETTINGS_FAILED`。

**界面**：设置页「数据 → 数据目录」= 当前路径（超长省略、悬停看全路径）+「打开」+「更改目录」，
下面一行说明条写清「默认位置 / 自定义位置 / 上次迁移到哪、旧目录已保留」；确认弹窗后才迁移。
Rust 侧 sidecar 日志改到 `%APPDATA%\accounting-workbench\logs\sidecar.log`（不再往数据目录里丢 `logs/`）。

**卸载文案**：`installer/windows/workbench.nsi` →「数据保留在你自选的数据目录（默认 %USERPROFILE%\.accounting-workbench）」。

### 9.3 验证数据（本轮）

- `pytest tests -q` → **176 passed**（+12：settings 11 条 + 图表组合渲染 1 条；含「目标路径含 Windows 非法字符 → 400 DATA_DIR_INVALID 而不是 500 堆栈」与「全新安装（数据目录还不存在）改目录不报错」）
- `npx tsc --noEmit` → 无输出
- `npx vitest run` → **116 passed**（+19：chartData 组合用例 12 条 + settingsStore 数据目录 4 条 + 设置页 1 条 + 图表面板冒烟 2 条）
- `scripts/e2e_real_data.py` → 全链路 200（含新末尾步骤：改数据目录 → 复制 4 个文件 → 旧目录保留 True →
  迁移后打开老项目 200、行数 100 与迁移前一致）
- X 轴浮层静态靶场（真 Chromium：`vite build` 打一份单页 → `http.server` → headless Edge 自动点击）：
  修复前 `flyout` 在 `.resultBody` 里被裁且容器出现横向溢出（`scrollW 516 > clientW` 的那次量到溢出）；
  修复后 `position=fixed zIndex=400 insideViewport=true`、容器 `resultBodyHScroll=false`、
  取值列表 `checkboxes=122`（120 上限 + 2 个维度）、点击链路 `x_dims → x_values → 完成关闭` 全通
- 打包后的 sidecar 冒烟（`src-tauri\binaries\sidecar\accounting-backend.exe` 直接起在随机端口）：`GET /api/health` 200、`GET /api/settings` 返回新结构、`PATCH /api/settings` 迁移成功并写出指针文件；非法路径返回 400 `DATA_DIR_INVALID`

### 9.4 新增的坑

46. **CSS Module 的类名映射在 vitest 里是 Proxy**：`Object.keys(styles)` 是空数组（拿不到类名），
    做静态预览要自己从 CSS 文件里扫类名再逐个 `styles[name]` 取哈希。
47. **`renderToString` 前必须把当前状态拷进 `getInitialState()`**（坑 19/34 的复用）：否则图表面板读到
    `result === null` 直接返回空，页面看着像没渲染。
48. **headless Edge 截图在沙箱里起不来**（`OpenProcess: 拒绝访问`、crashpad 失败）：要 `danger-full-access`，
    并把 `--user-data-dir` 指到工作目录里。另外 `.flyout` 有 150–200ms 的 `flyoutIn` 动画，
    截图看起来「半透明/叠字」是没播完，不是样式 bug。
49. **`%APPDATA%` 不会被 `USERPROFILE` / `HOME` 覆盖**：`e2e_real_data.py`、`check_caliber.py` 必须显式
    `os.environ["APPDATA"] = str(home / "appdata")` + `XDG_CONFIG_HOME`，否则「数据目录」设置会读真实用户配置，
    把 e2e 数据写进真实数据目录。
50. **迁移时不能直接 copy SQLite 主库**：WAL 模式下 `projects.db` 可能缺最近提交，必须走
    `sqlite3.Connection.backup()`，再用 `SELECT COUNT(*)` 校验 `projects` / `export_records` 行数。
51. **全新安装时改数据目录会 500**（打包后的 sidecar 冒烟才抓到）：数据目录还不存在时没有暂存目录，
    `_move_into_place(staging)` 里的 `staging.iterdir()` 直接 `WinError 3`。修法：`current.is_dir()` 才走
    「复制 → 校验 → 搬」，`_move_into_place` 也先判 `staging.exists()`。**单元测试要覆盖「数据目录还不存在」**，
    别只在「已经有项目」的情况下测迁移。
52. **`overflow: auto` 滚动容器里的下拉弹层会被裁掉**（真机「X 轴点不开」就是这个）：分析页
    `.resultBody` 是滚动容器，弹层渲染在里面既被裁、又撑出横向滚动条把图表画布挤变形（手感像卡死）。
    下拉类浮层一律 `createPortal` 到 `document.body` + `position: fixed` + 视口夹取，别跟滚动容器纠缠。
53. **静态靶场能复现这类布局问题**（比翻代码快）：`.build-tmp/harness/` 用 `vite build` 把
    `ChartConfigPanel` 单独打成一个静态页（临时 `vite.config.ts`，`base: "./"`），`python -m http.server`
    起服务（`file://` 下 ES module 会被 CORS 挡），headless Edge `--dump-dom` / `--screenshot` +
    页面里 `setTimeout` 自动点击，再把测量结果 `fetch('/log?msg=...')` 回报给 http server 的日志 ——
    弹层矩形、`position/opacity`、容器 `scrollWidth/clientWidth` 全能量到。
    注意 headless 的虚拟时间不推进 CSS 动画（`opacity` 停在 0），截图前先注入 `*{animation:none}`。

---

## 10. 2026-10-28 第四轮：真机 5 条反馈（组合 X 轴验收后）

| # | 反馈 | 落点 |
|---|---|---|
| 1 | X 轴弹层里字段/取值默认全不勾 | `ChartConfigPanel`：取值复选框改成「显式勾过的才打勾」（不勾 = 全部）；从「全部」勾一个取值 = 只要这些，勾空回到「全部」；footer 简化成「全部 / 完成」；给未上轴的字段勾取值会自动把它加成维度 |
| 2 | 刻度文字被遮挡、放大后 Esc 关不掉 | `ChartPreview`：新增 `wrapCategoryLabel()`（每行 9 字、最多 3 行，前后端同一套）+ 画布按分类数/最长城确定最小宽度、外面横向滚动；放大弹层监听 Esc 关闭 |
| 3 | 导出与预览不一致（标题不加粗、刻度叠字、图例「数值」） | 后端 `chart/builder.py`：标题 16pt + 叠画一遍模拟加粗、刻度先折行再按阈值倾斜、分类轴按下标画、去掉重复的 X 轴名、饼图恒带百分比、图例名 = Y 指标名、按分类数自动定画布宽；前端 `prepareChartData` 把单系列名改成 Y 指标名，`applyChartDisplay` 在标题为空时补上和预览一样的自动标题 |
| 4 | 指标字段下拉延伸出版面、点不到确认；所有下拉统一「点外面 = 生效」 | `Picker`：量一次真实尺寸把弹层夹进窗口（`max-height` + 列表内部滚动，footer 永远可见）；点弹层外面 = 收起并让勾选生效（没改过则等同取消）；Esc 仍取消。审计过的其它浮层：X 轴浮层（portal + 视口夹取）、一键算网点/维度浮层（mask + 勾选即生效 + `max-height`/宽度上限）、导出下拉（点外部收起）、固定规则二级菜单（点规则即应用，不涉及勾选） |
| 5 | 一键算只勾 1/2/3 个功能时表格没铺到底 | `BoardPage.module.css`：`.section` 改 `flex: 1 1 0; min-height: 136px; display:flex; column`，`.matrixWrap` 改 `flex:1; min-height:0` 内部滚动 → 1 个铺满、2 个各半、3 个各三分之一 |

**新增的坑**

54. **`path_effects.withStroke` 会把文字变成矢量路径**：PDF 里就没有文本层了（`pypdf` 提取不到标题，测试直接挂）。
    只分发 Regular 字体时要「假加粗」，用同一位置叠画两遍文字（偏移 0.00035 图宽），文本层和观感都保住。
55. **分类轴标签不能只靠 ECharts 自己躲**：`interval: 0` + 长标签 + 窄画布必然重叠。做法是
    ①同一套折行规则（前端 `wrapCategoryLabel` / 后端 `wrap_label`，每行 9 字、最多 3 行）；
    ②按「最长行字数」给画布算最小宽度，交给外层 `overflow-x: auto` 横向滚动；
    ③放大弹层宽度足够时用 100%，不再滚。

---

## 11. 2026-10-28 第五轮：真机 5 条反馈（第二轮）

| # | 反馈 | 落点 |
|---|---|---|
| 1 | 改筛选条件重算后，图表 X 轴仍留着旧字段/旧取值 | `chartData.reconcileChartConfig(result, config)`：维度字段不在新结果表 → 删；勾的取值不在新结果 → 丢（丢空 = 该维度不选）；`show_fields/y_axis/series` 一起对齐；`analysisStore.compute()` 拿到结果后调用，没变化不写 store |
| 2 | X 轴二级菜单一滚轮/拖滚动条就收起 | `ChartConfigPanel` 的 scroll 监听加 `pickerRef.contains(event.target)` 判断：浮层内部滚动不收起，只有外层页面滚动才收 |
| 3 | 取值语义改成「不勾 = 不选」，全选/取消全选装回来 | 界面新加的维度一律写 `values: []`（不选）；`checked = allSelected（老配置）or chosenSet.has(value)`；footer = 全选（写全部取值）／取消全选（写 `[]`）／完成；提示文案「不勾 = 不选，勾几项 = 只取这些 ｜ 已勾 N 项」。老配置（`values === undefined`）仍按「不筛」处理，向后兼容 |
| 4 | 刻度还是挤；要按 X 轴字段多少自适应字号/斜度（预览+导出） | 新增 `fitAxisLabels(labels, perCategoryPx)`（前端）与 `fit_labels(labels, per_category_pt)`（后端）：按每个刻度可用宽度算字号（7.5–11）、斜度（0/30/45/60）、每行字数、以及「隔几个显示」（`interval`/`set_xticks(::step)`）；`ChartPreview` 用 `ResizeObserver` 量画布宽度、固定板块尺寸不再横向滚动；放大弹层按弹层宽度单独算一套；标题字号/加粗/折行两侧保持同一套阈值 |
| 5 | 指标字段下拉还是把按钮塞到底下 | 根因：应用开着 `html { zoom }` 时 `window.innerHeight` 与 `getBoundingClientRect()` 不同步，夹取算错。新增 `layoutViewport()`（插一块铺满视口的 fixed 探针量尺寸），Picker 改成一次性算好位置：下方放不下且上方更宽裕就往上弹，`maxHeight ≤ 380` 且始终在窗口内，footer 永远可见 |

**新增的坑**

56. **`html { zoom }` 下 `window.innerHeight` 不可信**：fixed 定位元素的 rect 在缩放后的坐标系里，`innerHeight` 不是。
    要量视口就用 `position:fixed;width:100%;height:100%` 的探针取 `getBoundingClientRect()`。
57. **浮层的 scroll 监听要区分「自己内部滚动」和「页面滚动」**：capture 阶段收 `window` 的 scroll 会把
    浮层里列表的滚动也当成页面滚动（user 一滚就关）。判 `event.target` 是否在浮层内。

---

## 12. 2026-10-28 第六轮：交接（用户要求「先别动代码，写交接文档」）

### 12.1 上一轮（17:14 / 17:17 出包）已交付

| 反馈 | 落点 | 状态 |
|---|---|---|
| 改筛选条件重算后 X 轴留旧字段 | `chartData.reconcileChartConfig()` + `analysisStore.compute()` 回写 | 已交付，但**语义不够**，见 12.2-C |
| X 轴二级菜单一滚就收起 | `ChartConfigPanel` 的 scroll 监听判 `pickerRef.contains(target)` | 已交付 |
| 取值「不勾 = 不选」+ 全选/取消全选 | 新维度写 `values: []`；`allSelected` 兜底老配置；footer 全选/取消全选/完成 | 已交付，**兜底判据有 bug**，见 12.2-A |
| 刻度自适应（预览 + 导出） | `fitAxisLabels()`（TS）/ `fit_labels()`（py）同一套阈值；预览用 ResizeObserver 量宽度 | 已交付 |
| 指标字段下拉底部按钮被挡 | `layoutViewport()` 探针 + `maxHeight ≤ 380` + 下方放不下往上弹 | 已交付；**若仍复现按 12.2-E 处理** |

验证：`pytest 176 passed` / `npx tsc --noEmit` 0 错 / `npx vitest run` 116 passed。
产物：`dist-installer\算账工作台-0.1.0-win-x64-setup.exe`（17:14:45 / 300.2 MB）、`...-lite-setup.exe`（17:17:12 / 95.4 MB）、前端 exe 17:09:48、sidecar 17:06:41。

### 12.2 本轮 4 条未修（下一窗口按 D → A+B → C → E 顺序做）

#### A. 二级菜单：字段不在 X 轴上时，取值仍显示「全勾」（图1）

根因在 `src/components/chart/ChartConfigPanel.tsx`：

```ts
const allSelected = activeValues === undefined;   // ← 这是给「老配置（没有 values = 不筛）」留的兜底
```

字段**根本不在 X 轴**（`dims` 里没有它）时 `activeValues` 也是 `undefined` → 命中兜底 → 全部显示勾选、`pickedCount = xValueOptions.length`（图里「已勾 3 项」）。

修法：

```ts
const onAxis = dims.some((dim) => dim.field === activeDim);
const allSelected = onAxis && activeValues === undefined;
const pickedCount = onAxis
  ? activeValues === undefined ? xValueOptions.length : activeValues.length
  : 0;
```

验收：X 轴显示「—」时打开二级，全部不勾、提示「已勾 0 项」。

#### B. 一级菜单去掉字段前的复选框（图1）

需求：一级列表不要勾选框。两种实现，**先问用户**：

1. **推荐**：点字段名 = 加入 / 移出 X 轴，已加入的显示组合序号 ①②③；二级面板跟着切到该字段。一步完成，序号表达组合顺序。
2. 点字段名只切二级面板，另放「+ 加到 X 轴」按钮。

落点：`ChartConfigPanel.tsx` 一级 `.dimRow`（去掉 `<input type="checkbox">`，整行 `onClick={() => toggleDim(column)}`），CSS 里 `.dimRow input[type="checkbox"]` 可删。

#### C. 重置筛选条件后重算，X 轴仍留着上次的字段值（图2）

现状：`reconcileChartConfig()` 只删除「新结果里已经不存在的字段/取值」，用户之前勾的那 3 个值在新结果里仍然存在 → 保留，看起来就是「没重置」。

**需要用户拍板**（三选一）：

- **方案 A（推荐）**：分析配置（时间范围 / 筛选条件 / 指标框）**变化后**重算 → X 轴配置整体清空（回到「—」）；配置没变、只是重复点「开始计算」→ 保留。
  实现：`analysisStore` 记一份 `buildAnalysisConfig()` 的 JSON 签名，`compute()` 拿到结果后比签名：不同 → `useChartStore.getState().resetConfig()`；相同 → 走 `reconcileChartConfig()`。
- 方案 B：只有点「重置」按钮时清空图表配置。
- 方案 C：保持现状（只做失效清理）。

验收（按 A）：随意改一条筛选条件 → 开始计算 → X 轴变「—」、一级全不勾；不改条件再算一次 → X 轴配置不动。

#### D. 多指标导出只剩一条线（图3）—— 根因已确认，纯后端问题

后端 `backend/accounting_backend/chart/builder.py::prepare_chart_data()` **完全没有读 `chart.show_fields`**，只按 `x_axis / y_axis / series` 出数据；
前端预览的 `src/utils/chartData.ts::prepareChartData()` 在 `show_fields.length > 1` 时走 `_prepareMultiSeries()`（每个指标一个系列）。
所以导出 PDF/JPEG 只画了 `y_axis` 那一列（图3 里只有「货量」）。

修法（把前端多系列逻辑镜像到后端）：

```python
y_fields = [f for f in chart.show_fields if f in result.columns]
if len(y_fields) > 1:
    # 每个指标一个 series：name = 指标列名，data = 该列按 category 的取值
    # 排序 / Top N 与单系列一致（sort_by=y 时按各行合计）
```

同步注意：
- 多系列时前端会**跳过时间粒度重汇总**（组合标签不是日期），后端也要跳过；
- `show_data_labels` / 图例名 / 饼图只用第一个指标（与前端 `data.series[0]` 一致）；
- 加测试：`tests/test_chart_builder.py` 补一条「两列指标 → 两个 series」，必要时在 `fixtures/chart_contract.json` 加 `show_fields`。

验收：X 轴 1 个维度 + Y 指标勾「现价合计、货量」→ 导出的 JPEG/PDF 里有两条线（或两组柱）、图例两个名字，与预览一致。

#### E. 指标区下拉底部按钮仍被遮挡（图4）

上一轮（17:14 包）已改成：`layoutViewport()` 探针量视口 + `maxHeight ≤ 380` + 下方放不下就往上弹。

**先确认用户测的是哪个包**：16:07 之前的包没有 `maxHeight ≤ 380`（那时是 `max(240, innerHeight - top - 12)`，能到 500+），症状与图4 完全一致。

若 17:14 之后的包仍复现，**不要继续调坐标，直接改成 portal**（和 X 轴浮层一条路）：

```tsx
import { createPortal } from "react-dom";
// Picker 的根节点改成
createPortal(<div className={styles.picker} style={{...}}>…</div>, document.body)
```

理由：`position: fixed` 一旦有祖先建了 containing block（`transform` / `filter` / `contain` / `zoom` 组合）就会被限制在祖先里；挂到 `body` 上再配合探针夹取，就不用再猜祖先布局。改完用 `.build-tmp/harness/` 的静态靶场验证（把 Picker 挂进一个 `overflow:auto` 的容器里点开，量 `foot` 是否在视口内）。

### 12.3 待用户拍板（开工前问，别自己定）

1. **一级菜单**：点字段名 = 加/移 X 轴（推荐）还是「只切换 + 单独加轴按钮」？
2. **重算后的 X 轴**：方案 A（配置变了就清空，推荐）/ B（只在「重置」时清）/ C（保持现状）？

### 12.4 下一窗口开工顺序（建议）

1. **D** 多指标导出（纯后端 + 测试，风险最低、用户最在意）
2. **A + B** X 轴面板（同一文件一起改，配 2 条 SSR 冒烟测试）
3. **C**（等用户选方案）
4. **E**（Picker 改 portal，静态靶场验证）
5. 全量验证：`pytest` → `tsc` → `vitest` → `scripts/e2e_real_data.py` → `backend/build.py` → `npx tauri build --no-bundle` → `makensis ×2`

### 12.5 环境 / 现状速查

- 命令、权限要求见 §0；静态靶场见 `.build-tmp/harness/`（`scratch.html` 图表面板、`preview.html` 图表预览；`vite.config.ts` + `python -m http.server` + headless Edge）
- 真机数据目录：`C:\Users\13774\Desktop\迭代`；设置指针在 `%APPDATA%\accounting-workbench\settings.json`
- 现役产物：`dist-installer\` 两个 exe（17:14 / 17:17）；sidecar 17:06:41
- 已知坑清单：坑 1–57（§3、§9.4、§11）

---

## 13. 2026-10-28 第七轮：D / A / B / C / E 全部落地（17:14 那个包反馈的四条）

> 开工前问过用户，答复如下（照做的，别再改口味）：
> 1. **一级菜单**：「点字段名只切二级面板，其他什么功能都不加」——不加「+ 加到 X 轴」按钮，点字段名也不切换维度；
> 2. **重算后的 X 轴**：方案 A（分析配置变了就清空，配置没变再算保留）；
> 3. 另确认「底部按钮被遮挡」是在 **17:14 之后的包**上复现的 → 直接上 portal。

### 13.1 D 多指标导出只剩一条线（纯后端，先做的）

根因：`chart/builder.py::prepare_chart_data()` 没读 `chart.show_fields`，只按 `x_axis / y_axis / series` 出数据；
前端预览 `chartData.ts::prepareChartData()` 在 `show_fields` 里能用上的列 > 1 时走 `_prepareMultiSeries()`（每个指标一个系列）。

落点（`backend/accounting_backend/chart/builder.py`）：

- `prepare_chart_data()` 先过滤 `y_fields = [f for f in chart.show_fields if f in result.columns]`，
  `len > 1` 走新的 `_prepare_multi_series()`，否则原逻辑一行没改。
- `_prepare_multi_series()` 镜像前端：类别 = X 轴列取值；`sort_by=y` 按同一行各指标合计排；Top N 照旧；
  饼图只用第一个指标并丢掉「第一个指标非正数」的行（matplotlib 对负值直接抛 `ValueError`）；
  图例 = 每个指标一个名字（与预览 `data.series` 一致）。
- 时间粒度：**只有单维度才重汇总**（`len(chart.x_dims) <= 1`）——组合标签（`值1 · 值2`）不是日期。
  单系列那条老逻辑也补了同一判断（前端 `prepareChartData` 本来就是 `&& !combined`，见坑 58）。
- `show_data_labels` / 饼图 / 图例都只用第一个指标，`_render_to_figure()` 不用改。

测试：

- `backend/tests/fixtures/chart_contract.json` 从「单个 case」改成 `cases[]`（4 个 case）：
  ①系列字段 + 月粒度（老的）②多指标 = 多系列 ③多指标 + 月粒度 ④`show_fields` 里有结果表没有的列 → 退回单系列。
- **前后端共用这一份 fixture**：`backend/tests/test_chart_builder.py::test_chart_data_contract` 与
  `src/utils/chartData.test.ts` 的契约用例都循环跑这 4 个 case（保证预览 = 导出）。
- 另加 5 条后端用例：多系列两条线各数值、`sort_by=y` 按合计、饼图取第一个指标 + TopN、
  `x_dims > 1` 跳过时间粒度、PDF 里能提取到两个图例名。

### 13.2 A 字段不在 X 轴上时二级取值显示「全勾」

`ChartConfigPanel.tsx` 新增 `activeOnAxis`：

```ts
const activeOnAxis = activeDim !== null && dims.some((dim) => dim.field === activeDim);
const allSelected = activeOnAxis && activeValues === undefined;
const pickedCount = !activeOnAxis ? 0 : allSelected ? xValueOptions.length : (activeValues ?? []).length;
```

老配置兜底（`values === undefined` = 不筛）现在只对「真的在轴上」的字段生效。

### 13.3 B 一级菜单去掉复选框

按用户定稿：**点字段名只切二级面板**，不加新按钮、不做「点一下就加/移维度」。

- `.dimRow` 整行可点（`role="button"` + Enter/Space），`onClick` → `selectDim(field)`（只 `setActiveField` + 清关键字）；
- 去掉 `<input type="checkbox">`；CSS 里 `.dimRow input[type="checkbox"]` 一并删掉，
  `.dimRow { cursor: pointer }`，`.dimName` 从 button 改成 span（要 `display: block` 才有省略号）；
- 已上轴的行仍显示组合序号 ①②③ 与取值数（老配置没有取值列表就显示「全部」）；
- 一级提示「一级：点字段名看取值（勾取值 = 加入 X 轴）」；二级提示「…勾几项 = 只取这些，全取消 = 不上 X 轴」。

**上轴 / 下轴的唯一入口 = 二级取值勾选**（用户原话「勾选就上 X 轴，取消勾选就不上」）：

- 勾一个取值 → 该字段作为新维度追加，只取这一项（`applyValues()`）；
- 全部取消（含底部「取消全选」）→ 维度整个删掉，**不是**写 `values: []`（否则图表变成「空图」而界面显示「没上轴」）；
- 「全选」一个还没上轴的字段 = 把它加进来（坑 60：原来只改已有维度，全选会静默无效）。

### 13.4 C 改筛选条件重算后 X 轴还留着上次的取值（方案 A）

- `analysisStore.ts` 记 `lastComputeSignature` = `JSON.stringify(buildAnalysisConfig(...))`
  （`buildAnalysisConfig` 是纯函数、无时间戳，稳定可比值）。`compute()` 成功后比签名：
  **变了 → 清 X 轴**；没变 → 只走 `reconcileChartConfig()`。
- 清空动作是新加的 `chartStore.resetXAxis()`（内部 `withXDims([])`）：**只清 X 轴**，
  Y 指标 / 图表类型 / 排序 / 标题都保留。交接文档写的是 `resetConfig()`，但那会把 Y 指标和图表类型一起打回默认，
  用户每改一次条件都要重挑 Y，所以收窄成 X 轴。
- 换项目 / 重进分析页（`openForRule` / `openFree` / `restoreRows` / `reset`）会把签名清掉，下一次计算按「首次」处理：
  打开老项目直接点开始计算，不会白清一次已保存的图表配置。
- `reconcileChartConfig()` 顺手改严一点：某维度的取值在新结果里一个都不剩 → 连维度一起删
  （原先是留 `values: []`，界面上「没上轴」和图表「空图」对不上）。
  `prepareChartData` 里 `[] = 一条都不留` 的底层语义没动，老快照照样能读。

### 13.5 E 指标区下拉底部按钮仍被遮挡 → Picker 直接上 portal

`components/analysis/Picker.tsx` 的根节点改成 `createPortal(<div className={styles.picker} …>, document.body)`，
`position: fixed` + 原有视口探针夹取不变；SSR（`renderToString`）没有 `document` 时返回 `null`，冒烟测试不受影响。

静态靶场（新增 `.build-tmp/harness/picker.html` + `picker.tsx`，`vite.config.ts` 的 input 里加了 `picker`）复刻元凶布局：
祖先同时带 `overflow: auto` + `transform: translateZ(0)`，页面再开 `html { zoom: 1.1 }`，按钮锚点放在视口底部。
`npx vite build --config .build-tmp/harness/vite.config.ts` → `python .build-tmp/harness/serve.py 8731` →
headless Edge 跑 `http://127.0.0.1:8731/.build-tmp/harness/picker.html`，测量值经 `/log` 回传到后台任务日志：

| 量 | 值 |
|---|---|
| `parentIsBody` | true（真的脱离祖先了） |
| 弹层 rect | top 294 / bottom 712（视口 1150×725，zoom 1.1） |
| `.foot` bottom | 702 ≤ 725 → `insideViewport=true` |
| 「添加」按钮 | `insideViewport=true`，`document.elementFromPoint(按钮中心)` 点到的就是它 → `hitTest=true` |
| 祖先裁切链 | `clipAncestors=none` |
| 反证（把同一份 DOM 塞回祖先里） | 容器 scrollHeight 647 > clientHeight 633、弹层底 726 > 祖先可见底 712 → 会被祖先裁 / 顶出 |

### 13.6 验证数据（本轮）

- `cd backend; & "E:\python3.9.6\python.exe" -m pytest tests -q` → **181 passed**（+5，见 13.1）
- `npx tsc --noEmit` → 无输出
- `npx vitest run` → **120 passed**（+4：`reconcileChartConfig` 四条；原 116）
- `scripts/e2e_real_data.py` → **EXIT=0**（全链路 200；最后一步迁移后打开老项目 200 / 行数 100）
- 静态靶场（真 Chromium，见 13.5）：图表面板交互 6 步全通 —— `level1Checkboxes=0`；
  未上轴的字段 `checkedBefore=0`（A 修好）；点第二个字段名 `hint2` 跟着换（B）；
  勾一个取值 → `x_dims=[{目的所属省份:["浙江省"]}]`；取消全选 → `x_dims=[]`；全选 → 1 维 2 项；
  完成后 X 轴文案 `目的所属省份 · 已选 2 项`。
- **打包后的 sidecar 冒烟**（`.build-tmp/smoke_sidecar.py`，直接起 `src-tauri\binaries\sidecar\accounting-backend.exe`）：
  `/api/health` 200；`/api/chart/render`（`show_fields = 货量 + 现价合计`，JPEG）→ 200、28496 字节，
  图里两条线两个图例名（标题「多指标冒烟」）。留档图：`.build-tmp/multi-series-proof.jpg`。

### 13.7 产物（2026-10-28 第七轮）

| 产物 | 大小 | 时间 |
|---|---|---|
| `dist-installer\算账工作台-0.1.0-win-x64-setup.exe` | 314,831,819 B（300.2 MB） | 18:37:30 |
| `dist-installer\算账工作台-0.1.0-win-x64-lite-setup.exe` | 100,008,170 B（95.4 MB） | 18:40:14 |
| 前端 exe `src-tauri\target\release\accounting-workbench.exe` | 9,950,720 B | 18:31:54 |
| sidecar `src-tauri\binaries\sidecar\accounting-backend.exe` | 16,280,762 B（目录 315.7 MB） | 18:28:02 |

### 13.8 需要用户验收的点

1. **D**：X 轴 1 个维度 + Y 指标勾「现价合计、货量」→ 导出 JPEG/PDF 里两条线（两组柱）、图例两个名字，与预览一致。
2. **A**：X 轴显示「—」时打开二级菜单 → 全部不勾、提示「已勾 0 项」。
3. **B**：一级只剩字段名（没有复选框）；点字段名 = 只切右边取值；勾取值才加进 X 轴；取消全选 = 拿下来。
4. **C**：改任意一条筛选条件 → 开始计算 → X 轴回「—」、一级全不勾；**不改条件再点一次开始计算 → X 轴配置不动**。
5. **E**：指标区字段下拉（把字号调大 + 按钮靠窗口底部时打开）底部「确定 / 添加」可见可点。

### 13.9 新增的坑

58. **多指标 = 多系列只能在后端补，而且时间粒度看的是「维度数」不是「系列数」**：`prepare_chart_data()` 原来完全没读
    `chart.show_fields`（导出只剩 `y_axis` 一条线）。补的时候注意前端 `_prepareMultiSeries` 的条件是
    `if (time_granularity && !combined)` —— 是「多维度组合才跳过重汇总」，不是「多系列就跳过」；
    照文档字面写会把单维度的多月多指标折线画成一天一个点。
59. **`position: fixed` 的弹层只要祖先建了 containing block（`transform` / `filter` / `contain` / `zoom` 的组合），
    就会被那个祖先当坐标系、再被它的 `overflow` 裁掉**；调 `top / maxHeight` 治不好，必须 `createPortal(document.body)`。
    验法（静态靶场）：`dialog.parentElement === document.body`、`.foot` bottom ≤ 探针量到的视口高、
    `document.elementFromPoint(按钮中心)` 回来的就是那个按钮。
60. **删掉一级复选框之后，`setDimValues()` 只改「已经在轴上」的维度**：对还没上轴的字段点「全选」会静默什么都不发生。
    上轴 / 改值 / 下轴必须走同一个 `applyValues()`：空数组 = 删维度、不在轴上 = 追加、其余 = 改值。
61. **`npx tauri build` 的 `beforeBuildCommand`（`npm run build`）会报
    `[vite:esbuild-transpile] remove C:\Users\<user>\AppData\Local\Temp\esbuild-…: Access is denied`**：
    和坑 17 同源，先把 `$env:TEMP` / `$env:TMP` 指到 `$PWD\.build-tmp` 再跑就过。

### 13.10 还挂着的小尾巴（下一轮可选）

- `ChartConfigPanel.togglePicker()` 还用 `window.innerWidth / innerHeight` 夹浮层（坑 56 的同类隐患：
  开 `html { zoom }` 时两者不同步）。X 轴浮层已经 portal + `max-height`，本轮实测没复现，
  但可以换成 `Picker.tsx` 里的 `layoutViewport()` 探针（把它提到 `src/utils/` 共用）。本轮按「只做 4 件」没动。
- 饼图 + 多指标不是推荐组合：预览用第一个指标的原始值，导出会丢掉「第一个指标非正数」的行（防 matplotlib 抛错）。

---

## 14. 2026-10-28 第八轮：真机反馈（图1/图2 刻度重叠 + 图3 下拉底部仍被切）

用户两条：
1. **图1/图2**：图表刻度还是被遮挡/重叠 —— Y 轴名「货量」只剩半个字、X 轴三行组合标签互相压住，双击放大也一样；
2. **图3**：指标区下拉底部（全选/取消全选/添加）还是看不到。

两条都先在静态靶场里复现，再改，再用同一套量法验。

### 14.1 图3 根因：`html { zoom }` 下三套坐标混用（坑 62）

**复现**（新增靶场 `.build-tmp/harness/analysis.html` + `analysis.tsx`：整页 `<AnalysisWindow>` + 1180×700 窗口 +
`html { zoom: 1.1 }` + 自动点「页面最下面那个指标框里的 `+`」）：

```
effectiveZoom=1.100  innerW=1150 innerH=605 probe=1150x605
anchor top=522 bottom=548 left=583
dialog top=281 bottom=652 h=372      ← 视口只有 605
foot bottom=643 insideProbeViewport=false
confirm visibleClickable=false
```

第六轮把 Picker 改成 portal 只解决了「被祖先裁切」；**坐标还在混用**：
`getBoundingClientRect()` 给的是视觉坐标，而 `position: fixed` 的 inline `top / max-height` 是布局坐标
（渲染时再乘 zoom）。255 → 实际画在 281、338 → 实际 372，于是底部 652 越出 605，footer 正好被窗口切掉。
越靠页面底部偏得越多 —— 正好是用户「指标区在页面下半部分」的场景。

**修法**：新增 `src/utils/overlay.ts`

- `layoutViewport()`：fixed 探针量视口（视觉坐标）；
- `effectiveZoom()`：fixed 探针量 100px 得到 1.1 → 有效缩放；
- `placeOverlay({left, belowY, aboveY, width, designMax, minBelow})`：**输入视觉坐标、输出 CSS px**
  （内部 `/zoom`）、该翻上去就翻上去、左右上下都夹进视口。

改到的三处：

| 文件 | 改动 |
|---|---|
| `src/components/analysis/Picker.tsx` | 用 `placeOverlay()` 算一次位置（`aboveY = top - 34`：往上翻时底边落在按钮上沿再留 4px，不再压住按钮） |
| `src/components/chart/ChartConfigPanel.tsx` | X 轴浮层同样走 `placeOverlay()`（不再用 `window.innerWidth/innerHeight`），顺带把上轮记在 §13.10 的小尾巴清掉 |
| `src/components/analysis/AnalysisWindow.tsx` | `pickerPosition()` 只给锚点的视觉坐标，不再用 `window.innerHeight` 预夹取（那是另一个坐标空间） |

**修后**（同一靶场、同一操作）：

| 量 | 修前 | 修后 |
|---|---|---|
| 弹层 rect | top 281 / bottom 652 | top 138 / bottom 518 |
| footer 底边 | 643 > 605 ✗ | 508 ≤ 605 ✓ |
| 「添加」按钮 | `elementFromPoint` 点不到 ✗ | 点得到 ✓ |
| 与「+」按钮关系 | 盖住按钮上半 22px | 底边在按钮上沿上方 4px |

**缩放 × 窗口矩阵**（全部 `insideViewport=true` + 按钮可点）：

| zoom | 窗口 | 弹层 bottom | 视口高 |
|---|---|---|---|
| 1.0 | 1180×680 | 485 | 585 |
| 1.1 | 1180×700 | 518 | 605 |
| 1.2 | 1180×620 | 513 | 525 |
| 1.1 | 1000×560 | 453 | 465 |

### 14.2 图1/图2 根因一：刻度重叠的判据错了（坑 63）

旧 `fitAxisLabels()` 只看「每个刻度多少 px」决定角度/折行：11 个刻度 + 576px 面板 → 每格约 47px，
折 3 行、斜排 45° —— 但**旋转后三行文字的外接盒宽 ≈ 70～78px**，比 47px 的间距还宽，必然互相压。
同理放大弹层里 `per` 一变大就退回平放，但折 3 行的块仍然被后续刻度压住。

新 `fitAxisLabels()`（`src/utils/chartData.ts`）三步：

1. 角度 0/30/45/60 × 行数 1/2/3，取第一个满足 `labelFootprint(最宽行字数, 行数, 字号, 角度) ≤ 刻度间距` 的；
2. 斜排都塞不下 → **竖排 90° + 3 行**（横向只占一个行高，10 个刻度全显示，实测最干净）；
3. 连竖排都放不开 → 45° + 3 行，按外接盒算 `interval = ceil(外接盒/间距) - 1`（隔几个显示一个）。

后端 `fit_labels()`（`backend/accounting_backend/chart/builder.py`）**同一套规则**（单位 pt，
`step = interval + 1`，numpy 切片语义）。导出实测：`per=95 → 平放 3 行`、`per=64.8 → 竖排 90°`、
`per=28.8 → 45° 隔 3 个`，与预览一致。

### 14.3 图1/图2 根因二：Y 轴名被网格上沿裁掉（坑 64）

`yAxis` 只写了 `name`，ECharts 默认 `nameLocation: "end"` 把名字画在轴线上方，
而 `grid.top` 只有 20px、`containLabel` 又只算刻度标签不算轴名 → 名字被裁成半个字。
改为 `nameLocation: "end"` + `nameGap: 10` + `nameTextStyle: { align: "left" }` + `grid.top: 34`
（够放一行名字），X 轴另外补 `hideOverlap: true` 当最后一道保险。

### 14.4 验证数据（本轮）

- `cd backend; & "E:\python3.9.6\python.exe" -m pytest tests -q` → **184 passed**（+3：`fit_labels` 宽/挤/极挤）
- `npx tsc --noEmit` → 无输出
- `npx vitest run` → **128 passed**（+8：`placeOverlay` 4 条 + `fitAxisLabels` 4 条）
- `scripts/e2e_real_data.py` → **EXIT=0**
- 打包后 sidecar 冒烟（`.build-tmp/smoke_sidecar.py`）→ `/api/chart/render` 200、双系列 JPEG 两条线
- 静态靶场（真 Chromium，`vite build` + `.build-tmp/harness/serve.py` + headless Edge）：
  - 图3 复现/修复数据见 §14.1 两张表；
  - 图1 修复前后对比图：`.build-tmp/shot-chart-inline.png`（旧 45° 叠字）→ `.build-tmp/shot-final-inline.png`（新竖排全显示）；
    放大弹层：`.build-tmp/shot-final-zoom.png`（平放 3 行、全显示）；
    下拉：`.build-tmp/shot-picker-final.png`（footer 可见）；
  - 导出对照：`.build-tmp/export-90.jpg`（matplotlib 竖排，与预览同款）；
  - X 轴浮层（zoom 1.1）：`insideViewport=true`、`flyout=452×1.1=497` 宽、交互 6 步全通。

### 14.5 产物（2026-10-28 第八轮）

| 产物 | 大小 | 时间 |
|---|---|---|
| `dist-installer\算账工作台-0.1.0-win-x64-setup.exe` | 314,833,809 B（300.2 MB） | 19:33:18 |
| `dist-installer\算账工作台-0.1.0-win-x64-lite-setup.exe` | 100,010,083 B（95.4 MB） | 19:35:31 |
| 前端 exe `src-tauri\target\release\accounting-workbench.exe` | 9,950,720 B | 19:28:15 |
| sidecar `src-tauri\binaries\sidecar\accounting-backend.exe` | 16,281,501 B | 19:26:31 |

### 14.6 需要用户验收的点

1. **图3**：指标区在页面下半部分、字号放大到「大/特大」时打开字段下拉 → 底部「全选/取消全选/添加」都在窗口内、点得到。
2. **图1**：11 个三类组合刻度 → 刻度不再互相压；页面里的图表用**竖排**（10 个全显示）；
   双击放大的弹层用**平放 3 行**（更宽，10 个也全显示）。
3. **Y 轴名**：图表左上角「货量」完整可见（预览、放大、导出三处）。
4. **导出**：同样的刻度在导出 PDF/JPEG 里与预览同一套规则、不重叠。

### 14.7 新增的坑

62. **`html { zoom }` 会把「三套坐标」混在一起**：`getBoundingClientRect()` 是视觉坐标；
    `position: fixed` 的 inline `top / max-height` 是布局坐标（渲染时再乘 zoom）；
    `window.innerHeight` 在不同 Chromium 上既可能是布局坐标也可能跟着 zoom 走。
    直接把 rect 塞进 `top`，弹层会往下多跑 zoom 倍距离 —— **越靠页面底部越明显，最后 footer 被窗口切掉**。
    正确做法：`utils/overlay.ts` 里用两块 fixed 探针量「视口」和「有效缩放」，输入按视觉坐标、
    输出除以 zoom 再写 style，只保留一个入口。
63. **刻度重叠的判据是「旋转后外接盒宽度 vs 刻度间距」**，不是「每个刻度多少 px」。
    三行标签斜排 45° 的外接盒 ≈ 70～78px，47px 的间距必然压字；
    塞不下时先试**竖排 90° + 3 行**（横向只占一个行高、刻度还能全显示），最后才「隔几个显示一个」。
    前后端必须同一套：`fitAxisLabels()`（px）↔ `fit_labels()`（pt），且 **ECharts 的 `interval=N`
    ↔ numpy 的 `step=N+1`**（差的这 1 最容易写错）。
64. **ECharts 的 yAxis `name` 会被网格上沿裁掉**：默认 `nameLocation: "end"` 把名字放在轴线上方，
    而 `containLabel` 只算刻度标签、不算轴名。要 `nameTextStyle.align:"left"` + 显式 `grid.top` 给名字留位置。

### 14.8 还没做的（下一轮可选）

- 竖排是「斜排塞不下」时的兜底。若用户更想要「隔几个显示一个」而不是竖排，把 §14.2 的第 2 步和第 3 步对调即可（一行）。
- `ChartPreview.zoomCanvasWidth()` 仍用 `window.innerWidth` 估放大弹层的画布宽（只影响 `zoomFit` 的字号估计，
  不影响任何位移，本轮没动）。

---

## 15. 2026-10-29 第九轮：一键算导出的两个问题 + 首页拖入文件

用户三条（原话）：
1. 一键算「导出 PDF（当前）/ 导出 JPEG（当前）」**选了路径却没有生成文件**；
2. 一键算「导出 xlsx（当前）」的文件名要改成
   `[当前所选功能 · 当前所选网点 · 当前所选分组维度 · 指标_YYYY-MM-DD HH：MM]`，
   例：`网点对比图表 · 上饶德兴 · 网点 × 省份 · 公斤段折扣_2026-10-28 11：07`；
3. 首页「将文件拖到此处创建新项目」还是不能用。

### 15.1 PDF/JPEG 导出无文件：后端把「轴标题」当成字段名校验

`BoardPage.handleExport()` 里图表导出传的是 `y_axis: hasAbsolute ? "结算重量（kg）" : "比率 / 单价"`——
那只是**轴标题**，不是结果表的列；而 `chart/builder.py::_validate()` 无条件要求
`chart.y_axis in result.columns` → 直接抛 `INVALID_CHART_CONFIG: Y 轴字段不存在：比率 / 单价`，
前端把它塞进页头提示条，文件自然一个都没有。

修法（`_validate()`）：只有**单系列**才要求 `y_axis` 是真实列；多系列（`show_fields` 里能在结果表
找到的列 > 1）时 `y_axis` 只当标题用，不参与取数（`_prepare_multi_series()` 本来就只用 `show_fields`）。
`x_axis`、饼图、散点的校验一条没松。

后端用例：`test_multi_series_allows_axis_label_as_y_axis`（轴标题 + 2 个系列 → 能出 JPEG）、
`test_single_series_still_requires_real_y_axis`（单系列传错列名仍然报错）。

打包后 sidecar 冒烟也加了同样一段（`.build-tmp/smoke_sidecar.py`）：
`/api/chart/render`（`y_axis="比率 / 单价"` + 两个系列）→ 200、33067 字节，
图里标题「网点对比图表」、Y 轴「比率 / 单价」、两个图例名、X 轴三档公斤段，全部正确。

### 15.2 导出文件名：新工具 `utils/exportName.ts`

```
功能 · 网点 · 分组维度 · 指标_YYYY-MM-DD HH：MM.<ext>
```

- **功能**：`当前` = 勾选的功能块（多个用「、」连）；`全部` = 固定「全部功能」；
  图表导出（PDF/JPEG）导的永远是「网点对比图表」，所以功能位固定它。
- **网点**：顶部「网点」筛选（`inputs.nets`），一个没勾 = 「全部网点」；超过 3 个收敛成「N 个网点」。
- **分组维度**：`board.dim_label`（后端 = `" × ".join(dims)`，如「网点 × 省份」）。
- **指标**：货物流向→「货量」、公斤段折扣→「折扣」、公斤段单价→「单价」、网点对比图表→勾选的对比指标名。
- 时间戳换成 `YYYY-MM-DD HH：MM`（**全角冒号**，Windows 不允许半角冒号，坑 4）；
  非法字符统一换成「·」。

原来的 `一键算_当前视图_20261028_1107.xlsx` 已删掉（`stamp()` 一并删除）。
单测 `src/utils/exportName.test.ts` 6 条，其中一条就是把用户给的例子逐字对上：

```ts
expect(`${base}_${stampMinute(new Date(2026, 9, 28, 11, 7))}`).toBe(
  "网点对比图表 · 上饶德兴 · 网点 × 省份 · 公斤段折扣_2026-10-28 11：07",
);
```

### 15.3 首页拖入文件：三条通道 + 失败要能看见

排查结论：代码路径是对的（Tauri 2.12.1 + `@tauri-apps/api` 2.12.1，`dragDropEnabled` 默认开，
WindowContent 型 webview 的拖放走 `WindowEvent::DragDrop → emit_to(AnyLabel("main"))`，
JS 侧 `webview.onDragDropEvent` 应该收到），但真机上就是没反应——所以这轮把「单通道 + 静默失败」
改成「三条通道 + 出错有提示」：

1. **webview 事件**（原来的）：`getCurrentWebview().onDragDropEvent`；
2. **Rust 兜底**：`src-tauri/src/main.rs` 加 `.on_window_event`，`WindowEvent::DragDrop(Drop{paths})` 时
   再 `window.emit("aw://file-dropped", files)`，前端用 `listen()` 听；
3. **HTML5 兜底**：`main.tsx` 全局 `dragover`/`drop` `preventDefault()`（防止 WebView2 自己去打开
   那个文件 → 白屏），并把能拿到的 `File.path` 通过 `aw:html5-drop` 自定义事件转发；取不到路径时
   界面会弹「没有读到拖入文件的路径，请用「新建项目 → 浏览」选择文件」，不再是没反应。

两条 Tauri 通道会各来一次，用 `utils/droppedFile.ts` 的 `createDropDedupe()`（1.5s 窗口）去重；
`firstTableFile()` 只认 xlsx/xls/csv，拖了别的文件会明说「只支持 xlsx / xls / csv 文件」。
`tauri.conf.json` 里把 `"dragDropEnabled": true` 显式写出来（默认值就是这个，写明白免得以后被误改）。

单测 `src/utils/droppedFile.test.ts` 5 条（文件名解析、挑表格文件、去重窗口）。

### 15.4 验证数据（本轮）

- `cd backend; & "E:\python3.9.6\python.exe" -m pytest tests -q` → **186 passed**（+2：轴标题合法 / 单系列仍严格）
- `npx tsc --noEmit` → 无输出
- `npx vitest run` → **140 passed**（+12：exportName 6 条 + droppedFile 5 条 + 1 条文件名时间戳）
- `scripts/e2e_real_data.py` → **EXIT=0**
- `cargo check --release` → 0 错（新增的 `.on_window_event` 编译通过）
- 打包后 sidecar 冒烟 → `chart/render` 200 + 一键算那种图 200（见 §15.1）
- 图：`.build-tmp/board-export-proof.jpg`（一键算导出效果，标题/轴名/图例/刻度都对）

### 15.5 产物（2026-10-29 第九轮）

| 产物 | 大小 | 时间 |
|---|---|---|
| `dist-installer\算账工作台-0.1.0-win-x64-setup.exe` | 314,831,978 B（300.2 MB） | 11:32:29 |
| `dist-installer\算账工作台-0.1.0-win-x64-lite-setup.exe` | 100,008,214 B（95.4 MB） | 11:34:26 |
| 前端 exe `src-tauri\target\release\accounting-workbench.exe` | 9,940,480 B | 11:27:01 |
| sidecar `src-tauri\binaries\sidecar\accounting-backend.exe` | 16,281,805 B | 11:25:45 |

### 15.6 需要用户验收的点

1. 一键算勾「网点对比图表」→ 导出 PDF / 导出 JPEG → 选完路径**真的有文件**，图里标题「网点对比图表」、
   Y 轴「比率 / 单价」、多条网点线。
2. 一键算导出 xlsx → 默认文件名形如
   `网点对比图表 · 上饶德兴 · 网点 × 省份 · 公斤段折扣_2026-10-29 11：32.xlsx`
   （多个功能 = 「货物流向、公斤段折扣、公斤段单价 · … · 货量、折扣、单价」）。
3. 首页把 xlsx 拖到窗口里 → 直接弹「新建项目」且路径/项目名已填好；拖非表格文件会提示只支持三种格式。

### 15.7 新增的坑

65. **`y_axis` 有两种身份**：单系列时它是**取数列**（必须在 `result.columns` 里），多系列时它只是
    **轴标题**（可以不存在的字符串，如「比率 / 单价」）。校验必须按「`show_fields` 里有效的列数 > 1」分开判，
    否则一键算这类「自己拼结果表 + 人话标题」的导出会被一刀切拦掉，而且前端只看到一句提示、文件一个不生成。
66. **一条拖放要听三条通道，且失败必须可见**：Tauri 的 `webview.onDragDropEvent` 在某些环境下就是不触发，
    只挂它 + `console.warn` = 用户眼里「点了没反应」。现在 webview 事件 / Rust `.on_window_event` 补发的
    `aw://file-dropped` / HTML5 `drop` 兜底三条一起挂，`createDropDedupe()` 去重；
    另外必须在 `main.tsx` 里 `preventDefault()` 掉 HTML5 `drop`，否则 WebView2 会自己导航到那个文件（白屏）。

### 15.8 还没做的（下一轮可选）

- 一键算导出的**表格**（xlsx/csv）仍是「长表」（功能 / 维度 / 公斤段 / 指标 / 值），
  如果用户想要「每块一个 Sheet」或者「宽表」，需要另开工单。
- 饼图导出仍然提示「请改用 SVG 截图」——后端 matplotlib 能画饼图，只是看板这边的饼是「网点占比」，
  需要的话可以接上。

---

## 16. 2026-10-29 第十轮：一键算图表导出改成「文件夹」+ 5 个「导出与预览不一致」根因

用户原话（HANDOVER_NEXT §3.1）：一键算导出的图表和预览不一致、版面很乱；「导出 PDF（当前）」「导出 JPEG（当前）」
要**导出一个文件夹**（1 张合并大图 + N 张按分组拆的拆分小图），命名规则见交接文档 §3.3。

### 16.1 开工前问过的 5 个问题（用户全选推荐项，结论）

| # | 问题 | 用户答复 |
|---|---|---|
| 1 | 拆分维度 | **按分组行拆**（`dims=["网点","省份"]` = 每个「网点·省份」一张） |
| 2 | 小图里几条线 | **只放该分组行自己的指标线** |
| 3 | 文件夹名 | **用大图名去掉扩展名**，同一分钟重复导出追加 `（2）` |
| 4 | 多指标 | 大图 = 每行多线；**小图仍是每行一张**、图里画该行全部指标线 |
| 5 | 饼图/散点 | **继续禁用**（提示切成折线/柱状） |
| 6 | 次任务 B（Win10 硬化 4 个补丁） | **本轮不做**，A 验证通过后再说 → 本轮 `installer/windows/workbench.nsi`、`tauri.conf.json`、`main.rs` 一行没动 |

### 16.2 5 个「导出 ≠ 预览」根因，逐条落点

| # | 根因（HANDOVER_NEXT §3.2） | 落点 | 验证 |
|---|---|---|---|
| 1 | 导出传 `sort_by:"x"` → 后端对分类做**字符串排序**，公斤段变成 `0-60,150-300,300-500,500-800,60-150,800+` | 前端 `buildBoardChartJob()` 固定 `sort_by:"custom"`；`builder.py::prepare_chart_data` 的 docstring 写明 custom = 不排序 | `test_custom_sort_keeps_board_band_order`（同时反证 `sort_by="x"` 会乱）+ 导出 JPEG/PDF 实测（PDF 里 6 个公斤段位置严格递增） |
| 2 | 导出色是后端 `CHART_PALETTES["default"]`（灰蓝 Tableau），预览是品牌蓝/绿/橙 | `schemas/chart.py::ChartConfig` 加 `series_colors`；`builder.py::_resolve_colors()` 非空优先；前端 `BOARD_PALETTE` 挪到 `utils/boardChartExport.ts` 后按系列顺序传 | `test_series_colors_override_palette`（断言 matplotlib 线色 == 传入色）+ 留档图 |
| 3 | 图例 `ax.legend()` 默认 `loc="best"` → 压住数据线 | 改 `fig.legend()` 画在画布**内部下方**（`subplots_adjust(bottom=0.2)`），`ncol=min(3, 系列数)`、`frameon=False` | `test_legend_sits_below_axes`（`legend 底边 ≤ axes 底边`） |
| 4 | Y 轴绝对量用「万」缩写（预览 `cmpShort()`：10000 → 1.0万） | **已按用户追加要求改成千分位**：预览与导出都不再出现「万」，10000 显示 `10,000`（见 §16.9） | `format_tick` 单测 + PDF 抽出 `10,000 / 12,500 …` + 留档图 `.build-tmp/number-format-proof/` |
| 5 | 拆分视图在导出里没有 | 新接口一次写 1 张合并 + N 张拆分 | `test_export_jpeg_writes_one_folder_with_merged_and_splits` + e2e 真数据 3 个文件 |

顺带修掉两个潜伏 bug（都是这份新逻辑踩出来的）：

- **只勾 1 行 × 1 个指标时导出会 400**：`_validate()` 单系列要求 `y_axis` 是真实列，而看板传的是轴标题
  「比率 / 单价」→ 直接拦；就算放过，`prepare_chart_data()` 的 `columns.index(y_axis)` 还会抛 `ValueError`。
  现在统一收进 `builder.py::_series_fields()`：`show_fields` 里有 1 列且 `y_axis` 不是结果表的列 → 也走
  `_prepare_multi_series()`。用例 `test_single_series_with_axis_title_renders`。
- **散点图 + 轴标题会崩在 `columns.index`**：`_is_numeric_column()` 先判列存在，`_validate()` 的散点分支
  只在 `y_axis in result.columns` 时才校验数值列。

### 16.3 后端：`io/board_exporter.py` + `routers/board_export_router.py`

- 接口 `POST /api/board/export/chart-folder`（已登记到 `AGENTS.md` §8.3，另补了 `/api/board`、`/api/board/sources`）。
  请求 `{merged, splits[], out_dir, stamp, folder_base, file_names[], format, render_opts}`，
  响应 `{folder, files[]}`（files 只有文件名，与盈亏平衡导出一致）。
- 命名：文件夹 = `safe_name(folder_base + "_" + stamp)`（时间戳半角冒号转全角，坑 4）；
  同一分钟重复导出 → `（2）`、`（3）`…；同批重名小图 → `（2）`（多个网点 × 省份时省份会撞）。
- 整批原子：先写 `out_dir/.board-export-<uuid>` 暂存目录，全部成功再 `os.replace` 改名为目标文件夹；
  任何一张失败 → 删暂存目录并抛结构化错误（`INVALID_EXPORT_CONFIG` / `EXPORT_WRITE_FAILED` / `INVALID_CHART_CONFIG`），
  **不留半个文件夹**。用例断言 `list(tmp_path.iterdir()) == []`。
- 渲染仍只走 `chart/builder.py::render_chart_pdf / render_chart_jpeg`（不另起 figure），
  `render_opts` 支持整批兜底 + 单张覆盖（大图 14×8、小图 11×6.4、300 DPI）。

### 16.4 前端

| 文件 | 改动 |
|---|---|
| `src/utils/boardChartExport.ts`（新） | `BOARD_PALETTE`（唯一颜色来源，BoardPage 直接 import）、`boardMetricValue()`（预览/导出共用的取数口径）、`buildBoardChartJob()`（结果表 + ChartConfig，`sort_by:"custom"` + `series_colors`）、`labelTailOf()`、`planBoardChartExport()`（大图 + N 小图 + 文件名去重；拆出来的取值重名时整批退回完整行标签） |
| `src/utils/exportName.ts` | 抽出 `netPartOf()` 复用；新增 `boardSplitBaseName()` = `功能 · 网点 · 拆分取值 · 指标` |
| `src/api/board.ts`（新） | `exportBoardChartFolder()` → `POST /api/board/export/chart-folder`（走 `request()`，后端中文错误直接抛给页面） |
| `src/pages/BoardPage.tsx` | PDF/JPEG 分支改成：先 `pickDirectory()` → `planBoardChartExport()` → 一次请求 → `exportStore.record({kind:"folder"})` → 提示「已导出 N 个文件：<文件夹>」；菜单两项在「没勾对比图表」或「饼图/散点」时 `disabled` + 底下常驻提示；xlsx/csv 分支一行没改 |
| `src/pages/BoardPage.module.css` | `.flyout button:disabled`（置灰 + `not-allowed`，用 `--color-text-tertiary`） |
| `src/types/api.ts` | `ChartConfig` 加可选 `series_colors?: string[]` |

### 16.5 验证数据（本轮）

- `cd backend; & "E:\python3.9.6\python.exe" -m pytest tests -q` → **200 passed**（+14：`test_board_export.py` 9 条 +
  builder 5 条「custom 排序 / 单系列轴标题 / series_colors / 非法颜色 / 图例在轴下」）
- `npx tsc --noEmit` → 无输出
- `npx vitest run` → **154 passed**（+14：`boardChartExport.test.ts` 12 条 + `exportName.test.ts` 2 条）
- `scripts/e2e_real_data.py` → **EXIT=0**，新增第 5.5 步：真数据看板 → 图表文件夹 200，3 个文件（1 合并 + 2 拆分）
- 打包后 sidecar 冒烟（`.build-tmp/smoke_sidecar.py`，多了一节）：`/api/board/export/chart-folder` → 200、2 个文件，
  名字 = `网点对比图表 · 上饶德兴 · 网点 × 省份 · 公斤段折扣_2026-10-29 11：38.jpg` + `… · 上海市 · 公斤段折扣.jpg`
- 留档图：`.build-tmp/board-folder-proof/`（6 行 × 1 指标的真接口导出，含一个 `（2）` 重名小图 + PDF 版）；
  实测量到：X 轴 `0-60 → 800+` 自然序、6 条线是品牌 PALETTE、图例两行三列在画布下方不压线

### 16.6 产物（2026-10-29 第十轮）

| 产物 | 大小 | 时间 |
|---|---|---|
| `dist-installer\算账工作台-0.1.0-win-x64-setup.exe` | 314,834,452 B（300.2 MB） | 14:25:39 |
| `dist-installer\算账工作台-0.1.0-win-x64-lite-setup.exe` | 100,010,785 B（95.4 MB） | 14:27:55 |
| 前端 exe `src-tauri\target\release\accounting-workbench.exe` | 9,940,992 B | 14:20:10 |
| sidecar `src-tauri\binaries\sidecar\accounting-backend.exe` | 16,288,823 B | 14:17:00 |

### 16.7 需要用户验收的点

1. 一键算勾「网点对比图表」→ 导出 → **导出 JPEG（当前）** → 选一个目录 → 生成**一个文件夹**：
   1 张 `网点对比图表 · 上饶德兴 · 网点 × 省份 · 公斤段折扣_2026-10-29 HH：MM.jpg`
   + N 张 `网点对比图表 · 上饶德兴 · 上海市 · 公斤段折扣_…jpg`（每个分组一张）。
2. 大图与预览一致：X 轴公斤段是 `0-60, 60-150, 150-300, 300-500, 500-800, 800+`；颜色是品牌蓝/绿/橙；图例在图下方。
3. 「导出 PDF（当前）」同样是一个文件夹（矢量、中文可提取）。
4. **没勾**「网点对比图表」时，PDF/JPEG 两项是灰的，菜单底部有「仅…可用」的提示；饼图/散点也是灰的并提示切成折线/柱状。
5. 同一分钟再导一次 → 文件夹名带 `（2）`，不会覆盖上一个。
6. 「导出 xlsx（当前 / 全部）」「导出 CSV（当前 / 全部）」的名字与内容**没变**。
7. 导出文件管理页能看到这条**文件夹**记录，「打开路径」能直接进那个文件夹。
8. 次任务 B（Win10 硬化 4 个补丁）本轮没做，`HANDOVER_NEXT.md §5` 的方案还在，等确认后再动。

### 16.8 新增的坑

67. **`ax.legend()` 放图外 + `bbox_inches="tight"` 会把导出图撑高、宽高比跑掉**：
    图例移到 `bbox_to_anchor=(0.5, -0.12)` 后，tight bbox 把图例也算进画布，10×6 的图画成 856×605，
    既有 `test_render_jpeg_all_types`（宽高比 ±15%）直接挂。正确做法 = **`fig.legend()` + `fig.subplots_adjust(bottom=0.2)`**：
    图例在画布内部下方，tight 只裁空白，856×571（比例 1.50，10% 误差内）。量法：
    `fig.canvas.draw()` 后断言 `fig.legends[0].get_window_extent().y1 <= ax.get_window_extent().y0`。
68. **「多系列」判据要覆盖「1 个 `show_fields` + 非列名 `y_axis`」**：一键算只勾 1 行 × 1 指标时
    `show_fields` 只有 1 列，旧 `_validate()` 判「Y 轴字段不存在」（400），旧 `prepare_chart_data()` 的
    `columns.index(y_axis)` 还会 `ValueError`。两个分支必须收敛到同一个 `_series_fields()` 判据；
    顺带 `_is_numeric_column()` 先判列存在，否则散点图 + 轴标题也会崩在 `columns.index`。
    验收：`test_single_series_with_axis_title_renders`。
69. **文件夹导出要「隐藏暂存目录 + 同盘原子改名」**：直接往目标文件夹里写，第 3 张失败就会留半个文件夹。
    暂存目录必须建在**目标父目录里**（跨盘 `os.replace` 不是原子操作），失败时 `shutil.rmtree(ignore_errors=True)`。
    测试断言要用 `list(tmp_path.iterdir()) == []`（只看「那个文件夹不存在」查不出残留的 `.board-export-*`）。
70. **拆分小图的「取值」会撞名**：`dims=["网点","省份"]` 且勾了多个网点时，`row.label` 的最后一段（省份）会重复 →
    两张小图同名。做法：前端 `planBoardChartExport()` 发现这批取值有重名就**整批退回完整行标签**，
    同一批内再 `（2）` 去重；后端 `_unique_file_name()` 兜底一次（前后端各一层，别只做一边）。
71. **`folder_base` 与 `stamp` 必须分开清洗**：整串丢给 `safe_name()` 会把时间戳的半角冒号换成「·」
    （`2026-10-29 11·38`，用户看到的文件名就不对了）。时间戳先 `.replace(":", "：")` 再拼（坑 4 的同一族）。
72. **后端加了 pydantic 字段 ≠ 前端有类型**：`ChartConfig.series_colors` 只加在 `schemas/chart.py` 时，
    tsc 立刻报 `TS2353`（对象字面量多了属性）+ `TS2339`（测试读不到）。前后端同名字段要在
    `src/types/api.ts` 成对加，才能过 `npx tsc --noEmit`。

### 16.9 数值格式追加要求（2026-10-29 同一轮，用户原话）

> 不要把绝对量写成万，软件所有千以上的数值写成 1,000 的形式，如 10000 写成 10,000。

统一入口 `src/utils/numberFormat.ts`（`formatNumber` / `formatCount` / `formatChartValue`），
后端同一套规则 `chart/builder.py::format_tick`（千以上 `f"{v:,.0f}"`，千以下 `g` 短格式）。

| 位置 | 改动 |
|---|---|
| 一键算看板 | 删掉 `cmpShort()`（原来 `10000 → 1.0万`）：Y 轴刻度、tooltip、饼图 tooltip 全走 `formatChartValue` |
| 分析页图表 | `ChartPreview`：折线/柱状 Y 轴、散点 X+Y 轴、tooltip、饼图 tooltip 都加千分位 |
| 盈亏平衡 | `RegressionPage`（手动图 + 分组小图）与 `RegressionWindow`（旧窗口）的数值轴 + tooltip |
| 一键算旧窗口 | `BoardWindow` 的 Y 轴 + tooltip |
| 表格（导入/预览） | `DataGrid` 给数据列与行号列加 `valueFormatter`：**只影响显示**，编辑/复制/计算仍拿原始数字 |
| 导出图（matplotlib） | 数值轴装 `FuncFormatter(format_tick)`；分类轴**不能装**（会把「0-60」变成下标）；盈亏平衡导出的两套图也装了 |
| 导出 xlsx / xls | 数值单元格写 `#,##0.####` 数字格式（值不变，Excel 里显示 `10,000`）；列宽按「带千分位」的显示宽度算 |
| 其他 | 行数 / 货量 / 金额本来就走 `toLocaleString` 或 `{:,.0f}`，已有千分位，没动 |

验证：`pytest 204 passed`（+4：`format_tick` 单测、PDF 刻度带千分位、xlsx/xls 数字格式、列宽）、
`tsc 0 错`、`vitest 163 passed`（+9：`numberFormat.test.ts`）、`e2e EXIT=0`；
留档图 `.build-tmp/number-format-proof/数值格式冒烟.jpg`（Y 轴 `10,000 / 12,500 / 15,000 …`、全图无「万」），
同批 PDF 抽取文本得到 `['10,000','12,500','15,000','17,500','20,000','22,500','25,000']`。

**本轮产物（数值格式这一版，覆盖 §16.6 的旧包）**

| 产物 | 大小 | 时间 |
|---|---|---|
| `dist-installer\算账工作台-0.1.0-win-x64-setup.exe` | 314,834,902 B（300.2 MB） | 18:49:06 |
| `dist-installer\算账工作台-0.1.0-win-x64-lite-setup.exe` | 100,011,241 B（95.4 MB） | 18:51:16 |
| 前端 exe `src-tauri\target\release\accounting-workbench.exe` | 9,941,504 B | 18:43:03 |
| sidecar `src-tauri\binaries\sidecar\accounting-backend.exe` | 16,289,650 B | 18:40:49 |

### 16.10 新增的坑（数值格式）

73. **ECharts 的 `{c}` / `{d}` 模板不给格式化机会**：饼图 tooltip 写 `formatter: "{b}：{c}（{d}%）"`
    时 `{c}` 是原始数字（大数没有千分位）。要千分位只能换成函数式 formatter，且函数参数用
    `unknown` + 断言（项目禁 `any`）；轴刻度 / tooltip 用 `valueFormatter`。
74. **matplotlib 不能对分类轴装 `FuncFormatter`**：`set_xticklabels(["0-60", ...])` 之后给 X 轴装
    formatter，matplotlib 会把「刻度位置（0,1,2…）」交给它，标签变成 `0, 1, 2`。只给 Y 轴装
    （散点图的数值 X 轴才可以装）。
75. **千分位是「显示层」的事，别改值**：AG Grid 用 `valueFormatter`、xlsx 用 `number_format`、
    图表用 formatter —— 一旦把格式化后的字符串写回数据，编辑、粘贴、求和、导出全部会坏
    （表格编辑拿到的必须是原始数字）。
76. **删函数要连分支一起清**：`cmpShort()` 删掉后 `axisOption` 里那条
    `formatter: absolute ? … : undefined` 就失效了，留着会让「比率图」和「重量图」走两套格式。
    统一格式时顺手把 `absolute` 判断也简化（现在两边都走 `formatChartValue`）。

---

## 17. 2026-10-29 第十一轮（交接：代码未动，详见 `HANDOVER_NEXT_11.md`）

上一窗口上下文耗尽，本轮**只产出交接文档**。6 条需求、根因坐标、建议实现与 6 个待拍板问题
全在 `HANDOVER_NEXT_11.md`，先读它再动代码。

| # | 需求 | 状态 | 已定位的关键事实 |
|---|---|---|---|
| 1 | 盈亏平衡：「目的所属省份 × 公斤段」合并成级联（每省单独勾公斤段，标签 网点·省份·公斤段） | 未开始 | 后端 `_combos()` 是纯笛卡尔积（`compute/regression.py` L138-145），做不到「浙江省只要 0-60」→ 要加 cascade 字段 |
| 2 | 盈亏平衡：按省份统一写车线成本 / 操作成本 | 未开始 | 依赖 `RegressionGroup.parts`（现在只有 label，没有结构化组合） |
| 3 | 盈亏平衡：卡片数 ≠ 图表数（13 张→10 张可见→只画 6 张） | 未开始 | **两个独立硬上限**：卡片 `groups.slice(0, 8)`（`RegressionPage.tsx` L579）、图表 `groups.slice(0, 6)`（L858）；旧窗口 `RegressionWindow.tsx` L210-211 同病 |
| 4 | 一键算：「汇总」总表 + 按钮顺序（汇总/货物流向/公斤段折扣/公斤段单价 + 对比图表最右）+ 取消「省份」维度 | 未开始 | `FEATURES`/`DIM_MODES`/默认 `dims=["省份"]`（`BoardPage.tsx` L25-30/57-61/132）；后端 `BoardDim` **保留「省份」**（用户已确认，只为兼容老快照；前端不再提供该选项） |
| 5 | 一键算：网点对比图表 29 组只出 6 组 | 未开始 | `COMPARE_MAX_ROWS = 6`（L73）→ `picked = ordered.slice(0,6)`（L223）；导出 `planBoardChartExport()` 同步受影响 |
| 6 | 时间范围：导入后识别 min~max、默认「自定义」、进入分析预填 | 未开始 | `Dataset` 无 time_min/max（`schemas/dataset.py`）；建议新增 `GET /api/dataset/{id}/time-range` 现算（复用 `compute/time_dimension.py::parse_dates`）；默认「本月」散落在 `analysisStore.ts` L49/65/205/224/243/595/651、`RegressionPage.tsx` L107、`BoardPage.tsx` L140-151 |

开工顺序：先修 #3/#5 两个 slice 上限 → #6 时间范围 → #1 级联 → #2 成本统一区 → #4 汇总表 → 出包 →
`HANDOVER_PLAN.md` 续 §18 与本表状态。**§9 的 6 个问题已由用户确认**（见 `HANDOVER_NEXT_11.md` §13 + §14：1→25 列、2→前端只留两项且后端保留省份、3→统一区覆盖+单卡可改、4→合并图也画全部、5→不预填范围、6→后端 cascade）。

---

## 18. 2026-10-29 第十一轮：6 条需求全部落地（级联 / 成本统一区 / 卡片=图表 / 汇总表 / 维度精简 / 时间识别）

> 用户确认的 6 个口径见 `HANDOVER_NEXT_11.md` §13 + §14（**以 §14 为准**）：
> 1→25 列；2→前端只留 网点 / 网点×省份、默认网点×省份、**后端保留「省份」只为兼容老快照**；
> 3→统一区覆盖该省全部卡片、之后单卡仍可单独改；4→合并图也画全部 29 条线；
> 5→识别不出时间字段则不预填（保持 1970-01-01 ~ 2999-12-31）；6→按 A（后端 cascade）。

### 18.1 A③ / B③ 两个「slice 硬上限」先修（bug，独立）

| 文件 | 改动 |
|---|---|
| `src/pages/RegressionPage.tsx` | 卡片 `groups.slice(0, 8)`、图表 `groups.slice(0, 6)` **两处全删** → `visibleGroups(table)`（`src/utils/regressionGroups.ts`） |
| `src/components/regression/RegressionWindow.tsx` | 旧窗口 `table.groups.filter(...).slice(0, 6)` 同样删掉（保底也是全量） |
| `src/pages/BoardPage.tsx` | 删 `COMPARE_MAX_ROWS = 6`、`picked = ordered`、删「仅显示货量前 6 组」文案 |
| `src/components/board/BoardWindow.tsx` | 旧窗口 `board.rows.slice(0, 6)` → `board.rows` |
| `backend/accounting_backend/io/regression_exporter.py` | 补断言：`len(files) == len(groups) + 3`（PDF + 小图网格 + 汇算明细），不一致抛 `EXPORT_FILE_COUNT_MISMATCH` |
| `src/pages/BoardPage.module.css` | `.chartGrid` 改 3 列 grid（原来 flex 自适应）；新增 `.sectionCharts { flex: 1 0 auto }`（`.section` 是 `overflow:hidden`，不这样会被裁掉、外层 `.body` 滚不起来） |

验证（headless 靶场 `.build-tmp/harness/round11.tsx`，桩数据 10 组 / 29 组）：
`REG cards=10 charts=10`（改前 8 / 6）、`CHARTS cells=29 columns=3 canScroll=true`（scrollH 2611 > clientH 662）。

### 18.2 C 时间范围自动识别（后端接口 + 前端默认「自定义」）

- 后端：`GET /api/dataset/{id}/time-range` → `{field, start, end, rows}`
  - `compute/time_dimension.py` 新增 `detect_time_range()` / `pick_time_field()` / `column_looks_like_date()`；
    优先「账单时间」，否则第一个日期列；**数值/布尔列一律不算日期列**（坑 88）；
    没有时间列 / 整列为空 → 三个值全 `None`（不报错）；
  - `services/import_service.py::get_time_range()` 编排，`routers/import_router.py` 只做响应；
  - `schemas/dataset.py` 新增 `TimeRangeInfo`；
  - 用例 `backend/tests/test_api_time_range.py`（正常 / 退回第一个日期列 / 数值列不算 / 整列为空 / 数据集不存在 404）。
- 前端：
  - `src/api/import.ts::fetchTimeRange()`、`types/api.ts::TimeRangeInfo`；
  - `analysisStore` 新增 `detectedRange` + `detectedFor`（缓存键）+ `ensureDetectedRange(datasetId)`：
    `openForRule / openFree / restore` 里各调一次；只在「预设仍是自定义 + 范围还是全量兜底」时预填，
    用户已经点过「本月 / 上月」或改过日期就不动；
  - `initialTimeRange()` 不再返回「本月」，一律全量兜底 + 字段名；`timePreset` 默认全改「自定义」
    （`analysisStore` 初始值 / `openForRule` / `openFree` / `restore` / `reset`）；
  - `RegressionPage`：删 `presetRange("本月")` 默认，日期输入初始空 → `detectedRange` 到了再预填；
    时间字段也跟 `detectedRange.field`；`BoardPage`：`rangeMode` 默认「自定义」+ 进页面 `ensureDetectedRange`；
  - `AnalysisWindow` 帮助文案同步（默认自定义 + 自动预填；识别不出不预填）。

### 18.3 A① 盈亏平衡「目的所属省份 × 公斤段」级联

**后端（按 A：cascade，组合逻辑留在后端）**

| 文件 | 改动 |
|---|---|
| `schemas/regression.py` | `RegressionTableConfig.cascade: dict[str, dict[str, list[str]]]`（父字段 → 父值 → 子字段取值）；`RegressionGroup.parts: dict[str, str]`（结构化组合，供「按省份统一写成本」分组，不再切标签字符串） |
| `compute/regression.py` | 新增 `_cascade_parent / _cascade_child / _cascade_combos`；`_combos()` 有 cascade 时按 **省份（picks 顺序）→ 网点（picks 顺序）→ 该省勾选的公斤段（勾选顺序）** 展开，没有 cascade 仍走 `itertools.product`（老 picks 零影响）；`_order()` 用「组合里真正出现的字段」定标签顺序（cascade 的子维度也要算上） |
| `routers/regression_router.py` | 重建 config 时透传 `cascade`（坑 2 复现点） |
| `compute/field_values.py` + `routers/values_router.py` + `services/values_service.py` | `/api/values` 新增可选 `parent_field` / `child_field`，返回 `cascade: {父值: [子值...]}`（**每省各自的公斤段集合**，前端不再猜）；`distinct_values` 与 `cascade_values` 共用 `_scoped()` |

用例（`backend/tests/test_compute_regression.py::TestCascadeCombos` 3 条 + `test_api_values.py` 1 条）：
① 两省不同段 → 6 张卡片，标签顺序与用户例子逐条一致、`parts` 结构化、合计货量 4100；
② 某省勾了数据里没有的公斤段 → 记入 `empty_combos`（不出卡片）；
③ 老 picks（无 cascade）仍是笛卡尔积，`parts` 也照常给。

**前端**

| 文件 | 改动 |
|---|---|
| `src/utils/regressionGroups.ts`（新） | `visibleGroups()`（空数组是模块常量，别每次 `[]`）、`provinceOf()` / `provinceGroups()`（读 `parts`）、`applyCostToLabels()`、`commonPolicyValue()`；单测 9 条 |
| `src/stores/econStore.ts` | `RegressionInputs.cascade`、`cascadeValues`（级联候选）、`loadValues(datasetId, fields, cascade?)` |
| `src/pages/RegressionPage.tsx` | 「目的所属省份 × 公斤段」一行：一级省份列表、二级该省公斤段（**样式/勾选逻辑照分析页 X 轴浮层**：portal + `placeOverlay`、全选/取消全选/完成、勾几项=只取这些、全取消=该省不参与）；点维度按钮或取值框都会「先启用维度再弹浮层」；老快照的 picks 自动升成 cascade（卡片口径不变） |
| `src/pages/RegressionPage.module.css` | 级联浮层样式（同 ChartConfigPanel 一套变量）+ 统一区样式 |
| `src/components/regression/RegressionWindow.tsx` | 旧窗口同步：省份 × 公斤段两列 chip（同一份 cascade 口径、同一份 `/api/values` 级联候选） |
| `src/stores/projectStore.ts` / `src/utils/pageState.ts` | 快照带 `cascade`；老快照读入时显式给 `{}`（否则沿用上一个项目的勾选） |

靶场实测（真 Chromium，桩数据 5 省）：浮层 `parentIsBody=true`、`insideViewport=true`、452×187；
点「浙江省」二级**只有 1 项**（0-60）；勾完发出的请求 =
`dims:["寄件所属一级网点","目的所属省份","公斤段"]`、`picks:{省份:["浙江省"],公斤段:["0-60"]}`、`cascade:{目的所属省份:{浙江省:["0-60"]}}`。

### 18.4 A② 按省份统一写车线成本 / 操作成本

- 位置：「计算卡片」标题行下方、第一张卡片上方；每个纳入计算的省份一行（省份 + 车线成本 + 操作成本 + N 张卡片）。
- 无本地状态：值取 `commonPolicyValue(policies, 该省全部 label, key)` —— 全都一样就显示那个值、不一样显示空 + 占位「多个值」、
  都没填显示空 + 占位 `0` / `0.08`；输入即 `applyCostToLabels()` 覆盖该省全部卡片。
- 之后单卡改仍是原来的 `updatePolicy()`，只影响那一张（用户确认的口径）。
- 靶场实测：安徽省填 0.2 → 6 张卡片全 0.2；再把第一张改 0.3 → 只有它 0.3、其余 0.2、统一区占位「多个值」，
  请求里 `c_line` 依次是 0.3 / 0.2×5。

### 18.5 B① 一键算「汇总」总表 + 四按钮顺序 + B② 维度精简

| 项 | 结果 |
|---|---|
| 按钮顺序 | `汇总 | 货物流向 | 公斤段折扣 | 公斤段单价`，「网点对比图表」用 `.featureRight { margin-left: auto }` 推到最右 |
| 互斥 | 汇总与三块互斥（点汇总 = 只留汇总，点任一块 = 去掉汇总与对比图表）；对比图表仍与前四块互斥 |
| 汇总表列 | 分组维度（1）+ 货物流向「货量/占比」×6 段（12）+ 公斤段折扣 ×6 + 公斤段单价 ×6 = **25 列** |
| 表外右上 pill | 累计货量（kg）/ 综合折扣（加权）/ 综合单价（加权），三个并列 `.pillFlat` |
| 导出 | xlsx/csv「当前」能导汇总（功能名列写「汇总」，行内容 = 三块拼起来）；文件名「功能」段 = 汇总、指标段 = `货量、折扣、单价` |
| 分组维度 | 前端 `DIM_MODES` 只留 网点 / 网点 × 省份，默认 `inputs.dims = ["网点","省份"]`；**后端 `BoardDim` / `build_board()` 一行没动**；老快照 `dims:["省份"]` 读入原样保留、照常出结果，radio 都不勾 |

靶场实测：默认 `dims=["网点","省份"]`、请求 `dims:["网点","省份"]`；点「汇总」后表体首行 **25 个 td**、
三个 pill = `140,940 / 0.6655 / 0.549`、同屏只剩 1 张表（互斥生效）。

### 18.6 对比图表 29 组版式与导出实测

- 拆分视图：`.chartGrid` 3 列自动换行 + `lazyUpdate`；外层 `.body` 负责下滑（靶场 29 张：`columns=3`、`canScroll=true`）。
- 合并视图：29 条线（`planBoardChartExport` 的 merged 也是全部 entries），图例换行显示 29 项。
- 导出实测（`.build-tmp/verify_board_export_29.py`，真 backend `export_board_chart_folder`）：
  29 组 → **30 个文件**（1 合并 + 29 拆分）全部落盘、最大 449 KB；
  30 张 300 DPI 图耗时 **4.6 秒**（远快于交接文档估的 30–60 秒，提示条文案不用改）；
  合并图 PDF 里能抽到 **29/29** 个系列名（证明合并图确实画了全部 29 条）。
- 单测：`boardChartExport.test.ts` 加「29 组 → 30 个文件名 + 合并大图 29 条线」。

### 18.7 验证数据（本轮）

- `cd backend; & "E:\python3.9.6\python.exe" -m pytest tests -q` → **214 passed**（+10：time-range 5 条、级联 values 1 条、cascade 组合 3 条、导出 10 张卡片 1 条）
- `npx tsc --noEmit` → 无输出
- `npx vitest run` → **173 passed**（+10：`regressionGroups.test.ts` 9 条 + 29 组导出 1 条）
- `scripts/e2e_real_data.py` → **EXIT=0**，新增两步：`dataset/time-range`（账单时间 2026-09-20 ~ 2026-09-20，100 行有效日期）、
  `values(级联)` + `regression/table(级联)`（21 个省份，上海市 `['150-300','60-150']`，parts 正确）
- 静态靶场（真 Chromium，`.build-tmp/harness/round11.tsx` + `serve.py 8736` + headless Edge）：见 18.1/18.3/18.4/18.5/18.6 各节的实测量
- 29 张导出实测：`.build-tmp/verify_board_export_29.py` → `files=30 existing=30`、`merged_pdf_series=29/29`、4.6s

### 18.8 需要用户验收的点

1. **盈亏平衡 · 级联**：点「目的所属省份 × 公斤段」→ 一级点安徽省 → 右侧只列该省有的公斤段 → 勾 0-60、60-150 →
   再点浙江省 → 右侧只有 0-60 → 勾上 → 卡片正好是 `网点 · 省份 · 公斤段` 的 6 张（浙江省不会多出 60-150）。
2. **盈亏平衡 · 统一区**：安徽省车线成本填 0.2 → 该省全部卡片变 0.2；再把其中一张改 0.3 → 只有那张 0.3，统一区显示「多个值」。
3. **盈亏平衡 · 卡片=图表**：13 个组合、3 个无数据 → 10 张卡片 + **10 张图**（原来卡片 8 张、图 6 张），右栏可下滑；
   导出的文件夹里单图张数 = 卡片数。
4. **一键算 · 汇总**：按钮顺序 `汇总 | 货物流向 | 公斤段折扣 | 公斤段单价`，「网点对比图表」在最右；点汇总 → 25 列、右上三个 pill
   （累计货量 / 综合折扣 加权 / 综合单价 加权）；导出 xlsx 的「功能」段是「汇总」。
5. **一键算 · 维度**：分组维度下拉只有 网点 / 网点 × 省份，默认网点 × 省份；**打开第 10 轮存的老项目（dims=["省份"]）不报错、
   仍按省份出结果**，下拉里两个 radio 都不勾，点一下才切过去。
6. **一键算 · 29 组**：拆分视图 29 张、3 列往下排；合并视图 29 条线；导出文件夹 1+29 张（实测 4.6 秒）。
7. **时间范围**：导入后进分析 / 一键算 / 盈亏平衡 → 预设「自定义」、日期已预填识别出的范围；「本月 / 上月」仍是快捷；
   没有时间列的数据集 → 仍是「自定义」但不预填（保持 1970-01-01 ~ 2999-12-31）。

### 18.9 新增的坑

77. **改「默认预设」不是改一个常量**：「本月」散落在 `analysisStore` 7 处 + 两个页面各自的 `useState`。
     这轮把「识别出的范围」做成 store 里的 `detectedRange` + `detectedFor`（缓存键）+ `ensureDetectedRange()`，
     页面只负责「到了就预填」；预填条件必须同时满足「预设仍是自定义」「范围还是全量兜底」，
     否则会盖掉用户刚点的「本月」或老项目里存的范围。
78. **字段级去重喂不了级联勾选**：`/api/values` 只给「这一列有哪些取值」，做不到「浙江省只有 0-60」。
     要么前端把笛卡尔积摆出来（浙江省会多出别的省才有的段），要么后端加一层「父值 → 子值集合」映射
     （这轮选后者：`parent_field` / `child_field` → `cascade`）。
79. **`cascade` 的子维度字段靠 `dims` 推断**：接口只规定「父值 → 子值集合」，不像 `picks` 带字段名。
     规则 = 父字段在 `dims` 里的下一个字段（最后一个则取上一个），所以前端必须发
     `dims = [网点, 省份, 公斤段]` 才能得到「网点 · 省份 · 公斤段」的标签；`_order()` 也要把子维度算进标签顺序，
     否则标签会退化成「网点 · 省份」。
80. **坑 2 又复现了**：`regression_router.py` 逐个挑字段重建 config，加 `cascade` 必须同时透传。
     顺带修了前端：`RegressionTableRequest` 缺 `exclude` / `source` 两个字段 → 之前一直用 `as never` 硬转，
     这轮补上类型、去掉断言（后端加了 pydantic 字段 ≠ 前端有类型，坑 72 的同一族）。
81. **`cascade[字段] ?? {}` 写进 useEffect 依赖 = 坑 1 复活**：兜底的 `{}` / `[]` 每次渲染都是新对象 →
     effect 每帧重跑 → 400ms 防抖后真发一次请求 → 死循环。空值要么模块常量（`NO_BANDS` / `NO_GROUPS`），
     要么用 `useMemo` 包住。
82. **卡片与图表是两个独立上限**：`slice(0, 8)` 与 `slice(0, 6)` 只删一处会变成「卡片 10 张、图 6 张」的新错位。
     删完要在导出侧补硬约束（`len(files) == len(groups) + 3`），否则以后哪一侧被截断都发现不了。
83. **`overflow: hidden` 的 flex 区块会吃掉自动最小高度**：`.section { flex: 1 1 0; overflow: hidden }` 里放 29 张图，
     内容会被裁、外层 `.body` 的 `scrollHeight` 也不涨。图表区块要 `flex: 1 0 auto`（basis auto + 不压缩），
     内容多高就多高，交给外层滚动。量法：`scrollHeight > clientHeight` 且 `columns == 3`。
84. **禁用态的取值按钮会让「点一下就出浮层」变成两下**：级联行的取值按钮原来 `disabled={!cascadeOn}`，
     用户点维度只启用维度、点不了取值框。改成「点维度按钮 = 启用 + 弹浮层」「点取值框 = 没启用就先启用再弹」。
85. **headless Edge + `--virtual-time-budget` 下 React 首次挂载可能晚于页面里的 `setTimeout`**：
     靶场里先 `await wait(1800)` 再量的做法会量到空 DOM（这轮一开始 `cards=0 charts=0` 就是这个假象）。
     一律先 `waitFor(元素出现)` 再量。
86. **静态靶场里 `import.meta.env.VITE_BACKEND_PORT` 不传，`getBackendPort()` 直接抛错**：
     页面看着正常、`fetch` 桩一个都没被调用（回归页只剩一句「Not running inside Tauri and VITE_BACKEND_PORT is not set」）。
     `vite build` 前必须 `$env:VITE_BACKEND_PORT="<靶场端口>"`。
87. **「29 张 300 DPI 要 30–60 秒」是估高了**：实测 30 张（合并 14×8 + 29 张 11×6.4，300 DPI）只要 **4.6 秒**。
     提示条仍保留「正在导出 N 张图…」，但不必按分钟级做进度条。
88. **数值列不能当日期列**：`pd.to_datetime(100)` 得到 1970 年的纳秒时间戳，直接 parse 会把时间范围识别成 1970-01-01。
     `column_looks_like_date()` 必须先排除数值/布尔 dtype，再要求抽样值里过半匹配 `YYYY-MM-DD` / `YYYY/M/D` / `YYYY年M月D日`；
     识别不出来就返回全 `None`（前端保持「自定义」但不预填，用户确认的口径 5）。

### 18.10 产物（2026-10-29 第十一轮，已含 CRLF 归一化后的最终源码）

| 产物 | 大小 | 时间 |
|---|---|---|
| `dist-installer\算账工作台-0.1.0-win-x64-setup.exe` | 314,847,331 B（300.2 MB） | 21:10:59 |
| `dist-installer\算账工作台-0.1.0-win-x64-lite-setup.exe` | 100,023,659 B（95.4 MB） | 21:13:43 |
| 前端 exe `src-tauri\target\release\accounting-workbench.exe` | 9,944,576 B | 21:06:24 |
| sidecar `src-tauri\binaries\sidecar\accounting-backend.exe` | 16,295,191 B（目录 315.7 MB） | 21:04:32 |

打包后 sidecar 冒烟（`.build-tmp/smoke_sidecar.py`，直接起打包好的 `accounting-backend.exe`）→ **PASS**：
`/api/health` 200；多指标 JPEG 200（3919 个彩点）；一键算轴标题 JPEG 200；
`/api/board/export/chart-folder` 200 且 2 个文件都在；**新增「29 组」用例 → 200、30 个文件、30 个都存在**。

---

## 19. 2026-10-29 第十二轮：Win10 兼容性硬化 4 个补丁 + ChartPreview 画布宽

第 11 轮明确留下的「未做」两件事全部落地：**安装包拦老系统**、**WebView2 装失败要能看见**、
**Rust 启动失败不要「双击没反应」**、**最小窗口尺寸降到小屏放得下**，外加 `ChartPreview` 放大弹层的画布宽。
本轮**没有碰任何数据结构 / 页面结构 / 业务口径**（第 11 轮 6 条需求已验收，不动）。

### 19.1 开工前用户拍板的 3 个问题（2026-10-29，全选推荐项）

| # | 问题 | 用户选择 |
|---|---|---|
| 1 | 安装包版本门槛拦到哪一版 | **只拦「低于 Win10」**（`${AtLeastWin10}`），1507 / 1607 LTSB 放过 |
| 2 | 查 WebView2 用不用加 crate | **加 `winreg` 0.56.0**（`Cargo.lock` 里已有、本地离线缓存也有；不触发 tauri/webview 栈重编） |
| 3 | 最小尺寸降了初始尺寸要不要跟着降 | **最小降到 900×560，初始仍 1280×860**（老用户的窗口位置/大小不受影响） |

### 19.2 补丁①：安装包拦 Win7 / 8 / 8.1（`installer\windows\workbench.nsi`）

| 改动 | 位置 |
|---|---|
| `!include "WinVer.nsh"`（NSIS 自带，`.build-tmp\nsis\nsis-3.11\Include\WinVer.nsh`） | 头文件区（`LogicLib.nsh` 下一行） |
| `Function .onInit`：`${IfNot} ${AtLeastWin10}` → 中文 `MessageBox MB_ICONSTOP` + `Abort` | 新增，`Var WebView2Missing` 之后 |
| **空 `Function un.onInit`**（`FunctionEnd` 紧跟）——NSIS 在没定义 `un.onInit` 时会让**卸载程序也走 `.onInit`**，老系统会「装不了也卸不掉」 | 同上 |
| 头部注释补「系统要求 Windows 10 或更高版本」+「WebView2 装失败会弹提示」 | 文件头 `特点：` 段 |

- 门放在 **`.onInit`** 而不是 Section 里：用户一打开安装包就被拦住，不用先点完欢迎页/目录页；
  `Abort` 在 `.onInit` = 安装程序直接退出，`Section` 一行都不执行（= 不会装到一半）。
- 完整包 / 精简包都走这段（与 WebView2 是否内置无关），两个包各编一次都过。

### 19.3 补丁②：WebView2 装失败要能看见（同文件 WebView2 段）

原来 `ExecWait '... /silent /install'` 不接返回码，断网 / 被杀软拦时照样提示「完成」，用户装完双击一片空白。现在：

```nsis
ExecWait '"$INSTDIR\MicrosoftEdgeWebView2RuntimeInstallerX64.exe" /silent /install' $0
Delete "$INSTDIR\MicrosoftEdgeWebView2RuntimeInstallerX64.exe"
${If} $0 == "0"
  Call CheckWebView2                      ; 返回码说成功也再查一次注册表（防静默安装「假成功」）
  ${If} $WebView2Missing == "1"
    MessageBox MB_ICONEXCLAMATION|MB_OK "…安装程序返回成功，但没有检测到运行时…官网地址…"
  ${EndIf}
${ElseIf} $0 == "3010"
  DetailPrint "…成功（返回码 3010：重启后生效）"
${ElseIf} $0 == "1638"
  DetailPrint "…已存在更高版本（返回码 1638），跳过"
${Else}
  MessageBox MB_ICONEXCLAMATION|MB_OK "…安装失败（返回码 $0；返回码为空 = 安装程序没能启动，常见是杀毒软件拦截）…官网地址…"
${EndIf}
```

- `3010`（成功待重启）/ `1638`（已装更高版本）当成功；其它一律弹提示 + 给
  `https://developer.microsoft.com/microsoft-edge/webview2/`。
- 精简包（`/DNOWEBVIEW2`）走另一支（`DetailPrint` 提示先装 WebView2），**不弹**这个框。

### 19.4 补丁③：启动失败不要「双击没反应」（`src-tauri`）

新增 `src-tauri\src\startup.rs`（只做启动环境，不写业务）：

| 函数 | 作用 |
|---|---|
| `webview2_version()` | 读三处注册表（HKLM `WOW6432Node` / HKLM / HKCU 的 `…\EdgeUpdate\Clients\{F3017226-…}` 的 `pv`），与 `workbench.nsi::CheckWebView2` 完全同一套判断 |
| `check_startup_environment()` | 缺运行时 → 返回中文说明 |
| `webview2_missing_message()` / `startup_failure_message()` / `startup_panic_message()` | 三条用户可读中文文案（含官网地址 + 排查顺序） |
| `show_fatal()` | Win32 `MessageBoxW`（`#[link(name = "user32")]` + `MB_ICONERROR\|MB_SETFOREGROUND\|MB_TOPMOST`），**不是** `eprintln!` |
| `install_panic_hook()` | 任何 panic 先弹原生框，再交给默认钩子（debug 版照旧打 backtrace） |

`main.rs` 现在长这样：

```rust
fn main() {
    startup::install_panic_hook();                       // ① panic 也要让用户看见
    if let Err(message) = startup::check_startup_environment() {   // ② 启动前查 WebView2
        startup::show_fatal(&message);
        std::process::exit(1);
    }
    if let Err(error) = run_app() {                      // ③ 原来的 .expect 改成弹框
        startup::show_fatal(&startup::startup_failure_message(&error.to_string()));
        std::process::exit(1);
    }
}
fn run_app() -> tauri::Result<()> { /* Builder…run(generate_context!()) */ }
```

- `Cargo.toml` 只加在 Windows 目标下：`[target.'cfg(windows)'.dependencies] winreg = "0.56"`（macOS 构建不受影响）。
- **两个实测发现**（不在原交接文档里，是本轮挖出来的）：
  1. Tauri 建 WebView 失败是 **panic**（`tauri/src/app.rs:1444` `Failed to setup app: runtime error: failed to create webview`），
     不是 `run()` 返回 `Err` —— 只包 `run()` 的 Result 覆盖不到这种失败，所以必须有 panic 钩子（见坑 89）；
  2. 同一用户开第二份 → WebView2 数据目录被占 → `HRESULT(0x800700AA) 请求的资源在使用中`，
     文案里因此加了「如果已经打开了一个窗口，先关掉它」（见坑 90）。

### 19.5 补丁④：最小窗口尺寸（`src-tauri\tauri.conf.json`）

```json
"width": 1280,  "height": 860,
"minWidth": 900, "minHeight": 560,
```

1366×768 @125% 的可用区约 **1092×574**，原 `minHeight 680` 放不下 → 底部按钮被任务栏/屏幕切掉。
初始尺寸**不动**（用户拍板），老用户的窗口位置/大小不受影响。

### 19.6 任务 2：`ChartPreview` 放大弹层的画布宽（`src\components\chart\ChartPreview.tsx`）

```ts
function zoomCanvasWidth(): number {
  if (typeof document === "undefined") return 1000;
  const { width } = layoutViewport();   // 视觉宽度，绕开 window.innerWidth（坑 56 / 62）
  return Math.min(1060, Math.max(560, width * 0.92 - 60));
}
```

`window.innerWidth` 在 `html { zoom }`（设置页字号）下与视觉宽度不同步，放大弹层里刻度字号/斜度会估错。
只影响字号/斜度估计，不影响任何位移；`fitAxisLabels` 的单测不受影响。

### 19.7 验证数据（本轮）

| 项 | 结果 |
|---|---|
| `pytest tests -q` | **214 passed**（与第 11 轮持平，没改后端） |
| `npx tsc --noEmit` | **0 错** |
| `npx vitest run` | **173 passed / 21 files**（与第 11 轮持平） |
| `scripts/e2e_real_data.py` | **EXIT=0**（项目/导出/设置/数据目录迁移全链路） |
| `cargo check --release` | **EXIT=0**（新增 `winreg 0.56.0`，无 warning） |
| `npx tauri build --no-bundle` | **EXIT=0**，exe 9,986,048 B @22:47:48 |
| `makensis` ×2 | **FULL_EXIT=0 / LITE_EXIT=0** |
| `.build-tmp\smoke_sidecar.py` | **RESULT PASS**：health 200；多指标 JPEG 27,037 B / 3919 彩点；一键算轴标题 JPEG 31,897 B；`board/export/chart-folder` 2 文件；**29 组 → 200、30 个文件、30 个都存在** |

**补丁①② 的 NSIS 机制实证**（`.build-tmp\nsi_gate_probe.nsi`，把 workbench.nsi 的门与返回码分支原样抄一份 + 落盘标记）：

| 用例 | 结果 |
|---|---|
| `${AtLeastWin10}` 在本机的值 | `AtLeastWin10=1`（宏确实在运行时求值，不是空宏） |
| 提示 + `Abort` | 弹窗文案抓到「算账工作台需要 Windows 10 或更高版本…」；`gate_installed.txt` **不存在** → Section 没执行 → 不会装到一半 |
| 返回码分支 | `rc=[5]→fail-warn`、`rc=[0]→ok`、`rc=[3010]→reboot-ok`、`rc=[1638]→already-newer`、`rc=[]→fail-warn` |

**补丁③ 的原生消息框实证**（`.build-tmp\wv2probe`，`#[path]` 直接复用真实 `src-tauri\src\startup.rs`，不复制逻辑）：

| 用例 | 结果 |
|---|---|
| 注册表探测 | `webview2_version = Some("156.0.4314.50")`、`check_startup_environment = Ok`（本机已装，不误报） |
| 缺 WebView2 的框 | `EnumWindows` 抓到 `class=#32770 caption=算账工作台`，正文含 4 段中文 + 官网地址 + `\r\n` 换行正确 |
| 启动失败的框 | 同上，正文含 `错误信息：…` / `出错位置：…` / 4 条排查建议 |
| **真实 exe 第二实例**（用户那份 18:09 还开着时） | **改前**：只写 stderr、双击没反应；**改后**：弹中文框，含 `HRESULT(0x800700AA)` 与「先关掉已经打开的窗口」 |

**补丁④ + 布局实证**

| 量 | 结果 |
|---|---|
| 真窗口 `WM_GETMINMAXINFO` 的 `ptMinTrackSize` | **1350×840** = `900×560 × 150%` 系统缩放（旧值 1024×680 应为 1536×1020）→ 900×560 确实进了 exe |
| 真窗口子窗体 | `WRY_WEBVIEW` + `Chrome_WidgetWin_0` → WebView2 正常起来了（新 exe 不误伤正常机器） |
| 靶场 board 页 @1280×860（真 Chromium） | `.body` clientW=scrollW=1265（**无横向滚动条**）；图表 **3 列**、卡片 375px；`.body` scrollH 2633 > clientH 662（纵向可滚） |
| 靶场 board 页 @1092×574（= 1366×768@125% 可用区） | clientW=scrollW=1077；3 列、卡片 312px；2633 > 596 |
| 靶场 board 页 @900×560（新最小尺寸） | clientW=scrollW=885；3 列、卡片 248px；2656 > 596 → 布局不塌，左右栏照旧各自滚动 |

> 靶场量法（第 12 轮新增）：headless Edge 开 `--remote-debugging-port`，用
> `.build-tmp\cdp_layout.mjs` 走 CDP `Emulation.setDeviceMetricsOverride` 改视口 + `Runtime.evaluate` 量
> `clientWidth/scrollWidth/scrollHeight`，不再依赖截屏（本机 `CopyFromScreen` 会卡死，见坑 96）。

### 19.8 需要用户验收的点

1. **安装包拦老系统**：Win7 / 8 / 8.1 双击安装包（两个包都试）→ 中文提示 + 直接退出，不会装到一半。
   本机没有老系统，反证方式见 19.7 的 NSIS 探针（条件反过来 + `Abort` 生效）。
2. **WebView2 装失败要能看见**：断网 + 系统没有 WebView2 时装完整包 → 弹「安装失败（返回码 …）+ 官网地址」，
   不再假装成功；精简包在缺 WebView2 时仍是「请先安装 WebView2」的说明。
3. **启动失败不要「双击没反应」**：把 WebView2 卸掉（或再开一份）再双击 `accounting-workbench.exe`
   → 弹中文消息框说明原因。**本轮已用「第二实例抢资源」这条路径实测到框**。
4. **1366×768 @125%**：默认窗口完整可见、底部按钮不被切；拖到最小 900×560 时布局不塌（靶场已量，见 19.7）。
5. **字号「特大」+ 小窗口**：图表双击放大 → 刻度不重叠（`zoomCanvasWidth` 走 `layoutViewport()`）。
6. 全量数字：`pytest ≥ 214` / `tsc 0` / `vitest ≥ 173` / `e2e EXIT=0` / `cargo check` 0 错 / sidecar 冒烟 PASS。
7. `dist-installer` 两个包都是本轮的（见 19.10）。

### 19.9 新增的坑

89. **Tauri 建 WebView 失败是 panic，不是 `Err`**：`tauri/src/app.rs:1444` 直接
    `panic!("Failed to setup app: …")`，`Builder::run()` 的 `Result` 根本拿不到。
    只在 `main()` 里判 `run()` 的返回值 = 白做；必须 `std::panic::set_hook` 兜住（本轮 `install_panic_hook()`）。
90. **同一用户第二次启动 → `HRESULT(0x800700AA) 请求的资源在使用中`**：WebView2 数据目录
    `%LOCALAPPDATA%\com.accounting.workbench\EBWebView` 被上一份占着。
    用户视角就是「双击没反应」，文案里必须写明「先关掉已经打开的窗口」。
91. **NSIS 没定义 `un.onInit` 时，卸载程序会走安装包的 `.onInit`**：版本门槛放进 `.onInit` 后，
    老系统会「装不上也卸不掉」。定义一个空 `Function un.onInit` 覆盖掉即可。
92. **`Abort` 放 `.onInit` 才等于「一步都没走」**：放 `Section "主程序"` 开头虽然也不会写文件，
    但用户得先点完欢迎页/目录页，体验完全不同。验收判据 = `Section` 里的标记文件不存在。
93. **NSIS 的 `FileOpen "…\x.txt" "a"` 追加在本机会「后写覆盖前写」**：探针里连写 5 行只留下最后 30 字节
    （长度还和最早那行对不上）。验收探针一律**一个用例一个文件**（`rc_<tag>.txt`），别用追加。
94. **`windows_subsystem = "windows"` 下 `MessageBoxW` 要显式 `#[link(name = "user32")]`**：
    Rust 的 MSVC target 默认不链 user32；再加 `MB_SETFOREGROUND|MB_TOPMOST`，否则框可能藏在别的窗口后面，
    用户还是「没反应」。
95. **`cargo tree --release` 在 cargo 1.99 直接报 `unexpected argument`**：查「某 crate 是谁的间接依赖」
    用 `cargo tree -i <crate>`（不带 `--release`）。顺带：给已经间接依赖的 `windows` crate **加 feature**
    会因 feature 合一重编整个 webview 栈，而 `winreg` 不在主依赖图里，加它只多编一个小 crate。
96. **无交互桌面里 `Graphics.CopyFromScreen` / `Screen.PrimaryScreen.Bounds` 会卡死**（不是抛错，是挂住）：
    想「看见」窗口别截屏，用 `EnumWindows` + `GetWindowTextW` / `EnumChildWindows` 把 caption、正文、
    子窗体类名读出来（本轮两个原生消息框、WebView2 是否渲染都是这么取证的）。
97. **headless Edge 的 `/json/list` 里第一个 `type=page` 可能是 `edge://sync-confirmation-dialog`**（账号同步弹窗）：
    按 url 过滤到 `http://127.0.0.1` 那个页再量，否则量到的是同步对话框（`buttons=0`、`text=我们现在正在…`）。
98. **Windows PowerShell 5.1 两个硬坑**：①`.ps1` 里写中文必须**带 BOM**（否则按 ANSI 读，中文路径变乱码 →
    `Start-Process: 系统找不到指定的文件`），能不用中文字面量就别用（用 `$PSScriptRoot` 推路径）；
    ②执行策略会挡脚本 → `powershell.exe -NoProfile -ExecutionPolicy Bypass -File x.ps1`。
99. **强杀（`Stop-Process -Force`）之后，双击可能变成「一直 `0x800700AA`」**：本轮遇到两次，
    两次都是「把 `%LOCALAPPDATA%\com.accounting.workbench\EBWebView` 改名 / 挪走之后就能启动」
    （A/B 各验一遍；注意这份目录不是项目数据 —— 项目数据在数据目录里，这里只有 WebView2 缓存和
    `localStorage` 的主题/字号）。**不要据此推断它就是 WebView2 的 UDF**：本轮也没能证明目录与
    `--user-data-dir` 一一对应，只知道「挪走 = 能启动」。给用户的建议写成「先关掉所有窗口，
    还是打不开就把该目录改名（例如加 `-bak`）再试」，不要写成「这个目录就是缓存目录」。

### 19.10 产物（2026-10-29 第十二轮，已含 CRLF 归一化后的最终源码）

| 产物 | 大小 | 时间 |
|---|---|---|
| `dist-installer\算账工作台-0.1.0-win-x64-setup.exe` | 314,860,402 B（300.3 MB） | 22:52:50 |
| `dist-installer\算账工作台-0.1.0-win-x64-lite-setup.exe` | 100,036,456 B（95.4 MB） | 22:55:38 |
| 前端 exe `src-tauri\target\release\accounting-workbench.exe` | 9,986,048 B | 22:47:48 |
| sidecar `src-tauri\binaries\sidecar\accounting-backend.exe` | 16,295,213 B（目录 315.7 MB） | 22:09:53 |

打包后 sidecar 冒烟（`.build-tmp\smoke_sidecar.py`，直接起打包好的 `accounting-backend.exe`）→ **RESULT PASS**：
`/api/health` 200；多指标 JPEG 200（3919 个彩点）；一键算轴标题 JPEG 200；
`/api/board/export/chart-folder` 200 且 2 个文件都在；**29 组 → 200、30 个文件、30 个都存在**。

---

## 20. 2026-10-30 第十三轮：真机 5 条反馈（总表排版 / 汇总表头 / 占比口径 / 时间范围预填 / 导出图图例）

用户 2026-10-30 一次性给了 5 条（每条都带截图）。**没有改任何业务口径**，只改了「显示 / 导出排版 /
预填」这一层；唯一被统一的是「占比」的分母（导出原来与界面对不上，见 20.3）。

### 20.1 ①「网点对比图表导出的总表排版有问题」（图1）

**现象**：29 组 × 2 指标 = **58 条图例**的合并大图里，图例从画布底部往上长进绘图区，
把折线和 X 轴刻度（0-60 / 60-150 / 300-500 / 800+）一起盖住。

**根因**：`chart/builder.py::_draw_legend` 固定 `subplots_adjust(bottom=0.2)` + `ncol=min(3, …)`。
58 条排 20 行，高度远超画布的 20%，图例只能往上侵入绘图区。

**修法**：

| 规则 | 做法 |
|---|---|
| 列数 | 按「画布宽度 ÷ 一列图例宽度」反推（`_legend_column_in`：CJK 1 em、西文 0.55 em + 句柄余量），不再固定 3 列，也保证不横向溢出 |
| 字号 | 条目 ≤9 → 10pt；≤40 → 8pt；更多 → 7pt |
| 留白 | 行数 = `ceil(条目数 ÷ 列数)`，底部留白按行数估；估出来要占 >45% 就先**加高画布**（最多 2.2 倍，宽度不动） |
| 贴底 | `fig.canvas.draw()` 后量图例**真实**高度 + X 轴刻度标签高度，再 `subplots_adjust(bottom=…)` 贴一次底（坑 100 / 106） |

**实测**（`.build-tmp/proof_legend_58.py`，58 条系列，`RenderOpts(figsize=None)`）：

| 量 | 改前 | 改后 |
|---|---|---|
| 画布 | 10.32 × 6.40 in | 10.32 × **9.16** in |
| 图例 | 1969 × 801 px，顶部 816 **>** 绘图区底 740（压住折线） | 1969 × 801 px，顶部 823 **≤** 绘图区底 927（在下方） |
| X 轴刻度 | 被图例压住 | 6 个全在，且都在图例上方 |
| 绘图区高 | 949 px | **1491 px**（占画布 54%） |

留档图：`.build-tmp/proof-legend/合并大图-58系列.jpg`。单测：`test_many_series_legend_does_not_cover_plot`。

### 20.2 ② 汇总表「货物流向（货量 kg / 占比）」下面改成公斤段名（图2）

`BoardPage.tsx` 汇总表第二个表头行原来 6 个格子全写「货量」，看不出是哪个公斤段；
改成 `0-60 | 占比 | 60-150 | 占比 | …`（「货量」在上一行的分组标题里已经说过）。
第一个表头行（货物流向 12 列 / 折扣 6 列 / 单价 6 列）与 25 列版式一字未动。

实测（静态靶场 `page=board&step=summary`）：
`SUMMARY_HEADER cells=24 texts=0-60|占比|60-150|占比|150-300|占比|300-500|占比|500-800|占比|800+|占比|0-60|…`；
`SUMMARY tables=1 firstRowCells=25 pills=140,940 / 0.6655 / 0.549`（列数不变）。

### 20.3 ③ 导出表格有数值和界面不一致 → 占比口径统一（图3 / 图4）

**现象**：同一个格子（上饶德兴 · 福建省 · 0-60）界面写 **0.1%**，导出的长表写 **0.1567**。

**根因**：界面（汇总表 `shareOf` / 货物流向块 `FlowCells`）分母 = **全表累计货量**（191 ÷ 140,940 ≈ 0.1%）；
`BoardPage.longTable()` 用的是 **该行货量**（191 ÷ 1,218 = 0.1567）。两个口径都“讲得通”，但**不能同时存在**。

**修法**：新增 `src/utils/boardSummary.ts`（界面与导出唯一入口）

```ts
export function boardTotalVolume(board): number        // 0 / 非法值 → 0
export function boardSharePct(volume, total): number | null   // 1 位小数的百分数
```

- 导出的「指标」列由 `占比` 改成 **`占比（%）`**，值是百分数（`0.1` = 0.1%），与界面 `0.1%` 逐字对得上；
- 界面的 `shareOf` 也改调同一个函数，避免以后又长出一套；
- 单测 `src/utils/boardSummary.test.ts`（3 条）：191 / 140,940 → **0.1**、老口径 15.7 必须对不上、0/NaN → `null`。

实测（靶场点「汇总 → 导出 → 导出 xlsx（当前）」，拦 `/api/export` 的请求体）：
`metricNames=["货量","占比（%）","折扣","单价"]`、`占比（%）=0.7`（stub 数据），`rowCount=696` 不变。

### 20.4 ④ 一键算没预填、分析页给 1970~2999（图5 / 图6 / 图7）

**现象**：盈亏平衡页时间范围已按识别结果填好（2026/09/14 ~ 2026/09/20），
一键算页的起止日期是空占位（`yyyy/mm/日`），分析页写的是 `1970/01/01 ~ 2999/12/31`（全量兜底）。

**根因**：`analysisStore.ensureDetectedRange()` 开头

```ts
if (get().detectedFor === datasetId) return;   // ← 命中缓存直接早退
```

盈亏平衡页先进场 → 识别成功、缓存写好、范围落到 store；再进一键算 / 分析页时**命中缓存直接 return**，
预填逻辑一次都没跑（坑 105）。而这两个页面的初始范围又是全量兜底，于是 图6 空、图7 写 1970~2999。

**修法**：命中缓存时**仍按「预设仍是自定义 + 范围仍是全量兜底」补填一次**（不再打接口）。
用户已经点过本月/上月或改过日期的，照旧不覆盖（坑 77 的规则不变）。

单测 `src/stores/analysisStore.test.ts`（4 条）：首次预填 / **缓存命中补填** / 用户改过不覆盖 / 识别不出保持全量。
靶场实测（`page=board`）：日期输入 `dateValues=2026-09-01|2026-09-20`、`rangeMode=自定义`。

### 20.5 ⑤ 导出图没图例、没「计划货量」说明（图8 / 图9）

**现象**：表格取数模式导出的小图**没有图例**、竖线也没说明；手动模式的图有图例但没有竖线说明。

**根因**（三处，都在 `io/regression_exporter.py`）：

1. `_group_chart()` 里两条线都带 `label`，但**从来没人调 `ax.legend`**；
2. `axhline(0)` / `axvline(z_plan)` 都没 `label`、也没文字说明；
3. 手动模式 `axvline(z_max / 2)` —— 而 `z_max = steps[-1].z × 2`、`steps[-1].z = 3 × 计划货量`，
   所以那条「计划货量」竖线其实画在 **3 倍计划货量**处（位置错，本轮一并修，坑 107）。

**修法**：

| 位置 | 改动 |
|---|---|
| `_reference_lines()`（新） | 保本线 `label="保本线"`、计划货量竖线 `label="计划货量"`（图例文案不带数值，网格/PDF 一页多图共用一条图例，带数值会串组，坑 103）+ 竖线顶端小字「计划货量 400 kg」 |
| `_group_chart()` | 调整前改**中性灰虚线**（原来两条线同色，加了图例也分不清哪条是哪条）、调整后保留分组色实线 |
| `_legend_below()`（新） | 图例统一画在**画布正下方**（`fig.legend`，坑 67 同一套）：单图 / 网格 / PDF 每页 / 手动模式各画一条，底边距 = 原底边距 + 图例真实高度 |
| 手动模式 | 竖线位置改成 `_plan_volume(result)`（扫描表里 factor = 1 的那一档 = 计划货量），横轴到最后一档（3 × 计划货量） |

单测（`tests/test_regression_exporter.py` +3）：`_reference_lines` 的 label 与竖线 x 位置、`_group_chart` 的四条图例顺序
（`调整前 / 调整后 / 保本线 / 计划货量`）、`_plan_volume` = 120,000（factor=1 那一档）。

留档图：`.build-tmp/proof-regression/`（表格取数 `小图-01-上海市.jpg`、`小图网格.jpg`、手动 `小图-01-货量-利润.jpg`）。

### 20.6 验证数据（本轮）

| 项 | 结果 |
|---|---|
| `pytest tests -q` | **218 passed**（+4：图表图例 1 + 导出图 3） |
| `npx tsc --noEmit` | **0 错** |
| `npx vitest run` | **180 passed / 23 files**（+7：`boardSummary.test.ts` 3 + `analysisStore.test.ts` 4） |
| `scripts/e2e_real_data.py` | **EXIT=0** |
| `makensis` ×2 | **FULL / LITE 都 EXIT=0**（见 20.8） |
| `.build-tmp\smoke_sidecar.py` | **RESULT PASS**（含 29 组 → 30 文件，见 20.8） |

### 20.7 需要用户验收的点

1. **网点对比图表导出（PDF/JPEG 当前）**：合并大图里图例整块在绘图区下方，折线、X 轴刻度都不被压住（画布会变高一点）。
2. **一键算 → 汇总**：表头第二行是 `0-60 占比 60-150 占比 …`；导出 xlsx 里「指标」列有「占比（%）」，数值与界面百分比一致。
3. **时间范围**：先进盈亏平衡再进一键算 / 分析 → 三处都填同一个识别范围；自己改过日期不会被覆盖。
4. **盈亏平衡导出（表格取数与手动输入两种）**：小图下方都有图例（调整前 / 调整后 / 保本线 / 计划货量），
   竖线顶端有「计划货量 x kg」；手动模式的竖线落在**计划货量**上（不再是 3 倍处）。

### 20.8 产物（2026-10-30 第十三轮，已含 CRLF 归一化后的最终源码）

| 产物 | 大小 | 时间 |
|---|---|---|
| `dist-installer\算账工作台-0.1.0-win-x64-setup.exe` | 314,865,000 B（300.3 MB） | 09:55:45 |
| `dist-installer\算账工作台-0.1.0-win-x64-lite-setup.exe` | 100,041,033 B（95.4 MB） | 09:58:27 |
| 前端 exe `src-tauri\target\release\accounting-workbench.exe` | 9,986,048 B | 09:50:18 |
| sidecar `src-tauri\binaries\sidecar\accounting-backend.exe` | 16,298,832 B（目录 315.7 MB） | 09:47:43 |

打包后 sidecar 冒烟（`.build-tmp\smoke_sidecar.py`，直接起打包好的 `accounting-backend.exe`）→ **RESULT PASS**：
`/api/health` 200；多指标 JPEG 200；一键算轴标题 JPEG 200；`/api/board/export/chart-folder` 200 且 2 个文件都在；
**29 组 → 200、30 个文件、30 个都存在**。
冒烟顺带验了本轮①的成品：29 组合并大图（`.build-tmp\aw_sidecar_*\chart-folder-29\…\网点对比图表 … .jpg`）
图例改成 5 列 × 6 行整块排在绘图区下方，折线与 `0-60 / 150-300 / 60-150` 刻度都不再被盖住。
### 20.9 新增的坑

100. **matplotlib 图例的真实行高比估算大得多**：7pt 一行实测 ≈ 0.178 in（≈ 字号 × 0.0273），
     按「字号 × 0.0132 + 0.016」估算只有一半 → 图例照样压进绘图区。
     正确做法：先按估算把画布加高，`fig.canvas.draw()` 量 `legend.get_window_extent(renderer)` 的**真实**高度，
     再 `subplots_adjust(bottom=…)` 贴一次底；**底边距必须把 X 轴刻度标签的高度也算进去**（否则刻度贴到图例上）。
101. **图例列数要按画布宽度反推**：58 条图例固定 3 列会高 20 行（压住绘图区），固定 5 列又会横向超出画布被裁掉。
     列宽估算 CJK 1 em / 西文 0.55 em 偏保守（列少行多）是安全方向。
102. **`get_cjk_font()` 不吃参数**（返回固定 `FontProperties`）：要指定字号必须用 `cjk_font(size)`。
     `io/regression_exporter.py` 里两个都在用，写错就是 `TypeError: get_cjk_font() takes 0 positional arguments`。
103. **一张画布多子图共用一条图例时，图例文案不能带具体数值**：网格图里第一组的「计划货量 400 kg」
     会挂在第二组（800 kg）的子图下面。数值写在竖线顶端的小字里，图例只写「计划货量」。
104. **比率列导出/界面必须同一个分母**：一键算的「占比」界面是「÷ 全表累计货量」（191 → 0.1%），
     导出原来用「÷ 该行货量」（191 → 15.7%），同一个格子差几十倍。修法不是改两处数字，
     而是抽 `utils/boardSummary.ts` 一个入口，界面与导出都调它；导出的「指标」列写「占比（%）」把单位说明白。
105. **`detectedFor === datasetId → return` 是坑 77 的翻版**：预算结果缓存命中就早退，
     会让**后进页面**的预填永远不发生（盈亏平衡先预填，一键算/分析页拿到 1970~2999）。
     缓存命中时要把缓存里的值再按「用户没改过」的条件补填一次。
106. **量 `get_window_extent` 之前一定要先 `canvas.draw()`，改完布局要再量一次**：
     我第一次量 X 轴刻度标签拿到的是 `subplots_adjust` **之前**的 bbox，误判成「刻度压住图例」。
107. **老导出图的「计划货量」竖线位置是错的**：手动模式 `z_max = steps[-1].z × 2`、`axvline(z_max / 2)`，
     而 `steps[-1].z = 3 × 计划货量` → 竖线实际画在**3 倍计划货量**处。
     计划货量 = 扫描表里 `factor = 1` 的那一档（`_plan_volume()`）。用户没提这条，
     但既然这轮给竖线加说明，位置不对会被立刻发现，所以一起修了。

---

## 21. 2026-10-30 第十四轮：导出饼图补辅助线 + 散点图下线

用户 2026-10-30 给了 2 条（4 张截图）：①「分析界面导出的饼图没有辅助线，和预览不一致」；
②「删除网点对比图表和分析界面图表里的散点图」。**没有动任何计算口径**，只改了「图表导出渲染」和「图表类型入口」。

### 21.1 ① 导出的饼图没有辅助线、标签叠成一团（图1 / 图2）

**现象**：分析界面导出的饼图（图1）标签沿半径排、互相压住，**没有预览里那种折线辅助线**；
预览（图2，ECharts）每个标签都有一条「扇形边缘 → 折点 → 文字」的彩色折线，标签也不重叠。

**根因**：`chart/builder.py::_render_to_figure` 的饼图分支直接把 `labels` 交给 `ax.pie()`，
matplotlib 只按半径径向摆文字（`labeldistance=1.06`），不会画辅助线、也不会错开重叠标签；
29 个多行标签自然叠成一团。

**修法**：新增 `_render_pie()`（`chart/builder.py`）

| 规则 | 做法 |
|---|---|
| 起点/方向 | `startangle=90, counterclock=False`（与 ECharts 默认一致：12 点钟起顺时针） |
| 标签内容 | `{组合名（折行）}\n{百分比}`，百分比最多两位小数、不留尾零（`pie_percent_text`，对齐 ECharts 的 `{d}%`）；不再把百分比画在扇形里 |
| 分列 | 按扇形中点角度 `cos ≥ 0` 分左右两列（`_PIE_LABEL_COL = 1.20` 个饼半径） |
| 错开 | `spread_pie_labels()`：同一列按理想 y 从上往下压，保证包围盒不重叠；底部越界整体上移、顶部再压一次；区间装不下时按比例压缩间距 |
| 辅助线 | 每个扇形一条 `边缘 → 半径 1.08 折点 → 列内边缘` 的三点折线，颜色 = 该扇形颜色（即预览的 labelLine） |
| 画布 | 同一列标签叠起来多高就把画布加高（`fig.set_size_inches`），饼直径固定 ≈ 画布宽的一半（最多 4 in），不会越加越小 |
| 字体 | 分类数 ≤8 → 10pt；≤16 → 9pt；≤30 → 8pt；更多 7.5pt |
| 扇形描边 | 0.6pt 白边（预览切片之间也是白缝） |

留档图：`.build-tmp/pie29.jpg`（29 组）、`pie12.jpg`、`pie2.jpg`、`pie40.jpg`（40 组，画布自动加高到 13.1 in）。
单测（`tests/test_chart_builder.py` +4）：`pie_percent_text` 与预览同格式；`spread_pie_labels` 保序/不重叠/不越界；
12 个扇形 = 12 条辅助线 + 12 个带 `%` 的标签；**29 个标签同列包围盒两两不重叠**且画布被加高。

### 21.2 ② 散点图下线（图3 / 图4）

**要求**：网点对比图表（图3）和分析界面图表（图4）都不再出现「散点」。

**修法**（按 2026-10-25「占比」下线的同一套做法：前后端 + schema + 文档全删，不留半截）：

| 位置 | 改动 |
|---|---|
| `src/types/api.ts` | `ChartType` 去掉 `"scatter"` |
| `src/components/chart/ChartConfigPanel.tsx` | 图表类型只留 折线 / 柱状 / 饼图；去掉散点专用 toast |
| `src/components/chart/ChartPreview.tsx` | 删掉 scatter 的 ECharts option 分支 |
| `src/pages/BoardPage.tsx` | 本地 `ChartType` 去掉 scatter；`axisOption` 只分 `bar / line`；提示文案「饼图 / 散点暂不支持」→「饼图暂不支持」 |
| `src/utils/chartData.ts` | 可读回的图表类型去掉 scatter；`validateChartConfig` / `sanitizeConfigForType` / `_typeLabel` 的散点分支删除；**老项目快照里的 `scatter` 按折线读回**（`normalizeChartConfig`） |
| `backend/accounting_backend/schemas/chart.py` | `chart_type` Literal 去掉 `"scatter"`（再传就是 422） |
| `backend/accounting_backend/chart/builder.py` | 删掉 scatter 的渲染 / 尺寸 / 刻度格式化 / 校验分支与 `_is_numeric_column` |
| `AGENTS.md` §6.6 / §7.8 | 同步（表里删 scatter 行 + 一句「已下线」） |

单测：删 3 条纯散点用例（前端 2 条 + 后端参数化里的 scatter 档），补 1 条「老快照回落折线」、
1 条「schema 拒绝 scatter」、1 条「HTTP 再传 scatter = 422」。

### 21.3 验证数据（本轮）

| 项 | 结果 |
|---|---|
| `pytest tests -q` | **221 passed**（218 − 2 散点档 + 4 饼图 + 1 schema） |
| `npx tsc --noEmit` | **0 错** |
| `npx vitest run` | **178 passed / 23 files**（180 − 3 散点 + 1 老快照回落） |
| `scripts/e2e_real_data.py` | **EXIT=0**（导入 → 看板 → 盈亏平衡 → 文件夹导出 → 项目/设置/目录迁移） |
| `npx tauri build --no-bundle` | **EXIT=0**（vite 729 modules / cargo 1m18s） |
| `makensis` ×2 | **FULL_EXIT=0 / LITE_EXIT=0** |
| `.build-tmp\smoke_sidecar.py` | **RESULT PASS**：health 200；多指标 JPEG 200（3948 色点）；看板 JPEG 200；`chart-folder` 2 文件；**29 组 → 30 文件、30 个都在** |

饼图导出的目测核对：`.build-tmp/pie29.jpg`（29 组）、`pie12.jpg`、`pie2.jpg`、`pie1.jpg`、`pie40.jpg`；
PDF 文本层用 pypdf 抽查（`54.79%` / `34.25%` / `10.96%` 与标签名都能提取 = 矢量文字没被转成路径）。

### 21.4 需要用户验收的点

1. 分析界面 → 图表 → 饼图 → 导出 PDF/JPEG：每个扇区都有彩色折线辅助线，标签互不重叠、带百分比；
   分类多（如 29 组）时画布自动变高，饼不会缩成一小块。
2. 分析界面图表类型只剩 折线 / 柱状 / 饼图；网点对比图表只剩 折线 / 柱状 / 饼图。
3. 老项目若曾存过散点图，重新打开后按折线显示（不会空白、不会报错）。

### 21.5 新增的坑

108. **matplotlib 的 `ax.pie(labels=…)` 不会错开标签**：多层长标签（29 组 × 3 行）必然重叠，
     也没有 `labelLine`。饼图导出要自己算「分左右两列 + 纵向错开 + 三点折线」；
     ECharts 的 `avoidLabelOverlap` 是它自己实现的，matplotlib 里没有对应开关。
109. **`multialignment` 必须跟 `ha` 一起设**：左列 `ha="right"` 要给 `multialignment="right"`、
     右列 `ha="left"` 给 `multialignment="left"`，否则多行标签每行各自居中，看着像「没对齐」。
     像素验收法：同一列每行暗像素的 `x.max()` 应一致（本轮 8 条标签实测都是 257±1）。
110. **饼图画布高度要按「同一侧标签总高」算，不能按分类总数算**：扇区按角度分左右两列，
     实测 40 组时右列 26 个标签、左列 14 个（角度不均），画布要按 26 个算才不重叠。
111. **`fig.set_size_inches` 之后要重新 `subplots_adjust` 并重算 `ly`**：否则坐标区还是旧高度，
     标签会被裁到画布外；标题也要挪到**改完画布尺寸之后**再画（`_draw_title` 原来在开头画，饼图会停在旧位置）。

### 21.6 产物（2026-10-30 第十四轮，已含 CRLF 归一化后的最终源码）

| 产物 | 大小 | 时间 |
|---|---|---|
| `dist-installer\算账工作台-0.1.0-win-x64-setup.exe` | 314,866,851 B（300.3 MB） | 14:04:48 |
| `dist-installer\算账工作台-0.1.0-win-x64-lite-setup.exe` | 100,042,958 B（95.4 MB） | 14:06:56 |
| 前端 exe `src-tauri\target\release\accounting-workbench.exe` | 9,986,048 B | 13:59:55 |
| sidecar `src-tauri\binaries\sidecar\accounting-backend.exe` | 16,302,014 B（目录 315.7 MB） | 13:57:53 |

打包后 sidecar 冒烟（`.build-tmp\smoke_sidecar.py`，直接起打包好的 `accounting-backend.exe`）→ **RESULT PASS**：
`/api/health` 200；多指标 JPEG 200（3948 个色点）；看板轴标题 JPEG 200；`/api/board/export/chart-folder` 200 且 2 个文件都在；
**29 组 → 200、30 个文件、30 个都存在**。


