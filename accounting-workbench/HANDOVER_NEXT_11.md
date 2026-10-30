# 交接文档 · 第 11 轮（2026-10-29 晚）：盈亏平衡级联分组 / 成本统一区 / 图表数量 / 一键算汇总表 / 维度精简 / 时间范围识别

> 为什么开新窗口：第 10 轮的两项（看板「导出文件夹」+ 全站数字千分位）已交付并出包；
> 第 11 轮这 6 条需求体量大（4 个页面 + 后端 2 处 schema + 时间范围识别 + 全量验证 + 出包），
> 上一窗口上下文不够，**本轮一行代码都还没改**，只留下这份文档。
> §9 的 6 个问题已由用户确认（见 §13 + §14），新窗口直接按 §10 的顺序开工，不用再问。

---

## 0. 一句话任务

1. **盈亏平衡**：把「目的所属省份 / 公斤段」两个筛选合并成**省份 → 公斤段 级联勾选**（每省单独勾公斤段）；
   加一块**按省份统一写车线成本/操作成本**的功能区；修掉「卡片数 ≠ 图表数」（实测 10 张卡片只出 6 张图）。
2. **一键算**：新增「汇总」总表按钮（合并货物流向/公斤段折扣/公斤段单价三块），四按钮顺序
   `汇总 | 货物流向 | 公斤段折扣 | 公斤段单价`，「网点对比图表」挪到最右；分组维度**取消「省份」**（只留 网点 / 网点×省份）；
   修掉「网点对比图表只出 6 组」（29 组只画 6 组）。
3. **时间范围**：导入后自动识别时间字段的 min~max；所有时间选择处默认「自定义」并预填这个范围（取消默认「本月」）。

---

## 1. 现状基线（第 10 轮已交付，别改坏）

| 已交付 | 位置 | 回归用例 |
|---|---|---|
| 看板图表导出成文件夹（1 张合并 + N 张拆分） | `backend/accounting_backend/io/board_exporter.py`、`routers/board_export_router.py`、`src/utils/boardChartExport.ts`、`src/api/board.ts` | `backend/tests/test_board_export.py`、`src/utils/boardChartExport.test.ts` |
| 导出与预览一致的三处（custom 排序 / series_colors / 图例在画布下方） | `chart/builder.py`、`schemas/chart.py` | `test_chart_builder.py` |
| 全站数字千分位（不用「万」，`10,000`） | `src/utils/numberFormat.ts`、`chart/builder.py::format_tick`、`io/excel_exporter.py`、`DataGrid` `valueFormatter` | `numberFormat.test.ts`、`test_chart_builder.py`、`test_excel_exporter.py` |

最近一次全绿基线：`pytest 204 passed` / `tsc 0 错` / `vitest 163 passed` / `e2e EXIT=0` / 打包后 sidecar 冒烟 PASS。
最近一次产物：`setup.exe` 314,834,902 B（18:49:06）、`lite-setup.exe` 100,011,241 B（18:51:16）、
exe 9,941,504 B（18:43:03）、sidecar 16,289,650 B（18:40:49）。

---

## 2. 环境与命令（照抄，别自己改）

```powershell
# 仓库根
C:\Users\13774\Desktop\网管算账工作台\accounting-workbench

# 后端测试（Python 用 E:\python3.9.6\python.exe，不是 bundled DSH python）
cd backend; & "E:\python3.9.6\python.exe" -m pytest tests -q

# 真实数据全链路
cd backend; & "E:\python3.9.6\python.exe" scripts\e2e_real_data.py

# 前端（TEMP 必须指到工作目录里的 .build-tmp）
$env:TEMP="$PWD\.build-tmp"; $env:TMP="$PWD\.build-tmp"
$env:Path="C:\Users\13774\.nodejs\node-v24.21.0-win-x64;$env:Path"
npx tsc --noEmit
npx vitest run

# 打包三步（后端改了必做第一步）
& "E:\python3.9.6\python.exe" backend\build.py
npx tauri build --no-bundle
$env:TEMP="$PWD\.build-tmp\mknsis"; $env:TMP="$env:TEMP"
& "$PWD\.build-tmp\nsis\nsis-3.11\makensis.exe" /V2 installer\windows\workbench.nsi
& "$PWD\.build-tmp\nsis\nsis-3.11\makensis.exe" /DNOWEBVIEW2 /V2 installer\windows\workbench.nsi
```

**权限**：`npx vitest` / `npx tauri build` / PyInstaller / `makensis` / 起 sidecar 冒烟 都必须 `danger-full-access`。
**格式**：源码 CRLF + UTF-8 无 BOM（`edit` 工具对既有 CRLF 文件保持原样，新建文件要跑归一化脚本，见
`.build-tmp/normalize_eol.py`，本轮已含全部已改文件清单）；改 `.nsi` 用 UTF-8 with BOM。
**每步都跑**：`pytest + tsc + vitest`；改完统一出一次包并更新 `HANDOVER_PLAN.md`（§17 + 新坑 77+）。

---

## 3. 需求 1：盈亏平衡 · 省份 × 公斤段级联勾选

### 3.1 用户原话（要点）

