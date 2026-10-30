# 交接文档 · 第 10 轮（2026-10-29）：一键算图表导出改成「文件夹」+ Win7/Win10 兼容性

> 这份是给**新窗口**用的：把本文件 + `HANDOVER_PLAN.md`（第 0 节命令、第 3 节坑清单、第 15 节最近一轮）读完再动手。
> ~~本轮**没有改动任何代码**，只产出这份文档。~~ **→ 主任务已在本轮落地，见文末 §11。**

---

## 0. 一句话任务

**主任务**：一键算的「导出 PDF（当前）/ 导出 JPEG（当前）」改成**导出一个文件夹**（1 张合并大图 + N 张拆分小图），
顺便修掉「导出图和预览不一致、版面乱」的问题。

**次任务**（等用户拍板）：Win10 兼容性硬化 4 个补丁（Win7 已确认不可支持，见 §5）。

---

## 1. 环境与命令（照抄，别自己改）

```powershell
# 仓库根
C:\Users\13774\Desktop\网管算账工作台\accounting-workbench

# 后端测试（Python 用 E:\python3.9.6\python.exe，不是 bundled DSH python）
cd backend; & "E:\python3.9.6\python.exe" -m pytest tests -q

# 真实数据全链路
cd backend; & "E:\python3.9.6\python.exe" scripts\e2e_real_data.py

# 前端（TEMP 必须指到工作目录里的 .build-tmp，否则 esbuild / makensis 会失败）
$env:TEMP="$PWD\.build-tmp"; $env:TMP="$PWD\.build-tmp"
$env:Path="C:\Users\13774\.nodejs\node-v24.21.0-win-x64;$env:Path"
npx tsc --noEmit
npx vitest run
```

**打包三步（缺一不可，后端改了必做第一步）**：

```powershell
& "E:\python3.9.6\python.exe" backend\build.py
npx tauri build --no-bundle
$env:TEMP="$PWD\.build-tmp\mknsis"; $env:TMP="$env:TEMP"
& "$PWD\.build-tmp\nsis\nsis-3.11\makensis.exe" /V2 installer\windows\workbench.nsi
& "$PWD\.build-tmp\nsis\nsis-3.11\makensis.exe" /DNOWEBVIEW2 /V2 installer\windows\workbench.nsi
```

**权限**：`npx vitest` / `npx vite build` / `npx tauri build` / `cargo` / PyInstaller / `makensis` / headless Edge
在沙箱里都会 `spawn EPERM`、mmap 失败或起不来 → **必须 danger-full-access**。

**源码格式**：CRLF + UTF-8 无 BOM；改 `.nsi` 要 UTF-8 with BOM；用 Python 做替换时注意 CRLF（坑 10）。
（`edit` 工具会把整份文件改成 LF，改完务必转回 CRLF，见 `HANDOVER_PLAN.md` §3 坑 10。）

---

## 2. 现状速查（别重复劳动）

| 已交付 | 位置 |
|---|---|
| 一键算看板（四区块 / 对比图表 / 拆分开关 / 四型图） | `src/pages/BoardPage.tsx`（1260 行） |
| 导出菜单：xlsx/csv/pdf/jpeg ×「当前/全部」 | `BoardPage.tsx::handleExport`（约 L445-545） |
| 导出文件名工具（`功能 · 网点 · 维度 · 指标` + `_时间`） | `src/utils/exportName.ts`（有 6 条单测） |
| 单图渲染到指定路径 | `src/api/chart.ts::renderChartToPath(result, chart, format, path)` |
| 后端图表渲染（matplotlib） | `backend/accounting_backend/chart/builder.py` |
| **文件夹导出的现成范例**（盈亏平衡：PDF+网格+单图+XLSX） | `backend/accounting_backend/io/regression_exporter.py` + `routers/regression_export_router.py` |
| 导出记录（文件/文件夹两种 kind，支持「打开文件夹」） | `src/stores/exportStore.ts`、`src/pages/ExportManagerPage.tsx`、后端 `export_records` 表 |
| 选目录 | `src/utils/platform.ts::pickDirectory()`（Tauri `open({directory:true})`） |
| 打开文件夹 | `invokeCommand("open_folder", {path})`（Rust `commands.rs`） |

上一轮（第 9 轮）验证基线：`pytest 186 passed` / `tsc 0 错` / `vitest 140 passed` / `e2e EXIT=0`。
产物：`dist-installer\算账工作台-0.1.0-win-x64-setup.exe`（300.2 MB，11:32:29）、`...-lite-setup.exe`（95.4 MB，11:34:26）。

---

## 3. 主任务：一键算图表导出改成文件夹

### 3.1 用户原话（需求）

> 一键算界面导出的图表和预览不一致而且导出的版面很乱（图1）。
> 设置一个导出的逻辑：**仅限在网点对比图表计算功能下**使用「导出 PDF（当前）」「导出 JPEG（当前）」，
> 选择这两个导出格式时，**导出一个文件夹**，文件夹包含：
> 1. **合并成一张的大图**，命名 `[当前所选功能 · 当前所选网点 · 当前所选分组维度 · 指标_YYYY-MM-DD HH：MM]`，
>    例：`网点对比图表 · 上饶德兴 · 网点 × 省份 · 公斤段折扣_2026-10-28 11：07`；
> 2. **分组拆分的小图 N 个**，命名 `[当前所选功能 · 当前所选网点 · 当前所选拆分出的相应分组维度 · 指标_YYYY-MM-DD HH：MM]`，
>    例：`网点对比图表 · 上饶德兴 · 上海市 · 公斤段折扣_2026-10-28 11：07`。

### 3.2 为什么现在「不一致 + 版面乱」（5 个独立原因，都已定位）

对照 `BoardPage.tsx::handleExport` 的图表分支（约 L496-541）与同文件 `axisOption()`（约 L287-323，即预览用的 ECharts 配置）：

| # | 现象（图1 里能直接看到） | 根因 | 修法 |
|---|---|---|---|
| 1 | **X 轴公斤段顺序乱**：`0-60, 150-300, 300-500, 500-800, 60-150, 800+`，折线因此来回穿插 | 导出传了 `sort_by: "x"`，后端 `prepare_chart_data()` 对分类做**字符串排序**；预览用的是 `board.bands` 的原顺序 | 导出改 `sort_by: "custom"`（后端已支持：custom = 保持行序，见 `builder.py::prepare_chart_data`） |
| 2 | **颜色和预览不一样**（导出是灰蓝/橙 Tableau 色，预览是品牌蓝/绿/橙） | 预览用 `BoardPage` 自己的 `PALETTE = ["#0071e3","#34c759","#ff9500","#af52de","#ff3b30","#5ac8fa"]`；导出只能选后端 `CHART_PALETTES["default"]`（`#4e79a7…`） | `schemas/chart.py::ChartConfig` 增加可选 `series_colors: list[str] = []`；`_render_to_figure()` 非空时按它上色；前端 BoardPage 把 PALETTE 按顺序传进去 |
| 3 | **图例压在数据上**（图1 图例正好盖住中间几条线） | 后端 `_render_to_figure()` 用 `ax.legend()` 默认 `loc="best"`；预览的图例是画布下方的 HTML 图例 | 图例移出图外：`bbox_to_anchor=(0.5, -0.14)`、`loc="upper center"`、`ncol=min(3, len(series))`、`frameon=False`，并留出底部边距 |
| 4 | Y 轴数值格式不同（预览绝对量用「万」缩写，导出是原始数字） | 预览 `cmpShort()`；matplotlib 直接用数值 | 可选：`AXIS_*` 加一个 1 万以上缩写的 formatter（**优先级低**，先保证 1–3 修好） |
| 5 | 「拆分视图」在导出里完全没了 | 预览 `split=true` 时是「每个分组一行一张图」；导出永远只有合并的一张 | 新逻辑：**一次导出 = 1 张合并 + N 张拆分**（见 §3.3） |

另外：`chartType === "pie"` 现在被拦（提示「请改用 SVG 截图」），`scatter` 被悄悄映射成 `line`。新逻辑要明确这两种怎么处理。

### 3.3 目标产物与命名（推荐规格）

设：`spans` = 本次大图里的系列集合 = `picked`（最多 6 个分组行）× `activeMetrics`（勾选的对比指标），
`bands` = `board.bands`（公斤段的自然顺序，**必须原序**）。