> 分组筛选条件中的「目的所属省份」和「公斤段」两个字段下拉窗口合并：一级菜单选省份，二级菜单勾公斤段取值，
> 勾选逻辑和样式同分析界面图表 X 轴取值勾选。例：网点勾「上饶德兴、东阳一部」→ 点「目的所属省份 × 公斤段」
> → 点安徽省 → 右侧勾 0-60、60-150 → 点浙江省 → 勾 0-60 → 卡片自动变为
> 上饶德兴·安徽省·0-60 / 上饶德兴·安徽省·60-150 / 东阳一部·安徽省·0-60 / 东阳一部·安徽省·60-150 /
> 上饶德兴·浙江省·0-60 / 东阳一部·浙江省·0-60；计算与图表都按这个组合来。

**关键点**：不是「省份集合 × 公斤段集合」的笛卡尔积，而是**每个省份各自的公斤段集合**（浙江省只要 0-60），
且卡片标签顺序变成 **网点 · 省份 · 公斤段**（现在是 网点 · 公斤段 · 省份）。

### 3.2 现状证据（已定位）

| 文件 | 行 | 现在是什么 |
|---|---|---|
| `src/pages/RegressionPage.tsx` | L18 | `DIM_CANDIDATES = ["寄件所属一级网点", "公斤段", "目的所属省份"]`（三个独立多选） |
| 同上 | L499-560 | 每个维度一个「多选弹层」，L530/L544 还只取前 20 个取值（省份/公斤段值多时会截断） |
| 同上 | L420-421 | 维度显示名映射（`公斤段`→`公斤段`、`目的所属省份`→`省份`） |
| `backend/accounting_backend/compute/regression.py` | L138-145 | `_combos()` = `itertools.product(各维度 picks)` → **纯笛卡尔积**，做不到「浙江省只要 0-60」 |
| 同上 | L147-155 | `_label()` 按 `config.dims` 顺序用 `" · "` 拼标签 |
| 同上 | L191-211 | 按 combo 过滤 df、累计 z/price/orig，`empty_combos` 计数 |
| `backend/accounting_backend/schemas/regression.py` | L79-96 | `RegressionTableConfig(dims, picks, policies, exclude, source)` |
| 同上 | L98-120 | `RegressionGroup` 只有 `key/label`，**没有结构化的 parts**（前端只能靠切 `" · "` 反推省份） |

### 3.3 建议实现

**后端**（先做，前端才好接）：

1. `RegressionTableConfig` 增加可选字段（二选一，推荐 A）：
   - A `cascade: dict[str, dict[str, list[str]]] = {}` —— 形如 `{"目的所属省份": {"安徽省": ["0-60","60-150"], "浙江省": ["0-60"]}}`，
     key = 父维度字段，内层 = 父值 → 子维度的取值集合；`picks` 里该父维度仍要列省份顺序。
   - B 专用 `province_bands: dict[str, list[str]]`（只服务这一个场景，最简单）。
2. `_combos()`：有 cascade 时按「网点 × 省份 × 该省公斤段」展开，顺序 =
   **省份（按 picks 顺序，即用户点击顺序）→ 网点（按 picks 顺序）→ 公斤段（按勾选顺序）**，
   与用户例子逐条对齐；`dims` 用 `["寄件所属一级网点", "目的所属省份", "公斤段"]` 以得到 `网点 · 省份 · 公斤段` 的标签。
3. `RegressionGroup` 增加 `parts: dict[str, str] = {}`（结构化组合），前端「按省份统一写成本」就不用解析 label。
4. 兼容：不带 `cascade` 的老请求仍走原笛卡尔积（项目快照里已有的 `picks` 不能坏）。
5. 测试：`backend/tests/test_compute_regression.py` 加「一省多段 / 多省不同段」两条数值对照 + 组合顺序断言。

**前端**（`RegressionPage` + 旧窗口 `RegressionWindow`）：

- 把「目的所属省份」「公斤段」两个弹层换成一个 **级联弹层**（形制照
  `src/components/chart/ChartConfigPanel.tsx` 的 X 轴浮层：一级列表 + 右侧取值勾选 + `placeOverlay()` 定位 + portal）：
  - 一级：省份列表（来自 `/api/values`），点省份只切右侧，不直接勾；行上显示已勾几段（`已选 2 项`）；
  - 二级：该省的公斤段列表，勾选即写入 `province→bands` 映射；「全选 / 取消全选」；全部取消 = 该省不参与；
  - 文案与样式对齐分析页 X 轴（「勾几项 = 只取这些」「不勾 = 不参与」）。
- 组合预览/卡片仍由后端返回，前端不再自己算组合。
- **注意**：`RegressionWindow.tsx`（旧弹窗，仍挂在 App.tsx 上）也要同步，否则两套界面行为不一致。

---

## 4. 需求 2：盈亏平衡 · 车线成本统一写入区

### 4.1 用户原话（要点）

> 在「计算卡片」和「勾选取值后，这里会为每个组合生成一张卡片」文字行下方、第一张卡片上方，插入一块车线成本的
> 统一写入功能区。若纳入计算的有安徽省、浙江省、贵州省，则生成
> 「安徽省  车线成本（输入）  操作成本（输入）」三行；用户输入后自动分别填充进下方计算卡片对应位置。

### 4.2 现状证据