```
<用户选的父目录>\
  <文件夹名>\
    网点对比图表 · 上饶德兴 · 网点 × 省份 · 公斤段折扣_2026-10-28 11：07.jpg      ← 合并大图（1 张）
    网点对比图表 · 上饶德兴 · 上海市 · 公斤段折扣_2026-10-28 11：07.jpg          ← 拆分小图（N 张）
    网点对比图表 · 上饶德兴 · 浙江省 · 公斤段折扣_2026-10-28 11：07.jpg
    ...
```

规则：

0. **取证锚点**（省得新窗口再翻代码）：
   - 公斤段自然顺序 = `backend/accounting_backend/schemas/board.py:20`
     `BOARD_BANDS = ["0-60", "60-150", "150-300", "300-500", "500-800", "800+"]`（预览就是这个顺序）
   - 分组行标签 = `backend/accounting_backend/compute/board.py:86`
     `label = " · ".join(values)` → `dims=["网点","省份"]` 时 `"上饶德兴 · 上海市"`
   - 系列名 = `BoardPage.tsx::seriesFor()` → `` `${row.label} · ${metric.label}` ``（图1 的图例就是这个，与预览一致）
   - `picked` 的顺序 = 按货量降序（`ordered.slice(0, 6)`），不是标签字典序；拆分小图的**文件顺序**沿用 `picked` 即可
1. **同一个批次共用同一个时间戳**（`YYYY-MM-DD HH：MM`，**全角冒号**；Windows 不允许半角冒号，坑 4）。
2. **大图名**：`功能 · 当前所选网点 · 分组维度 · 指标_时间`（= 现有 `boardExportBaseName()` 的输出，**直接复用**）。
3. **小图名**：`功能 · 当前所选网点 · 拆分出的分组维度取值 · 指标_时间`。
   - 「拆分出的取值」的取法（推荐、且与用户例子逐字一致）：取该分组行的 `row.label` 的最后一段。
     - `dims = ["网点","省份"]` 时 `row.label = "上饶德兴 · 上海市"` → 小图第三段 = `上海市` ✅ 对上例子
     - `dims = ["省份"]` 时 `row.label = "上海市"` → 第三段 = `上海市`
     - `dims = ["网点"]` 时 `row.label = "上饶德兴"` → 第三段 = `上饶德兴`（第二段会重复，可接受）
4. **N 张 = `picked` 的行数**（当前最多 6）；每张小图里画**该行自己的**系列（`seriesFor(entry)`），不掺别的行。
5. **文件夹名**（用户没规定，建议）：与「大图名」去掉扩展名完全一致，即
   `网点对比图表 · 上饶德兴 · 网点 × 省份 · 公斤段折扣_2026-10-28 11：07`；
   同一分钟内重复导出 → 追加 `（2）`、`（3）`（后端判重）。
6. 文件名里的非法字符（`\ / : * ? " < > |`）统一换成 `·`（前端 `safeFileName()` 已有；后端 `safe_name()` 再兜底一次）。
7. **多个对比指标勾选时**：沿用现有语义——每个「分组行 × 指标」一条线，所以大图线数 = 行数 × 指标数；
   拆分小图仍是「每行一张」，图里画该行的全部指标线。**（若用户想要「每个指标一张图」，见 §7 待确认 4）**

### 3.4 接口与实现方案（推荐这么拆）

**后端（新增，照 `regression_export_router.py` 的形制抄）**

1. `backend/accounting_backend/schemas/chart.py`
   - `ChartConfig` 增加 `series_colors: list[str] = Field(default_factory=list)`（可选；非空时按顺序上色）。
2. `backend/accounting_backend/chart/builder.py`
   - `_render_to_figure()`：读 `chart.series_colors`（非空优先，其次 `CHART_PALETTES[chart.palette]`）；
   - 图例移到图外下方（见 §3.2 第 3 条）；底部留白用 `fig.subplots_adjust(bottom=…)` 或 `bbox_inches="tight"` + `pad_inches`；
   - 顺手把 `prepare_chart_data` 的 `sort_by == "custom"` 行为在 docstring 里写清楚（custom = 不排序）。