| 文件 | 行 | 说明 |
|---|---|---|
| `src/pages/RegressionPage.tsx` | L570-660 附近 | 卡片区（每组一张卡，卡内有 车线成本 / 操作成本 / 计划调整折扣 / 计划承诺货量 四个输入） |
| 同上 | L117 | `groups = table?.groups ?? []` |
| 同上 | L308-315 | `updatePolicy(label, key, value)` 写 `policies`（**key = group.label**，即卡片唯一键） |
| `backend/accounting_backend/schemas/regression.py` | L70-76 | `GroupPolicy(c_line, op_cost, d_plan, z_plan)`，`policies` 以 label 为 key |

### 4.3 建议实现

- 纯前端即可（不用改后端）：卡片键是 label，统一区拿到「该省所有 label」后逐个 `updatePolicy(label, "c_line"/"op_cost", 值)`。
  「该省所有 label」用 3.3 新增的 `group.parts["目的所属省份"]` 分组得到（不要切字符串）。
- 区块位置：卡片列表标题行之下、第一张卡之上；每行 = 省份 + 两个输入（宽度与卡片内输入一致）。
- 默认值：空白（placeholder 提示 `0` / `0.08`），一旦输入就覆盖该省全部卡片的对应值；**没有输入的省份不写**。
- 与单卡输入的关系见 §5-Q3（推荐：统一区写入 = 覆盖；之后单卡仍可单独改，只影响那一张）。

---

## 5. 需求 3：盈亏平衡 · 卡片数 ≠ 图表数（bug，先修）

### 5.1 用户原话

> 生成 13 张卡片、3 个组合无数据隐藏，剩 10 张，但图表只有 6 个（图 1、2）。查原因修掉：生成多少张卡片就要多少张图表，
> 版面不够就往下填充做下滑预览，导出等其他功能同步。

### 5.2 根因（两个硬上限）

| 文件 | 行 | 代码 | 后果 |
|---|---|---|---|
| `src/pages/RegressionPage.tsx` | **L858** | `{groups.slice(0, 6).map(...)}` | **图表最多 6 张**（用户看到的「只有 6 个」就是这个） |
| 同上 | **L579** | `groups.slice(0, 8).map(...)` | **卡片最多 8 张**（用户以为 10 张，其实也只渲染 8 张；这个要一起改） |
| 同上 | L565 | `table?.empty_combos ? ` · N 个组合无数据已隐藏`` | 无数据的组合后端已不计入 groups，前端不用再删 |
| `src/components/regression/RegressionWindow.tsx` | L210-211 | `table.groups...slice(0, 6)` | 旧窗口同样只画 6 条线，要一起改 |

### 5.3 修法

1. 两处 `slice` 全删（卡片 + 图表），直接 `groups.map(...)`。
2. 布局：`RegressionPage.module.css` 的 `.charts`（L166-168，`grid-template-columns: repeat(3, minmax(0,1fr))`）
   保持 3 列、**行数自然增长**；确认外层容器能滚动（左栏 `.side` 是 `overflow:auto`，右栏要确认整页/右栏可下滑，
   不能靠 `max-height` 裁掉）。若右栏不滚动就加 `overflow-y:auto`（用变量写样式，别硬编码颜色）。
3. 导出侧核对：`io/regression_exporter.py` 本来就是遍历全部 groups 出单图/网格/PDF 页，**不需要改**，
   但要补一条断言（导出文件数 == groups 数 + 3），防止以后又被截断。
4. 测试：加 `RegressionPage` 的 smoke/纯函数用例（如把「可见 groups 数」抽成纯函数 `visibleGroups(table)` 并单测），
   `backend/tests/test_regression_exporter.py` 加「groups=10 时单图 10 张」。

---

## 6. 需求 4：一键算 · 「汇总」总表 + 四按钮 + 取消「省份」维度

### 6.1 用户原话（要点）

> 提供「货物流向」「公斤段折扣」「公斤段单价」三个计算功能**合并的总表**选择按钮；「网点对比图表」按钮移到最右侧。
> 四个按钮在左边依次为「汇总」「货物流向」「公斤段折扣」「公斤段单价」。
> 总表内容：① 省份分组维度下，列从左到右 = 省份 | 货物流向数据板块 | 公斤段折扣板块 | 公斤段单价板块；
> 表格外右上方从左到右显示「累计货量 XX kg」「综合折扣 XXXX 加权」「综合单价 XXXX 加权」；
> ② 网点×省份分组维度下同上（第一列换成「网点 × 省份」）。
> 取消分组维度的「省份」维度，仅提供「网点」「网点×省份」；网点对比图表为什么 29 组只出 6 组（图 4-7）。

### 6.2 现状证据

| 文件 | 行 | 现在 |
|---|---|---|
| `src/pages/BoardPage.tsx` | L25-30 | `FEATURES = [flow, discount, price, compare]`（四个按钮平铺） |
| 同上 | L57-61 | `DIM_MODES = [省份(默认), 网点, 网点+省份]` |
| 同上 | L132 | `inputs.dims` 默认 `["省份"]` |
| 同上 | L896-1082 | 每个功能一块（flow/discount/price 各一块），`compare` 单独渲染 |
| `backend/accounting_backend/schemas/board.py` | L21-23 | `DIM_FIELD = {"网点": "寄件所属一级网点", "省份": "目的所属省份"}`、`BoardDim = Literal["网点","省份"]` |
| `src/utils/exportName.ts` | — | `boardExportBaseName()` 的「功能」段来自 `FEATURES`，加「汇总」要同步 |
| `.build-tmp` 无 | — | 现成 `/api/board` 返回 `rows[].cells[]` 已含 vol/price/orig，三块数据都能从同一份 board 出 |