3. `backend/accounting_backend/io/board_exporter.py`（新文件，纯写盘）
   ```python
   def export_board_chart_folder(
       merged: ChartJob,           # {result: ComputeResult, chart: ChartConfig}
       splits: list[ChartJob],     # 每个分组行一张
       out_dir: Path,
       stamp: str,                 # "2026-10-28 11：07"
       folder_base: str,           # "网点对比图表 · 上饶德兴 · 网点 × 省份 · 公斤段折扣"
       file_names: list[str],      # 前端已拼好的大图 + N 张小图文件名（不含扩展名）
       fmt: str,                   # "pdf" | "jpeg"
   ) -> dict:                      # {"folder": str, "files": [str, ...]}
   ```
   - 建目录：`out_dir / safe_name(folder_base + "_" + stamp)`，重名加 `（2）`；
   - 逐张调 `render_chart_pdf()` / `render_chart_jpeg()` 写盘（**不要**自己起 matplotlib figure，复用 builder）；
   - 任何一张失败 → 抛 `AccountingError("EXPORT_FAILED", …)`（已有错误码约定），**不要留半个文件夹**（先写临时目录再 `os.replace`，或失败时 `shutil.rmtree`）。
4. `backend/accounting_backend/routers/board_export_router.py`（新文件）
   ```python
   class BoardChartJob(BaseModel):
       result: ComputeResult
       chart: ChartConfig

   class BoardChartFolderRequest(BaseModel):
       merged: BoardChartJob
       splits: list[BoardChartJob]
       out_dir: str
       stamp: str          # 已带全角冒号
       folder_base: str
       file_names: list[str]
       format: str = "jpeg"

   class ExportResponse(BaseModel):
       folder: str
       files: list[str]

   @router.post("/board/export/chart-folder", response_model=ExportResponse)
   ```
   - 注册到 `main.py`（照现有 router 的注册方式）。
   - 注意 `AGENTS.md` 第 14 章第 15 条「禁止修改本文件未定义的 API 路径」——新路径属于新增功能，
     需要在 `HANDOVER_PLAN.md` 里登记（本轮文档已写，实现时补一行到 AGENTS 的接口表可读性更好）。

**前端**

1. `src/pages/BoardPage.tsx`
   - 导出菜单：`pdf`/`jpeg` 两项在 `!features.has("compare")` 时 `disabled` + `title="先勾选「网点对比图表」"`；
   - `handleExport("pdf"|"jpeg", "current")`：
     ```ts
     const dir = await pickDirectory();            // 取消 = null
     const stamp = stampMinute();                  // utils/exportName.ts
     const merged = buildBoardChartJob(picked, "all");          // 见下
     const splits = picked.map((entry) => buildBoardChartJob([entry], labelTailOf(entry.row.label)));
     const resp = await exportBoardChartFolder({ merged, splits, outDir: dir, stamp, ... });
     await useExportStore.getState().record({ path: resp.folder, kind: "folder", name: 文件夹名 });
     setExportHint(`已导出 ${resp.files.length} 个文件：${resp.folder}`);
     ```
   - **把组装逻辑抽成纯函数**（放 `src/utils/boardChartExport.ts`，方便单测）：
     - `buildBoardChartJob(entries, metrics, chartType): {result, chart}`：
       - `result.columns = ["公斤段", ...series.map(s => s.name)]`；
       - `result.rows` 按 `board.bands` **原序**；
       - `chart.sort_by = "custom"`（关键：别让后端重排）；
       - `chart.series_colors = PALETTE 前 N 色`（与预览一致）；
       - `chart.y_axis = hasAbsolute ? "结算重量（kg）" : "比率 / 单价"`（这个「标题当 y_axis」的写法后端已放行，见 `_validate` 的多系列分支）；
       - `chart.title = "网点对比图表"`。
     - `labelTailOf(rowLabel)`：`rowLabel.split(" · ").pop()`。
2. `src/api/board.ts`（新）或直接放 `src/api/chart.ts`：`exportBoardChartFolder(payload)` → `POST /api/board/export/chart-folder`。
3. `src/utils/exportName.ts`：补一个 `boardSplitBaseName({ feature, net, splitValue, metric })`（复用现有 `safeFileName`），单测补 2 条（对上用户给的两个例子）。
4. 菜单文案不用改（仍是「导出 PDF（当前）」「导出 JPEG（当前）」）。