### 6.3 建议实现

1. **按钮**：`FEATURES` 改成 5 项 `[summary(汇总), flow, discount, price, compare]`；
   `summary` 与 flow/discount/price **互斥**（选汇总 = 取消三个单块，反之亦然，参考现在 compare 的写法 L248-264），
   `compare` 仍与前四块互斥；渲染时把 `compare` 用 `margin-left:auto` 推到最右（或单独包一层 `.featureRight`）。
2. **汇总表**：行 = `board.rows`（全部，不截断），列 = 第一列（`board.dim_label`）+ 三个板块（板块内容见 §7-Q1）；
   表外右上三个 pill：`board.sum_vol`（累计货量 kg）、`board.weighted_disc`（综合折扣 加权）、`board.weighted_unit`（综合单价 加权），
   复用现有 `.pill` 样式；没有数据时显示「—」。
3. **维度**：`DIM_MODES` 删「省份」，只留 `网点`、`网点×省份`（默认改成哪一个见 §7-Q2）；
   **后端 `BoardDim` 保留「省份」**（老项目快照 `state.board.dims` 可能是 `["省份"]`，删了会让老项目打不开）；
   `build_board()` 也不用改。
4. **导出**：`xlsx/csv` 的「当前」导出要能导「汇总」（长表 = 三个板块拼起来，或每个板块一个 Sheet，见 §7-Q1）；
   文件名「功能」段加「汇总」；「网点对比图表」那两行 PDF/JPEG 的置灰逻辑（L563-570）保持不变。
5. 图表/表格的 `dim_label` 文案、`exportName` 的「分组维度」段会自动跟着 `dims` 走，不用手改。

---

## 7. 需求 5：一键算 · 网点对比图表只出 6 组（bug，先修）

### 7.1 根因

| 文件 | 行 | 代码 |
|---|---|---|
| `src/pages/BoardPage.tsx` | L73 | `const COMPARE_MAX_ROWS = 6;` |
| 同上 | L223 | `const picked = ordered.slice(0, COMPARE_MAX_ROWS);` |
| 同上 | L1134 | `truncated > 0 ? ` · 仅显示货量前 6 组（含 N 组未显示）`` |
| `src/components/board/BoardWindow.tsx` | L84 | 旧窗口 `board.rows.slice(0, 6)` |
| `src/utils/boardChartExport.ts` | `planBoardChartExport()` | 导出用 `picked`（也是 6 组）→ 取消上限后导出同步变成 1+N 张 |

### 7.2 修法

1. 删掉 `COMPARE_MAX_ROWS` 与 `picked` 截断，改成 `const picked = ordered;`；删 `truncated` 与那句文案；
   旧窗口 `BoardWindow` 同步。
2. 版式：`BoardPage.module.css` 的 `.chartGrid`（拆分布局）改成 3 列自动换行（或按 `minmax` 自适应），
   外层 `overflow-y:auto` 保证能下滑预览；29 张 ECharts 实例要注意**首屏性能**（必要时分批渲染/`lazyUpdate`，
   但**不要**再截断数据）。
3. 导出：`planBoardChartExport` 的 `fileNames` 会自动变成 1+29；注意
   **29 张 × 300 DPI 约 30–60 秒**（导出提示条要显示「正在导出 N 张图…」，已有），
   以及「同名省份」的 `（2）` 去重逻辑（已实现，坑 70）。
4. 图表图例：合并一张时 29 条线，图例很长——按 §7-Q4 的答复处理。
5. 测试：`boardChartExport.test.ts` 加「29 组 → 30 个文件名、顺序与 picked 一致」；`BoardPage` 截断文案相关断言删掉。

---

## 8. 需求 6：时间范围自动识别 + 默认「自定义」+ 预填

### 8.1 用户原话

> 所有涉及时间范围选择的地方，导入表格后自动识别时间字段的值计算时间范围，进入分析功能时预填充；
> 取消时间范围当前默认「本月」，改为「自定义」，自定义时间范围 = 已识别计算的时间范围。

### 8.2 现状证据

| 位置 | 行 | 现在 |
|---|---|---|
| `src/stores/analysisStore.ts` | L49/65 | `TimePreset = "本月" \| "上月" \| "自定义"`；`presetRange("本月")` 初始化 |
| 同上 | L205/224/243/595/651 | 复位/换项目/首次计算都重置成 `本月` |
| `src/pages/RegressionPage.tsx` | **L107** | `const defaultRange = useMemo(() => presetRange("本月"), [])` |
| `src/pages/BoardPage.tsx` | L140-151 | `presets` + `rangeMode` 由「是不是本月/上月」反推 |
| `src/components/analysis/AnalysisWindow.tsx` | L530 | 预设按钮 `本月 / 上月 / 自定义`；L1099 帮助文案也提本月 |
| 后端 | `schemas/dataset.py` L17-30 | `Dataset` **没有** time_min/time_max 字段 |
| 后端 | `compute/time_dimension.py` L12 | 已有 `parse_dates()` 可复用（识别日期列） |
| 后端 | `routers/import_router.py` | 已有 `/api/import`、`/api/dataset/{id}/preview`，可加 `/time-range` |