### 3.5 边界与错误处理（必须覆盖）

- 只勾了「网点对比图表」→ 可导出；勾了别的功能（货物流向等）但没勾对比图表 → PDF/JPEG 置灰。
- `picked` 为空（没有数据）→ 提示「还没有可导出的分组」。
- `chartType === "pie"`：**建议继续禁用**并提示「对比图表的饼图暂不支持导出，请切成折线/柱状」；
  `scatter`：**建议同样禁用**（不再悄悄当折线导出）。
- 父目录不可写 / 磁盘满 → `EXPORT_WRITE_FAILED` 要变成中文提示（沿用 `export_service` 的处理）。
- 同一分钟重复导出 → 文件夹名加 `（2）`。
- 度量/指标名里有 `/`、`：` 等字符 → `safe_name` 兜底。
- 导出 6 张 × 300 DPI 可能 5–15 秒 → 导出期间按钮 loading（现有 `exportHint` 用法即可，不要新造组件）。

### 3.6 验收清单

1. 勾「网点对比图表」→ 导出 JPEG（当前）→ 选一个目录 → 生成**一个文件夹**，里面有 **1 + N** 个 `.jpg`；
   - 大图名 = `网点对比图表 · 上饶德兴 · 网点 × 省份 · 公斤段折扣_2026-10-29 11：38.jpg`
   - 小图名 = `网点对比图表 · 上饶德兴 · 上海市 · 公斤段折扣_2026-10-29 11：38.jpg`（每个分组一个）
2. **大图与预览一致**：X 轴公斤段是 `0-60, 60-150, 150-300, 300-500, 500-800, 800+` 自然序；
   线色与预览同一套；图例在图下方、不压数据。
3. PDF 同样验证一遍（矢量、中文可提取，`pypdf` 能读到标题）。
4. 「导出 xlsx（当前）/ CSV（当前）」保持现名规则不变（`boardExportBaseName()`）。
5. 「导出 xlsx（全部）/ CSV（全部）」不受影响。
6. 导出记录页能看到这条**文件夹**记录并能「打开路径」。
7. `pytest / tsc / vitest / e2e` 全绿，重新出包。

---

## 4. 后端改动要点（避免踩坑）

- 图表渲染只走 `chart/builder.py` 的 `render_chart_pdf/render_chart_jpeg`（不要再写一套 figure）。
- `Custom` 排序语义：`prepare_chart_data()` 里 `sort_by == "custom"` 时**不动行序**；`applyChartDisplay` 早就在用这条，别改坏。
- 多系列时 `y_axis` 允许是「人话标题」而不是列名（第 9 轮刚放开，见 `_validate()`），**不要收紧**。
- 导出文件夹的命名/去重参考 `io/regression_exporter.py::safe_name / folder_name`（全角冒号已在里面处理过）。
- 单张图失败要整批回滚，别留半个文件夹。

---

## 5. 次任务：Win7 / Win10 兼容性（第 9 轮已取证，结论如下）

本机取证（`rustc 1.99.0`、`WebView2 156.0.4314.50`、屏幕 2560×1600@150%）：

| 系统 | 结论 | 硬证据 |
|---|---|---|
| **Windows 7 / 8 / 8.1** | ❌ 不可支持 | ①`accounting-workbench.exe` 静态导入 `api-ms-win-core-synch-l1-2-0.dll`（`WaitOnAddress`/`WakeByAddress*`）与 `api-ms-win-core-winrt-error-l1-1-0.dll`（`RoOriginateErrorW`）= **Win8+**；②`_internal\python39.dll` 导入 `api-ms-win-core-path-l1-1-0.dll` + `PathCchCanonicalizeEx` = **Win8+**；③WebView2 **Runtime 109 是最后支持 Win7 的版本**，且 SDK ≥1.0.1519 不再支持 Win7，Tauri 2 用的远新于此 |
| **Windows 10**（1709+，含 2015/2016/2019/2021 LTSC） | ✅ 可用（有条件） | Rust 1.78+ 官方最低 Win10；WebView2 支持矩阵覆盖 Win10；安装包自带 205MB 离线 WebView2 |
| **Windows 11** | ✅ 已真机验证 | 当前开发/验收机 = Win11 25H2（注册表 ProductName 仍写 “Windows 10”，别被骗） |