### 8.3 建议实现（不改数据集 schema，走接口现算，老项目也能用）

1. 后端新增 `GET /api/dataset/{id}/time-range` → `{field, start, end, rows}`：
   - 找时间字段：优先 `账单时间`，否则取 dtype=`date` 的第一列；
   - 用 `compute/time_dimension.py::parse_dates()` 解析、取 `min/max`（全为 NaT → 返回 `null`）；
   - 数据集不存在 → 404 结构化错误（`DATASET_NOT_FOUND`）；没有时间字段 → 200 + `{field: null, start: null, end: null}`。
   - 用例：`backend/tests/test_api_time_range.py`（正常 / 无时间列 / 全空日期 / 数据集不存在）。
2. 前端：
   - `src/api/import.ts`（或新 `src/api/timeRange.ts`）：`fetchTimeRange(datasetId)`；
   - 新增 store action（放 `analysisStore` 或 `projectStore`）：`detectedRange: {start,end,field} | null` + `ensureDetectedRange(datasetId)`（带缓存，重复进页面不再打接口）；
   - `analysisStore` 初始 `timePreset` 由「本月」改成「自定义」，`timeRange` 优先用 `detectedRange`；
   - `RegressionPage` L107 改成「detectedRange ?? 全量 1970-01-01 ~ 2999-12-31」；
   - `BoardPage` 的 `rangeMode` 反推逻辑改成「等于 detectedRange 就是自定义，否则自定义」——直接把默认设为 `自定义`，
     并把起止输入框预填 detectedRange（**保留**本月/上月两个快捷，用户点了才覆盖）；
   - `AnalysisWindow` 预设按钮保留，只是默认高亮从「本月」变成「自定义」；L1099 帮助文案同步改。
3. 兜底：识别不出时间（无 `账单时间` 且无日期列）→ 预设仍显示「自定义」，范围保持全量
   （`1970-01-01 ~ 2999-12-31`，就是现有 `analysisStore` 的空值回落），**不要**退回「本月」。

---

## 9. 开工前必须问用户的 6 个问题（含推荐项，一次问完）

1. **汇总表三块各是什么列？**
   - A（推荐）：每块 = 6 个公斤段的数值列；「货物流向」块再带占比 → 1 + 12 + 6 + 6 = 25 列；
   - B：每块只 1 列汇总值（该行 总货量 / 加权折扣 / 加权单价）；
   - C：每块 6 列、都不带占比（1 + 18 列）。
2. **取消「省份」维度后的默认与兼容**：默认「网点 × 省份」（推荐）/ 默认「网点」；后端是否保留「省份」以兼容老项目（推荐保留）。
3. **车线成本统一区与单卡输入的关系**：A（推荐）统一区写入覆盖该省全部卡片，之后单卡仍可单独改（只影响那一张）；
   B 卡片里两个输入框改只读，只认统一区。
4. **对比图表 29 组的「合并一张」**：A（推荐）合并图也画全部 29 条线（图例会很长）；
   B 拆分视图全部 29 张、合并视图仍只画前 6 条。另确认：导出也会变成 1+29 张、单次约 30–60 秒，可以接受吗？
5. **识别不出时间字段时**：A（推荐）预设仍「自定义」、范围全量；B 退回「本月」。
6. **公斤段级联的数据模型**：A（推荐）后端 `RegressionTableConfig` 加 cascade（父值→子值集合），
   标签顺序改「网点 · 省份 · 公斤段」，老 `picks` 配置继续兼容；B 前端硬展开（**做不到**「浙江省只要 0-60」，不推荐）。

---

## 10. 建议开工顺序（按依赖与风险排）

1. **先修两个 bug**（小、独立、立刻见效）：卡片/图表 `slice` 全删 + `.charts` 可下滑（§5）；对比图表 6 组上限（§7）。
   → 跑 `pytest/tsc/vitest`，确认 204/163 不掉。
2. **时间范围**（§8）：后端 `/api/dataset/{id}/time-range` + 用例 → 前端 store/页面默认改「自定义」。
   → 跑三件套 + `e2e_real_data.py`（它的 time_range 是全量，别改坏）。
3. **盈亏平衡级联**（§3）：后端 `cascade` + `parts` + 用例 → 前端级联弹层（照 `ChartConfigPanel` X 轴浮层的形制）
   → 旧窗口 `RegressionWindow` 同步。
4. **盈亏平衡成本统一区**（§4）：纯前端，依赖第 3 步的 `parts`。
5. **一键算汇总表 + 维度精简**（§6）：按钮/互斥/表体/三个 pill/导出名。
6. **对比图表取消上限后的版式与导出口径**（§7 的剩余部分，含 29 张导出实测）。
7. 全量验证 + 出包（三步）+ `sidecar` 冒烟（`.build-tmp/smoke_sidecar.py`，可顺手加一条「29 张文件夹导出」）。
8. 更新 `HANDOVER_PLAN.md`：新增 §17（本轮）+ 新坑 77+；本文件末尾补「结论」段。