**若要支持 Win7 的方案对比（都不推荐，供用户决策）**

| 方案 | 成本 | 说明 |
|---|---|---|
| A 放弃 Win7 + 安装包加版本检查（**推荐**） | 0.5 天 | 低于 Win10 直接中文提示并退出，别让用户装完打不开 |
| B 老工具链单独出一版：`x86_64-win7-windows-msvc` target + Tauri **1.x** + WebView2 **固定版 109** + Python **3.8** + 老 numpy/pandas | 2–3 周 + 长期维护两套 | 等于把整套依赖降级并锁死，无安全更新 |
| C 换壳 Electron ≤22 | 2–3 周 | 前端 IPC 全改 + 后端还是要 Python 3.8 |
| D Web 版（Win7 用 Chrome/Edge 109 访问本机 sidecar） | ~1 周 | sidecar 仍要 Python 3.8；文件对话框/打开文件夹要退化 |
| E 让 Win7 用户跑 Win10 虚拟机 / 远程桌面 | 0 | 现状即可用 |

**Win10 硬化 4 个补丁（等用户点头再做）**

1. `installer/windows/workbench.nsi`：加 `WinVer.nsh`，`${IfNot} ${AtLeastWin10}` → 中文提示 + `Abort`（**但**先确认要不要拦 1507/1607 LTSB）。
2. `workbench.nsi` 第 124 行 `ExecWait` 的返回值没检查 → WebView2 装失败也提示「完成」；改成失败弹提示 + 官网链接。
3. `src-tauri/src/main.rs`：`.expect("error while running tauri application")` 在 release（无控制台）下等于「双击没反应」；
   建议启动前查 `HKLM/HKCU …\EdgeUpdate\Clients\{F3017226-…}` 的 `pv`，缺失时弹原生消息框（用 `tauri_plugin_dialog`）。
4. `src-tauri/tauri.conf.json`：`minWidth: 1024 / minHeight: 680` 在 1366×768@125%（可用 1092×574）放不下 →
   建议降到 `900×560`，并在窗口放不下时提示用「设置 → 字号 小」（`html zoom` 0.9）。

---

## 6. 硬约束（违反会被打回）

- 先读 `AGENTS.md`（根）、`src/AGENTS.md`、`backend/AGENTS.md`、`src-tauri/AGENTS.md`；
  **前端禁止 `any`**；样式走 CSS Modules + `variables.css` 变量（禁止硬编码颜色）；Rust 侧不写业务逻辑。
- 源码 CRLF + UTF-8 无 BOM；`.nsi` 改动用 UTF-8 with BOM。
- 分层：`api/` 只做 HTTP；`stores/` 不放 fetch；`components/`/`pages/` 不直接调 api（走 store 或 api 层既有的用法）；
  后端 `compute/` 纯函数、`io/` 只做格式转换、`routers/` 不写业务。
- 任何「导出与预览不一致」的修复，都要在**预览与导出两侧同时验证**（本轮 5 个原因里 1/2/3 是后端、4 是可选、5 是新逻辑）。
- 每轮改完：跑全量验证 → 出一次包 → 在 `HANDOVER_PLAN.md` 新增一节（§16）并继续编号新坑（当前到 **66**）。
- 方案类改动（数据模型 / 存储布局 / 页面结构）先问用户；权限类操作直接执行。

---

## 7. 开工前请用户拍板的 5 个问题（建议一次问完）

1. **拆分维度**：小图按「分组行」拆（`dims=["网点","省份"]` 时 = 每个「网点·省份」一张，只选 1 个网点时就是每个省份一张）
   ——对吗？还是想按别的维度拆（比如固定按省份，但一张图里放多网点多条线）？
2. **小图里放几条线**：只放该分组行自己的指标线（推荐，和你给的例子吻合）？还是放该拆分值下的所有网点？
3. **文件夹名**：用大图名去掉扩展名（`网点对比图表 · 上饶德兴 · 网点 × 省份 · 公斤段折扣_2026-10-28 11：07`）可以吗？
   同一分钟重复导出加 `（2）`？
4. **多指标**：勾了 2 个对比指标时，大图 = 每行 2 条线（共 12 条）；小图 = 仍是每行一张、图里 2 条线。要这样吗？
   还是「每个指标各一套图」（大图 ×1 + 小图 ×N ×指标数）？
5. **饼图/散点**：这两个图表类型目前导出会被拦/降级。新逻辑里继续禁用（推荐），还是要支持？

---

## 8. 建议的开工顺序

1. 量一遍现状（`BoardPage` 导出一次 JPEG，确认 §3.2 的 5 条原因，避免误改）
2. 后端：`series_colors` + 图例移出图外 + `custom` 排序验证（用 `.build-tmp/smoke_sidecar.py` 起打包 sidecar 直接打接口最快）
3. 后端：`io/board_exporter.py` + `routers/board_export_router.py` + `pytest tests/test_board_export.py`
4. 前端：`utils/boardChartExport.ts`（纯函数 + 单测）→ `BoardPage` 接上 → 菜单置灰逻辑
5. `pytest / tsc / vitest / e2e` → `backend/build.py` → `npx tauri build --no-bundle` → `makensis ×2`
6. 更新 `HANDOVER_PLAN.md` §16 + 新坑 67+；把本文件里的「待确认」补成结论

---

## 9. 新窗口提示词（直接复制到新会话）

```text
接手「算账工作台」桌面应用（React 18 + TS + Vite + Zustand + AG Grid + ECharts + Tauri 2 + Python FastAPI sidecar）。
工作目录：C:\Users\13774\Desktop\网管算账工作台\accounting-workbench

第一步先读，别急着动代码：
1. HANDOVER_NEXT.md  ← 本轮交接文档（第 10 轮），任务、根因、规格、验收全在里面
2. HANDOVER_PLAN.md 的 §0（命令）、§3（坑 1–45）、§9.4（坑 46–50）、§11（坑 56–57）、§13（坑 62–64）、§14、§15（坑 65–66）
3. AGENTS.md、src/AGENTS.md、backend/AGENTS.md、src-tauri/AGENTS.md

本轮任务：
A（主）一键算的「导出 PDF（当前）/ 导出 JPEG（当前）」改成导出一个文件夹：
   1 张合并大图 + N 张按分组拆的拆分小图，文件名规则见 HANDOVER_NEXT.md §3.3；
   同时修掉导出与预览不一致的 5 个原因（§3.2）。
B（次）Win10 兼容性硬化 4 个补丁（HANDOVER_NEXT.md §5），等用户点头再做。

开工前必须问用户 HANDOVER_NEXT.md §7 的 5 个问题（一条消息问完），然后按 §8 的顺序做。

硬约束：
- 安装包完全离线、仅 Windows；vitest / vite build / tauri build / cargo / PyInstaller / makensis / headless Edge
  必须用 danger-full-access 跑（沙箱下 spawn EPERM / mmap 失败 / 起不来）
- 源码 CRLF + UTF-8 无 BOM（edit 工具会把文件改成 LF，改完转回 CRLF）；改 .nsi 用 UTF-8 with BOM
- 前端禁止 any；样式走 CSS Modules + 变量；Rust 侧不写业务逻辑
- 方案类（数据模型/存储布局/页面结构）先问；权限类直接执行
- 每步都跑：cd backend; & "E:\python3.9.6\python.exe" -m pytest tests -q  +  npx tsc --noEmit  +  npx vitest run
- 改完统一出一次包（backend/build.py → npx tauri build --no-bundle → makensis ×2），并更新 HANDOVER_PLAN.md（§16 + 新坑 67+）
```

---

## 10. 附录：本轮取证命令（想复现直接跑）

```powershell
# 二进制最低系统 / 导入表（Win8+ API 检测）
& "E:\python3.9.6\python.exe" .build-tmp\compat_probe.py

# 本机 WebView2 版本 / 屏幕逻辑分辨率
Get-ItemProperty 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}' -Name pv
Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::AllScreens
(Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion').CurrentBuild   # 26200 = Win11 25H2
```