---

## 11. 新窗口提示词（直接复制）

```text
接手「算账工作台」桌面应用（React 18 + TS + Vite + Zustand + AG Grid + ECharts + Tauri 2 + Python FastAPI sidecar）。
工作目录：C:\Users\13774\Desktop\网管算账工作台\accounting-workbench

第一步先读，别急着动代码：
1. HANDOVER_NEXT_11.md  ← 本轮（第 11 轮）交接文档：6 条需求、根因坐标、建议实现、6 个待拍板问题、开工顺序
2. HANDOVER_PLAN.md 的 §0（命令）、§3（坑 1–45）、§9.4（46–50）、§11（56–57）、§13（62–64）、§14、§15（65–66）、§16（67–76）
3. AGENTS.md、src/AGENTS.md、backend/AGENTS.md、src-tauri/AGENTS.md

本轮任务（详见 HANDOVER_NEXT_11.md）：
A 盈亏平衡：①「目的所属省份 × 公斤段」合并成级联勾选（每省单独勾公斤段，标签顺序 网点·省份·公斤段）
  ②加「按省份统一写车线成本/操作成本」功能区 ③修「卡片数≠图表数」（RegressionPage L579 slice(0,8)、L858 slice(0,6)）
B 一键算：①新增「汇总」总表（三块合并 + 三个 pill），按钮顺序 汇总|货物流向|公斤段折扣|公斤段单价，「网点对比图表」最右
  ②取消「省份」维度（只留 网点/网点×省份） ③修「对比图表 29 组只出 6 组」（COMPARE_MAX_ROWS=6）
C 时间范围：导入后自动识别时间字段 min~max；所有时间选择处默认「自定义」并预填该范围（取消默认「本月」）

§9 的 6 个问题已由用户确认（见 §13 + §14，含第 2 条的最终口径），直接按 §10 的顺序做：
先修两个 slice 上限 bug → 时间范围 → 级联 → 成本统一区 → 汇总表/维度 → 对比图表版式与导出 → 全量验证 + 出包 + 文档。

硬约束：
- 安装包完全离线、仅 Windows；vitest / vite build / tauri build / cargo / PyInstaller / makensis / headless Edge
  必须用 danger-full-access 跑（沙箱下 spawn EPERM / mmap 失败 / 起不来）
- 源码 CRLF + UTF-8 无 BOM（新建文件要跑 .build-tmp/normalize_eol.py 归一化）；改 .nsi 用 UTF-8 with BOM
- 前端禁止 any；样式走 CSS Modules + variables 变量；Rust 侧不写业务逻辑；后端 routers 不写业务、compute 保持纯函数
- 方案类（数据模型/存储布局/页面结构）先问；权限类直接执行
- 每一步都跑：cd backend; & "E:\python3.9.6\python.exe" -m pytest tests -q  +  npx tsc --noEmit  +  npx vitest run
- 改完统一出一次包（backend/build.py → npx tauri build --no-bundle → makensis ×2），并更新 HANDOVER_PLAN.md（§17 + 新坑 77+）
- 第 10 轮已完成、别改坏：看板「导出文件夹」（io/board_exporter.py + utils/boardChartExport.ts）、
  全站千分位数字格式（utils/numberFormat.ts + chart/builder.py::format_tick）、series_colors/图例在画布下方
```

---

## 12. 关键文件坐标速查

| 主题 | 文件 | 关键行 |
|---|---|---|
| 盈亏平衡页（卡片/图表/筛选/导出） | `src/pages/RegressionPage.tsx` | L18 维度、L107 默认本月、**L579 卡片 slice(0,8)**、**L858 图表 slice(0,6)**、L499-560 维度弹层、L570-660 卡片 |
| 盈亏平衡样式 | `src/pages/RegressionPage.module.css` | L166-173 `.charts` 3 列网格、L32 左右分栏、L42/L51 `overflow:auto` |
| 盈亏平衡旧窗口 | `src/components/regression/RegressionWindow.tsx` | L193-260 两张图的 option、L210-211 slice(0,6)、L256-334 导出 |
| 组合展开（后端） | `backend/accounting_backend/compute/regression.py` | L138-155 `_combos`/`_label`、L169-282 `table_groups` |
| 盈亏平衡 schema | `backend/accounting_backend/schemas/regression.py` | L79-96 配置、L98-120 分组 |
| 盈亏平衡导出 | `backend/accounting_backend/io/regression_exporter.py` | 已遍历全部 groups（不用改，补断言） |
| 一键算页 | `src/pages/BoardPage.tsx` | L25-30 功能、L57-61 维度、**L73/L223 COMPARE_MAX_ROWS**、L896-1082 各块、L563-570 导出置灰、L1134 截断文案 |
| 一键算后端 | `backend/accounting_backend/schemas/board.py`、`compute/board.py` | L20 `BOARD_BANDS`、L21-23 `DIM_FIELD`/`BoardDim`、`build_board()` |
| 一键算导出 | `src/utils/boardChartExport.ts`、`backend/accounting_backend/io/board_exporter.py` | `planBoardChartExport()`、`export_board_chart_folder()` |
| 时间范围 | `src/stores/analysisStore.ts`、`src/utils/analysisRows.ts::presetRange`、`AnalysisWindow.tsx` L530/L1099 | L49/65/205/224/243/595/651 |
| 时间识别后端 | `backend/accounting_backend/routers/import_router.py`、`compute/time_dimension.py::parse_dates`、`schemas/dataset.py` | 新增 `/api/dataset/{id}/time-range` |
| 数字格式（已交付） | `src/utils/numberFormat.ts`、`chart/builder.py::format_tick`、`io/excel_exporter.py` | — |