外部依据（引用时带上）：
- Rust 1.78 起 `*-pc-windows-msvc` 最低 Windows 10：https://blog.rust-lang.org/2024/02/26/Windows-7/
- Edge/WebView2 109 是最后支持 Win7/8.1 的版本：https://blogs.windows.com/msedgedev/2022/12/09/microsoft-edge-and-webview2-ending-support-for-windows-7-and-windows-8-8-1/
- Edge/WebView2 支持的系统列表（Win10 SAC 1709+ / LTSC 2015/2016/2019/2021 / Win11）：https://learn.microsoft.com/en-us/deployedge/microsoft-edge-supported-operating-systems
- WebView2 分发（离线 Standalone Installer / 注册表检测）：https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution

---

## 11. 本轮结论（2026-10-29 第十轮，主任务已落地）

### 11.1 §7 的 5 个问题 → 用户答复（全选推荐项）

| # | 问题 | 结论 |
|---|---|---|
| 1 | 拆分维度 | **按分组行拆**（每个「网点·省份」一张） |
| 2 | 小图里几条线 | **只放该分组行自己的指标线** |
| 3 | 文件夹名 | **用大图名去掉扩展名**；同一分钟重复导出追加 `（2）` |
| 4 | 多指标 | 大图 = 每行多线；**小图仍每行一张**、图里画该行全部指标线 |
| 5 | 饼图/散点 | **继续禁用**，提示切成折线/柱状 |
| — | 次任务 B（§5 的 Win10 4 个补丁） | **本轮不做**，A 验收通过后再单独开一轮 |

### 11.2 已交付（细节与坑见 `HANDOVER_PLAN.md` §16）

- 新接口 `POST /api/board/export/chart-folder`（已登记 `AGENTS.md` §8.3）：一次写 1 张合并大图 + N 张拆分小图，
  文件夹 = 大图名 + `_YYYY-MM-DD HH：MM`，重名 `（2）`，整批原子（暂存目录 + `os.replace`，失败不留半个文件夹）。
- 后端：`ChartConfig.series_colors`、图例移到画布内下方（`fig.legend` + `subplots_adjust`）、
  `_series_fields()` 统一「多系列」判据（1 个 `show_fields` + 轴标题也能导）。
- 前端：`utils/boardChartExport.ts`（`BOARD_PALETTE` 唯一来源 + `planBoardChartExport`）、
  `utils/exportName.ts::boardSplitBaseName`、`api/board.ts`；看板菜单 PDF/JPEG 仅在「网点对比图表 + 折线/柱状」可用。
- §3.2 的 5 个原因：**5 条全部落地**。第 4 条（Y 轴数字）按用户追加要求改成了千分位而不是「万」，见 §11.4。

### 11.3 验证基线（第十轮）

`pytest 204 passed` / `tsc 0 错` / `vitest 163 passed` / `e2e EXIT=0` / 打包后 sidecar 冒烟 PASS（含新接口）。

### 11.4 数值格式（2026-10-29 追加要求，已交付）

> 用户原话：不要把绝对量写成万，软件所有千以上的数值写成 1,000 的形式，如 10000 写成 10,000。

- 统一入口 `src/utils/numberFormat.ts`：`formatNumber`（千分位，默认 6 位小数）/ `formatCount`（计数不带小数）/
  `formatChartValue`（数字、数字字符串、散点 `[x,y]` 都吃，非数字原样返回）。
- 覆盖：一键算（刻度 / tooltip / 饼图 tooltip，原 `cmpShort()` 的「1.0万」已删除）、分析页图表（轴 / tooltip / 饼图）、
  盈亏平衡（两套图 + 旧窗口）、表格显示层（AG Grid `valueFormatter`，编辑仍拿原始数字）、
  导出图（matplotlib 数值轴）、导出 xlsx/xls（`#,##0.####` 数字格式 + 按显示宽度算列宽）。
- 后端同一套规则：`chart/builder.py::format_tick`（千以上 `f"{v:,.0f}"`，千以下 `g`），分类轴不装（坑 74）。
- 验收：`pytest 204` / `vitest 163` / `e2e EXIT=0`；留档图 `.build-tmp/number-format-proof/数值格式冒烟.jpg`
  （Y 轴 `10,000 / 12,500 / 15,000 …`，全图无「万」）。
- 产物（覆盖 §11.3 的旧包）：`setup.exe` 300.2 MB（18:49:06）、`lite-setup.exe` 95.4 MB（18:51:16）、
  exe 9,941,504 B（18:43:03）、sidecar 16,289,650 B（18:40:49）。