---

## 13. 用户已确认的答复（2026-10-29，新窗口直接照做，不用再问 §9 的 1–5）

| # | 问题 | 用户答复 |
|---|---|---|
| 1 | 汇总表三块列 | **A**：每块 = 6 个公斤段数值列；「货物流向」块另带占比 → 1 + 12 + 6 + 6 = **25 列** |
| 2 | 取消省份维度 | 默认**网点 × 省份**；下拉只留 网点 / 网点×省份；**后端也不保留「省份单独成维度」**（注意别改崩老项目） |
| 3 | 成本统一区 | 统一区写入**覆盖该省全部卡片**；之后单卡仍可单独改（只影响那一张） |
| 4 | 对比图表合并视图 | **A**：合并图也画全部（29 组 = 29 条线）；导出随之变 1+N 张、单次 30–60 秒，用户接受 |
| 5 | 识别不出时间字段 | 预设仍「自定义」，**不预填**范围（保持 1970-01-01 ~ 2999-12-31） |
| 6 | 级联数据模型 | **待确认**（用户反问「是哪个界面」→ 见 §13.1，给答复后按 A 做） |

### 13.1 第 6 个问题问的是哪个界面（新窗口要能一句话解释）

指的是 **盈亏平衡与折扣分析页**（`src/pages/RegressionPage.tsx`，旧弹窗 `RegressionWindow.tsx` 同步）
左侧「分组筛选条件」里**本轮要新增的那个「目的所属省份 × 公斤段」级联控件**；
不是一键算页（`BoardPage`），也不是分析页的图表 X 轴浮层（那个 2026-10-28 就做好了）。

两个可选实现（推荐 A）：

- **A（推荐）**：`RegressionTableConfig` 增加
  `cascade: dict[str, dict[str, list[str]]]`（父维度字段 → 父值 → 子维度取值集合），
  前端只发「省份 → 该省勾选的公斤段」这张映射，**后端按映射展开组合**。
  理由：组合逻辑留在后端（AGENTS「配置驱动计算」），汇算表 / 单图 / 网格图 / PDF / xlsx 导出天然同一口径。
- **B**：前端把组合展开成显式列表（如 `combos: [{"目的所属省份": "安徽省", "公斤段": "0-60"}, …]`）发给后端，
  后端只按列表取数。能实现同样效果，但组合逻辑跑到前端、导出与接口要多处对齐，**不推荐**。

### 13.2 第 2 条答复的实现注意（「别改崩掉」的具体做法）

- 要删的是「**省份单独成维度**」这一模式：前端 `DIM_MODES` 去掉 `省份` 项、后端校验不再接受 `dims == ["省份"]`；
- **`dims=["网点","省份"]` 里的「省份」字段必须保留**——否则「网点 × 省份」这个维度本身就不存在了
  （`schemas/board.py` 的 `BoardDim = Literal["网点","省份"]` 不要整体删）；
- 老项目快照里可能是 `dims: ["省份"]`（第 10 轮及以前默认就是它）→ **读入时强制归一化成 `["网点","省份"]`**，
  后端 `BoardConfig` 也做同样兜底（把单独的 `["省份"]` 补成 `["网点","省份"]`），保证老项目打开不报错；
- 前端 `inputs.dims` 默认值从 `["省份"]` 改成 `["网点","省份"]`；`/api/board` 的 `dim_label` 会自然变成「网点 × 省份」。

### 13.3 追加验收点（把这 5 条答复各自的可验证结果写下来）

1. 汇总表：25 列（1 + 12 + 6 + 6），右上三个 pill = 累计货量 / 综合折扣 加权 / 综合单价 加权；
2. 分组维度下拉只剩 网点 / 网点×省份，默认网点×省份；**打开第 10 轮保存的老项目（dims=["省份"]）不报错**；
3. 统一区填 安徽省 车线成本 0.2 → 安徽省全部卡片的车线成本变 0.2；再把其中一张改 0.3 → 只有那张是 0.3；
4. 29 组数据：拆分视图 29 张图、合并视图 29 条线、导出文件夹 1+29 张；
5. 没有「账单时间」字段的数据集：分析/一键算/盈亏平衡都显示「自定义」+ 全量范围（1970-01-01 ~ 2999-12-31）。

---

## 14. 最终确认（2026-10-29，**覆盖 §13 的第 2、6 条**，新窗口以本节为准）

### 14.1 第 2 条最终口径：前端只留两项，**后端保留「省份」**

- **前端**：`DIM_MODES` 只留 `网点`、`网点 × 省份`；默认 `inputs.dims = ["网点", "省份"]`（即「网点 × 省份」）；
- **后端**：`schemas/board.py::BoardDim = Literal["网点","省份"]` **原样不动**，`build_board()` 不动，
  也不加「拒绝 `["省份"]`」的校验 —— 用户原话：*后端仍保留「省份」以兼容老项目快照*；
- **老项目快照**（`state.board.dims` 可能是 `["省份"]`）：前端读入时**保留原值不强制改**，
  后端照旧能算出「省份」分组（结果与第 10 轮一致，不会崩）；维度下拉按钮文案照常显示「省份」，
  但 radio 列表里只有两项、都未勾选 —— 用户点任一项即切到新维度（`dimValues` 清空，同现在的切维度逻辑）；
- **要删的只有**：前端下拉里的「省份」这一项。**不要**顺手删后端的省份能力，否则老项目打开就 400。

### 14.2 第 6 条最终口径：**按 A（后端 cascade）**

- `backend/accounting_backend/schemas/regression.py`：
  ```python
  class RegressionTableConfig(BaseModel):
      # ……原有字段不动……
      cascade: dict[str, dict[str, list[str]]] = Field(
          default_factory=dict,
          description="父维度字段 → 父值 → 子维度取值集合，如 {'目的所属省份': {'安徽省': ['0-60','60-150']}}",
      )
  ```
- `compute/regression.py::_combos()`：`cascade` 非空时按
  **省份（picks 里的顺序）→ 网点（picks 顺序）→ 该省勾选的公斤段（勾选顺序）** 展开；
  `cascade` 为空时保持现在的 `itertools.product`（老项目/老请求零影响）；
- `dims` 用 `["寄件所属一级网点", "目的所属省份", "公斤段"]`（标签 = 网点 · 省份 · 公斤段，与用户例子逐字一致）；
- `RegressionGroup` 增加 `parts: dict[str, str] = {}`（结构化组合），供「按省份统一写成本」分组用；
- 用例：一省多段 / 多省不同段 / 老 picks（无 cascade）三条，数值与顺序都要断言。

### 14.3 §13.3 验收点修订（替换原第 2 条）

2. 分组维度下拉只剩 网点 / 网点×省份，默认网点×省份；**打开第 10 轮保存的老项目（`dims=["省份"]`）不报错、
   仍按省份分组出结果**（后端保留该能力），用户点一下「网点 × 省份」才切换到新维度。

其余 1/3/4/5 条同 §13.3。

### 14.4 新窗口提示词里加这一句

```text
HANDOVER_NEXT_11.md §9 的 6 个问题用户已全部确认：1→A（25 列）、2→前端只留 网点/网点×省份、默认网点×省份、
后端保留「省份」只为兼容老快照（不要删后端能力）、3→统一区覆盖该省全部卡片且单卡可再改、4→合并图也画全部 29 条线、
5→识别不出时间字段则「自定义」但不预填、6→按 A（后端 cascade）。直接按 §10 顺序开工，不用再问。
```

---

## 15. 本轮结论（2026-10-29 晚，第 11 轮已全部落地）

> 详细落点、验证数据、新坑见 `HANDOVER_PLAN.md` §18。基线 204 / 0 / 163 → 本轮 **214 passed / tsc 0 错 / 173 passed**。

| 需求 | 状态 | 一句话结论 |
|---|---|---|
| A③ 卡片数 ≠ 图表数 | ✅ | 两个独立 `slice` 上限（卡片 8 / 图表 6）全删；靶场 10 组 → **10 张卡片 + 10 张图**；导出补「文件数 = 卡片数 + 3」断言 |
| B③ 对比图表只出 6 组 | ✅ | `COMPARE_MAX_ROWS` 删掉，29 组 → **29 张拆分图（3 列可下滑）+ 合并图 29 条线**；导出实测 **1+29 = 30 个文件、4.6 秒** |
| C 时间范围识别 | ✅ | 新接口 `GET /api/dataset/{id}/time-range`（数值列不当日期、识别不出返回 null）；三处时间选择默认「自定义」并预填，识别不出仍「自定义」但不预填 |
| A① 省份 × 公斤段级联 | ✅ | 后端 `cascade` + `parts`（按 A）；`/api/values` 加「父值 → 子值集合」，二级**只列该省真实有的公斤段**；标签 = 网点 · 省份 · 公斤段；老 `picks` 与老快照照旧能算 |
| A② 按省份统一写成本 | ✅ | 卡片标题下方按省一行；写入覆盖该省全部卡片，之后单卡改只影响那一张（统一区显示「多个值」） |
| B① 汇总总表 + 四按钮 | ✅ | 按钮 `汇总｜货物流向｜公斤段折扣｜公斤段单价`、对比图表最右；汇总表 **25 列**、右上三个 pill；xlsx/csv「当前」能导汇总（功能名 = 汇总） |
| B② 取消「省份」维度 | ✅ | 前端只留 网点 / 网点×省份（默认后者）；**后端 `BoardDim` / `build_board()` 一行没动**，老项目 `dims=["省份"]` 照常出结果、radio 都不勾 |

还没做的（可选，未开工单）：`HANDOVER_NEXT.md §5` 的 Win10 硬化 4 个补丁；分析页 `<html zoom>` 下的
`ChartPreview.zoomCanvasWidth()` 仍用 `window.innerWidth` 估画布宽（只影响字号估计，不影响位移）。

