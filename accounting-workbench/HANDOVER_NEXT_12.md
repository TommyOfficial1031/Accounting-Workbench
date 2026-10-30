# 交接文档 · 第 12 轮（2026-10-29 深夜）：只剩「Win10 硬化 4 个补丁」+ 1 个小尾巴

> 第 11 轮（盈亏平衡级联 / 成本统一区 / 卡片=图表 / 一键算汇总表 / 维度精简 / 时间范围识别）已全部交付并出包，
> 验证基线 **pytest 214 / tsc 0 错 / vitest 173 / e2e EXIT=0 / 打包 sidecar 冒烟 PASS**，
> 细节见 `HANDOVER_PLAN.md` §18（含新坑 77–88）。**本文件只装第 11 轮明确留下的「未做」两件事**，
> 不要在这轮顺手改业务逻辑。

---

## 0. 一句话任务

1. **（主）Win10 兼容性硬化 4 个补丁**：安装包版本拦截、WebView2 装失败要能看见、Rust 启动失败不要「双击没反应」、最小窗口尺寸降到小屏能放得下。
2. **（次）一个小尾巴**：`ChartPreview` 放大弹层的画布宽度还在用 `window.innerWidth` 估（`html { zoom }` 下不准），换成本项目已有的视口探针。

两件事都不碰数据结构、不碰页面结构、不碰任何业务口径。

---

## 1. 现状速查（第 11 轮已交付，别改坏）

| 已交付 | 位置 | 回归用例 |
|---|---|---|
| 盈亏平衡「省份 × 公斤段」级联（后端 `cascade` + `parts`，标签 网点·省份·公斤段） | `compute/regression.py`、`schemas/regression.py`、`RegressionPage.tsx`、`utils/regressionGroups.ts` | `test_compute_regression.py::TestCascadeCombos`、`regressionGroups.test.ts` |
| 按省份统一写车线/操作成本（覆盖该省全部卡片，单卡仍可改） | `RegressionPage.tsx`（`.unify` 区） | 同上 |
| 卡片数 = 图表数（删 `slice(0,8)` / `slice(0,6)`，导出断言 文件数 = 卡片数 + 3） | `RegressionPage.tsx`、`io/regression_exporter.py` | `test_regression_exporter.py::test_every_card_gets_its_own_chart` |
| 一键算「汇总」25 列 + 三个 pill + 四按钮顺序（对比图表最右）+ 维度只留 网点/网点×省份（后端仍认「省份」） | `BoardPage.tsx/.module.css` | 静态靶场（见 §1.1） |
| 对比图表 29 组 → 29 张（3 列可下滑）+ 合并图 29 条线 + 导出 1+N | `BoardPage.tsx`、`utils/boardChartExport.ts`、`io/board_exporter.py` | `boardChartExport.test.ts`（29 组用例） |
| 时间范围自动识别（`GET /api/dataset/{id}/time-range`）+ 三处默认「自定义」并预填 | `compute/time_dimension.py`、`analysisStore.ts`、三个页面 | `test_api_time_range.py` |

### 1.1 第 11 轮留下的验证资产（这轮想复现直接跑）

```powershell
# 静态靶场（真 Chromium，桩数据；量 10 张卡/29 张图/级联浮层/汇总 25 列/统一区）
$env:TEMP="$PWD\.build-tmp"; $env:TMP="$env:TEMP"
$env:VITE_BACKEND_PORT="8736"
$env:Path="C:\Users\13774\.nodejs\node-v24.21.0-win-x64;$env:Path"
npx vite build --config .build-tmp/harness/vite.config.ts
& "E:\python3.9.6\python.exe" .build-tmp\harness\serve.py 8736     # 后台任务
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
& $edge @("--headless=new","--disable-gpu","--no-first-run","--window-size=1500,950",
  "--user-data-dir=$PWD\.build-tmp\edge-r12","--virtual-time-budget=25000",
  "http://127.0.0.1:8736/.build-tmp/harness/round11.html?page=board&step=charts")
# 量测结果通过页面里的 fetch('/log?msg=...') 打到 serve.py 的 stdout（后台任务输出里看）

# 29 组导出口径实测（真 backend，量文件数与耗时）
cd .build-tmp; & "E:\python3.9.6\python.exe" verify_board_export_29.py
```

第 11 轮实测留档值：卡片 10 / 图 10；`CHARTS cells=29 columns=3 canScroll=true`；汇总表首行 25 个 `td`；
`SUMMARY_EXPORT rowCount=696`、文件名 `汇总 · 全部网点 · 网点 × 省份 · 货量、折扣、单价_…xlsx`；
29 组导出 **30 个文件、4.6 秒**；打包 sidecar 冒烟（含 29 组用例）**PASS**。

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

# Rust（改了 main.rs / tauri.conf.json 必跑）
cd src-tauri; cargo check --release; cd ..

# 打包三步（nsi / main.rs / tauri.conf.json 改了就要全做）
& "E:\python3.9.6\python.exe" backend\build.py
npx tauri build --no-bundle
$env:TEMP="$PWD\.build-tmp\mknsis"; $env:TMP="$env:TEMP"
& "$PWD\.build-tmp\nsis\nsis-3.11\makensis.exe" /V2 installer\windows\workbench.nsi
& "$PWD\.build-tmp\nsis\nsis-3.11\makensis.exe" /DNOWEBVIEW2 /V2 installer\windows\workbench.nsi

# 打包后 sidecar 冒烟（含 29 组文件夹导出）
cd .build-tmp; & "E:\python3.9.6\python.exe" smoke_sidecar.py; cd ..
```

**权限**：`cargo check` / `npx tauri build` / `npx vitest` / `npx vite build` / PyInstaller / `makensis` /
起 sidecar 冒烟 / headless Edge **都必须 `danger-full-access`**（沙箱下 spawn EPERM、mmap 失败、Edge 起不来）。

**格式**：源码 CRLF + UTF-8 无 BOM；**`.nsi` 必须是 UTF-8 with BOM**（改完自查前三字节 = `EF BB BF`）：

```powershell
$b = [System.IO.File]::ReadAllBytes("installer\windows\workbench.nsi"); $b[0..2]
```

新建/改动过的源码要跑归一化：`& "E:\python3.9.6\python.exe" .build-tmp\normalize_eol.py`
（`FILES` 清单已含第 10/11 轮改动文件，本轮新改的文件记得加进去）。

---

## 3. 任务 1（主）：Win10 兼容性硬化 4 个补丁

> 背景取证见 `HANDOVER_NEXT.md` §5：**Win7/8/8.1 官方不支持**（exe 静态导入 Win8+ API、WebView2 Runtime 109 是最后一个支持 Win7 的版本、
> Tauri 2 用的远新于此）；Win10 1709+ 可用但需要下面 4 个补丁把「装完打不开 / 双击没反应 / 小屏放不下」这三类事故挡住。
> 这 4 条**当时用户说「等验证通过再说」，现在第 11 轮已通过，开工前按 §5 确认 3 个问题即可动手**。

### 3.1 补丁①：安装包拦 Win7/8/8.1（`installer/windows/workbench.nsi`）

现状：**没有** `WinVer.nsh`，也没有任何系统版本判断（只有 `CheckWebView2`）。文件头 `!include` 区在 L12-30 附近。

改法（示意，具体文案按项目风格）：

```nsis
!include "WinVer.nsh"
; …… 在 .onInit 里（或 Section "主程序" 开头、CheckWebView2 之前）
${IfNot} ${AtLeastWin10}
  MessageBox MB_ICONSTOP|MB_OK "算账工作台需要 Windows 10 1709 或更高版本。$\r$\n$\r$\n当前系统版本过低（Windows 7 / 8 / 8.1 无法运行本软件）。$\r$\n建议升级到 Windows 10/11 后再安装。"
  Abort
${EndIf}
```

注意：
- `WinVer.nsh` 是 NSIS 自带头文件（`.build-tmp\nsis\nsis-3.11\Include\WinVer.nsh`），`!include` 即可，不用改 Include 路径。
- `${AtLeastWin10}` 只判主版本（10 及以上），**拦不住 1507/1607 LTSB**；如需拦到 1709（build 16299）要额外读
  `HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion` 的 `CurrentBuildNumber`——这条**必须先问用户**（§5 问题 1）。
- 精简包（`/DNOWEBVIEW2`）也要有这道拦截（版本检查与 WebView2 是否内置无关），两个包都要实测。

### 3.2 补丁②：WebView2 安装失败要能看见（`workbench.nsi` L114-129）

现状（L124）：

```nsis
ExecWait '"$INSTDIR\MicrosoftEdgeWebView2RuntimeInstallerX64.exe" /silent /install'
```

**返回值没接、也没检查**：装失败照样提示「完成」，用户双击后一片空白。

改法：

```nsis
ExecWait '"$INSTDIR\MicrosoftEdgeWebView2RuntimeInstallerX64.exe" /silent /install' $0
Delete "$INSTDIR\MicrosoftEdgeWebView2RuntimeInstallerX64.exe"
${If} $0 != "0"
${AndIf} $0 != "3010"        ; 3010 = 成功但需重启
  MessageBox MB_ICONEXCLAMATION|MB_OK "WebView2 运行时安装失败（返回码 $0）。$\r$\n$\r$\n程序会安装，但界面可能打不开。$\r$\n请手动安装 Microsoft Edge WebView2 Runtime 后重试：$\r$\nhttps://developer.microsoft.com/microsoft-edge/webview2/"
${EndIf}
```

注意：
- 精简包（`/DNOWEBVIEW2`）走的是另一支（L118-119 的 DetailPrint），不要在那条路上弹这个框。
- `3010` 要当成功；`1638`（已安装更高版本）同样当成功——按需放宽。
- `.nsi` 里的中文必须保持 UTF-8 with BOM，否则 NSIS 编译出来的对话框是乱码。

### 3.3 补丁③：启动失败不要「双击没反应」（`src-tauri/src/main.rs` L41-42）

现状：

```rust
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
```

release 下 `windows_subsystem = "windows"`（L1）**没有控制台**，`expect` 的 panic 用户完全看不见 = 双击没反应。

改法（两段，建议按此顺序）：

1. **启动前查 WebView2**：与 `workbench.nsi::CheckWebView2` 同一套注册表（三处任一有 `pv` 即视为已装）：
   - `HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}` → `pv`
   - `HKLM\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}` → `pv`
   - `HKCU\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}` → `pv`
   查注册表要么加 `windows` / `winreg` 依赖（**先问用户**，见 §5 问题 2），要么用 `std::process::Command` 起
   `reg query` 读 stdout（不加依赖，但要处理没有 reg.exe 的极端情况）。
2. **`run()` 失败时弹原生消息框**：`tauri_plugin_dialog` 已经初始化（L15），在 `.setup()` 或 `run()` 之后用
   `app.dialog().message(...)` / `blocking_message_dialog` 给中文提示（含「重装/修复 WebView2」的动作建议），
   **不要**只 `eprintln!`。注意 `run()` 是消费 `Builder` 的最后一个调用，拿不到 `app` 时可以先 `build()` 再 `run()`，
   或者在 `main()` 外面包一层：`let result = Builder…run(...); if let Err(e) = result { show_native_error(e); }`。

约束（`src-tauri/AGENTS.md`）：Rust 侧只管窗口 / 菜单 / 对话框 / sidecar 生命周期，**不写业务逻辑、不碰数据**；
版本/运行时探测属于「启动环境」范畴，可以写。新增逻辑要能 `cargo check --release` 过。

### 3.4 补丁④：最小窗口尺寸降到小屏放得下（`src-tauri/tauri.conf.json` L18-21）

现状：

```json
        "width": 1280,
        "height": 860,
        "minWidth": 1024,
        "minHeight": 680,
```

1366×768 @125% 缩放的实际可用区约 **1092×574**，`minHeight 680` 放不下 → 窗口底部按钮被任务栏/屏幕切掉。

建议：

```json
        "width": 1280,
        "height": 860,
        "minWidth": 900,
        "minHeight": 560,
```

配套（二选一或都做，**先问用户** §5 问题 3）：
- 初始 `width/height` 是否也降到 `1180×800`（小屏首启动就放得下）；
- 设置页已有「字号 小（`html zoom` 0.9）」——可在窗口高度不足时在启动后误一次提示（或写进帮助页文案）。

改完必须 `cargo check --release` + `npx tauri build --no-bundle`，并在 1366×768@125% 与 1920×1080@100% 下各看一眼
（没有真机就用 `tauri.conf.json` 临时改成该尺寸手动拖窗口验证布局不塌）。

---

## 4. 任务 2（次）：`ChartPreview` 放大弹层的画布宽度

现状（`src/components/chart/ChartPreview.tsx` L19-22，调用点 L77）：

```ts
/** 放大弹层里可用的绘图宽度（粗略值，用来算每个刻度的可用宽度）。 */
function zoomCanvasWidth(): number {
  if (typeof window === "undefined") return 1000;
  return Math.min(1060, Math.max(560, window.innerWidth * 0.92 - 60));
}
```

问题：`html { zoom }`（设置页字号）下 `window.innerWidth` 与视觉宽度不同步（坑 56 / 62），
放大弹层里刻度字号/斜度会估错（**只影响字号与斜度估计，不影响任何位移**，第 11 轮记为「不影响验收、可选」）。

改法：用项目里已有的探针——`src/utils/overlay.ts::layoutViewport()`：

```ts
import { layoutViewport } from "../../utils/overlay";

function zoomCanvasWidth(): number {
  if (typeof document === "undefined") return 1000;
  const { width } = layoutViewport();   // 视觉宽度，绕开 window.innerWidth
  return Math.min(1060, Math.max(560, width * 0.92 - 60));
}
```

验收：字号「特大（zoom 1.2）」+ 窗口 1000×560 打开图表 → 双击放大 → 刻度不重叠、不出现「隔几个显示一个」的异常稀疏；
`npx vitest run` 不掉（`chartData.test.ts` 里 `fitAxisLabels` 的用例不受影响）。

---

## 5. 开工前请用户拍板的 3 个问题（一条消息问完）

1. **安装包版本门槛**：只拦「低于 Win10」（`${AtLeastWin10}`，会放过 1507/1607 LTSB）？
   还是连 1709 以下也拦（读 `CurrentBuildNumber` ≥ 16299，Win10 早期版本会装不上）？
   ——推荐「只拦低于 Win10」，与 `HANDOVER_NEXT.md` §5 的 A 方案一致，误伤概率最低。
2. **查 WebView2 的方式**：加 `windows`（或 `winreg`）crate 读注册表（干净，但多一个依赖），
   还是 `Command::new("reg")` 读 stdout（不加依赖，代码丑一点）？
   ——推荐前者（`windows` 已有间接依赖的话更省事，先 `cargo tree` 看一眼）。
3. **最小窗口尺寸**：`minWidth/minHeight` 降到 `900×560`，初始 `width/height` 是否也跟着降到 `1180×800`？
   ——推荐「最小尺寸降、初始尺寸不变」，老用户窗口位置/大小不受影响。

（其余 3 条补丁的文案/风格不用问，按项目现成风格写即可。）

---

## 6. 硬约束（违反会被打回）

- 先读 `AGENTS.md`（根）、`src/AGENTS.md`、`backend/AGENTS.md`、`src-tauri/AGENTS.md`；
  **前端禁止 `any`**；样式走 CSS Modules + `variables.css` 变量（禁硬编码颜色）；**Rust 侧不写业务逻辑**。
- 安装包**完全离线、仅 Windows**；不要引入新的网络请求。
- 源码 CRLF + UTF-8 无 BOM；**`.nsi` 必须 UTF-8 with BOM**（改完查前三字节）。
- 分层：`api/` 只做 HTTP；`stores/` 不放 fetch；后端 `compute/` 纯函数、`io/` 只做格式转换、`routers/` 不写业务。
- **每步都跑**：`pytest tests -q` + `npx tsc --noEmit` + `npx vitest run`；改了 Rust 再加 `cargo check --release`。
- 改完**统一出一次包**（三步全做，两个 nsi 都要编）→ 跑 sidecar 冒烟 → 更新 `HANDOVER_PLAN.md`：
  新增 **§19** 并继续编号新坑（**当前到 88**）。
- 方案类（数据模型 / 存储布局 / 页面结构 / 新依赖）先问；权限类直接执行。
- **不要顺手改业务**：第 11 轮的 6 条需求已验收，回归基线是
  `pytest 214 passed` / `tsc 0 错` / `vitest 173 passed` / `e2e EXIT=0` —— 这些数字只能涨不能掉。

---

## 7. 建议开工顺序

1. 先跑一遍基线（pytest / tsc / vitest）确认 214 / 0 / 173，再动代码。
2. **问 §5 的 3 个问题**（一条消息问完），拿到答复再动手。
3. 补丁④（`tauri.conf.json`，改一个数字，最好先验证）→ 补丁③（`main.rs`，最需要反复 `cargo check`）→
   补丁① / ②（`.nsi`，两者一起编、两个包都编）。
4. 任务 2（`ChartPreview` 一行改动 + vitest）。
5. `cargo check --release` → 全量验证 → `backend/build.py` → `npx tauri build --no-bundle` → `makensis ×2`
   → `.build-tmp/smoke_sidecar.py`（应仍是 `RESULT PASS`，含 29 组 30 文件）。
6. 手工看一眼两个安装包：老系统（可把 `AtLeastWin10` 临时改成 `AtLeastWin8` 反证拦截生效）、
   WebView2 已装 / 未装、1366×768@125% 窗口布局。
7. 更新 `HANDOVER_PLAN.md` §19 + 新坑 89+；本文件末尾补「结论」段。

---

## 8. 验收点（写完对照打勾）

1. 在 Win7/8.1 上双击安装包 → **中文提示 + 直接退出**，不会装到一半（两个包都要试）。
2. 断网 + 系统没 WebView2 时，WebView2 静默安装失败 → **弹提示 + 给下载地址**，不会假装成功；
   精简包在缺 WebView2 时给的是「请先安装 WebView2」的说明（现有逻辑保留）。
3. 把 WebView2 卸掉再双击 `accounting-workbench.exe` → **弹中文消息框**说明原因（不再是「双击没反应」）。
4. 1366×768 @125% 打开主窗口 → 默认窗口完整可见、底部按钮不被切；最小尺寸 900×560 时布局不塌（左栏/右栏仍可滚）。
5. 字号「特大」+ 小窗口打开图表双击放大 → 刻度不重叠。
6. 全量验证数字：`pytest ≥ 214` / `tsc 0` / `vitest ≥ 173` / `e2e EXIT=0` / `cargo check` 0 错 / sidecar 冒烟 PASS。
7. `dist-installer` 下两个安装包时间戳是本轮的，大小在同一量级（≈314.8 MB / ≈100.0 MB）。

---

## 9. 新窗口提示词（直接复制）

```text
接手「算账工作台」桌面应用（React 18 + TS + Vite + Zustand + AG Grid + ECharts + Tauri 2 + Python FastAPI sidecar）。
工作目录：C:\Users\13774\Desktop\网管算账工作台\accounting-workbench

第一步先读，别急着动代码：
1. HANDOVER_NEXT_12.md  ← 本轮（第 12 轮）交接文档：只剩「Win10 硬化 4 个补丁」+ ChartPreview 一个小尾巴，
                          每条都给了精确坐标、改法、验收点，§5 是 3 个待你问用户的问题
2. HANDOVER_PLAN.md 的 §0（命令）、§3（坑 1–45）、§9.4（46–50）、§11（56–57）、§13（62–64）、§14、§15（65–66）、
   §16（67–76）、§17、§18（第 11 轮 + 坑 77–88）
3. HANDOVER_NEXT.md §5（Win7/Win10 取证明细，4 个补丁的来由）
4. AGENTS.md、src/AGENTS.md、backend/AGENTS.md、src-tauri/AGENTS.md

本轮任务：
A（主）Win10 兼容性硬化 4 个补丁（HANDOVER_NEXT_12.md §3）：
  ① installer/windows/workbench.nsi 加 WinVer.nsh，低于 Win10 中文提示 + Abort（两个包都要生效）
  ② workbench.nsi 的 ExecWait（L124）返回码要检查，WebView2 装失败要弹提示 + 官网地址
  ③ src-tauri/src/main.rs 的 .expect(...)（L41-42）在无控制台 release 下等于「双击没反应」→ 启动前查 WebView2、失败弹原生消息框
  ④ src-tauri/tauri.conf.json 的 minWidth 1024 / minHeight 680 在 1366×768@125% 放不下 → 降到 900×560
B（次）ChartPreview 放大弹层画布宽：zoomCanvasWidth() 的 window.innerWidth 改用 utils/overlay.ts::layoutViewport()
  （坑 56/62 同类隐患，只影响刻度字号估计）

开工前必须问 HANDOVER_NEXT_12.md §5 的 3 个问题（一条消息问完）：版本门槛拦到哪一版、查 WebView2 用不用加 crate、
最小尺寸降了初始尺寸要不要跟着降。其余文案/风格按项目现成风格写，不用再问。

硬约束：
- 安装包完全离线、仅 Windows；vitest / vite build / tauri build / cargo / PyInstaller / makensis / headless Edge
  必须用 danger-full-access 跑（沙箱下 spawn EPERM / mmap 失败 / 起不来）
- 源码 CRLF + UTF-8 无 BOM；**.nsi 改完必须是 UTF-8 with BOM**（查前三字节 EF BB BF）
- 前端禁止 any；样式走 CSS Modules + variables 变量；Rust 侧不写业务逻辑（只管窗口/菜单/对话框/sidecar 生命周期）
- 每步都跑：cd backend; & "E:\python3.9.6\python.exe" -m pytest tests -q  +  npx tsc --noEmit  +  npx vitest run
  （改了 Rust 再加 cargo check --release）
- 改完统一出一次包（backend/build.py → npx tauri build --no-bundle → makensis ×2），再跑 .build-tmp/smoke_sidecar.py
  （应 RESULT PASS，含「29 组 → 30 文件」用例），并更新 HANDOVER_PLAN.md（新增 §19 + 新坑 89+）
- 回归基线（第 11 轮，只能涨不能掉）：pytest 214 passed / tsc 0 错 / vitest 173 passed / e2e EXIT=0；
  别顺手改业务逻辑（第 11 轮 6 条需求已验收）
```

---

## 10. 其它「挂着但没开工单」的可选项（**别自作主张做**）

下面这些历轮记录过、但用户没要求做，仅供回答「还能做什么」时列举，不要开工：

- `HANDOVER_PLAN.md` §13.10：饼图 + 多指标不是推荐组合（预览用第一个指标，导出会丢掉第一个指标非正数的行）。
- `HANDOVER_PLAN.md` §14.8：竖排 90° 是「斜排塞不下」时的兜底，若用户更想要「隔几个显示一个」，把第 2、3 步对调即可。
- `HANDOVER_PLAN.md` §15.8：一键算导出的表格仍是「长表」（功能 / 维度 / 公斤段 / 指标 / 值），想要「每块一个 Sheet」或宽表需另开工单；
  看板的饼图导出仍提示「请改用 SVG 截图」。

---

## 11. 本轮结论（2026-10-29，第 12 轮已完成）

> 开工前用户按 §5 拍板：① 只拦「低于 Win10」（`${AtLeastWin10}`）② 查 WebView2 加 `winreg` crate
> ③ 最小尺寸降到 900×560、初始 1280×860 不动。四项 + ChartPreview 一行改动全部落地，细节见
> `HANDOVER_PLAN.md` §19（含本轮新增的坑 **89–99**）。

| 交付 | 结果 |
|---|---|
| ① 安装包拦 Win7/8/8.1 | `!include "WinVer.nsh"` + `.onInit` 里 `${IfNot} ${AtLeastWin10}` → 中文提示 + `Abort`；另加空 `un.onInit`（否则卸载器也会被门槛挡住）。两个包都编过（FULL/LITE `EXIT=0`），机制用 `.build-tmp\nsi_gate_probe.nsi` 实证（`AtLeastWin10=1`、Abort 后 Section 未执行） |
| ② WebView2 装失败要能看见 | `ExecWait … $0` + 分支：`0`（再复查注册表防「假成功」）/ `3010` / `1638` 当成功，其它（含返回码为空 = 安装程序没起来）弹提示 + 官网地址。返回码分支实测 5 档全对 |
| ③ 启动失败不要「双击没反应」 | 新增 `src-tauri\src\startup.rs`：启动前查三处注册表（与 nsi 同一套）+ `MessageBoxW` 原生中文框 + **panic 钩子**。`main.rs` 删掉 `.expect(...)`。实测：本机读出 `Some("156.0.4314.50")`；两个消息框窗口文本都抓到；真 exe 第二实例（`0x800700AA`）改前无提示、改后弹中文框 |
| ④ 最小窗口尺寸 | `minWidth 1024→900`、`minHeight 680→560`；真窗口 `WM_GETMINMAXINFO` 的 `ptMinTrackSize = 1350×840 = 900×560 × 150%`（旧值应为 1536×1020），证明进了 exe |
| 任务 2 ChartPreview | `zoomCanvasWidth()` 改用 `utils/overlay.ts::layoutViewport()`；`tsc 0` / `vitest 173` 不掉 |

**本轮验证基线（只能涨不能掉）**：`pytest 214 passed` / `tsc 0 错` / `vitest 173 passed` / `e2e EXIT=0` /
`cargo check --release` 0 错 / `makensis ×2` 全过 / `.build-tmp\smoke_sidecar.py` **RESULT PASS**（含 29 组 → 30 文件）。
产物：`算账工作台-0.1.0-win-x64-setup.exe` 314,860,402 B @22:52、`…-lite-setup.exe` 100,036,456 B @22:55
（源码 CRLF 归一化之后又完整重出过一遍，冒烟仍是 RESULT PASS）。

**本轮新挖到、写文档时必须记住的两条**（不在原 §3 计划里）：

1. Tauri 建 WebView 失败是 **panic**（`tauri/src/app.rs:1444`），不是 `run()` 的 `Err` —— 只包结果没用，必须有 panic 钩子（坑 89）；
2. 同一用户开第二份会因 WebView2 数据目录被占而 `0x800700AA`「请求的资源在使用中」，用户看到的就是「双击没反应」（坑 90）。

**留给真机验的两条**（本机没有 Win7 / 8.1 / 1366×768@125% 真机）：

- 老系统上双击两个安装包 → 中文提示 + 直接退出（反证：`.build-tmp\nsi_gate_probe.nsi` 已证 Abort 生效）；
- 1366×768@125% 下默认窗口完整可见、最小 900×560 布局不塌（静态靶场已量：`.body` 无横向滚动条、
  图表 3 列、纵向可滚，见 `HANDOVER_PLAN.md` §19.7）。

**另外**：验证过程中把本机卡住的 WebView2 配置目录改名成了
`%LOCALAPPDATA%\com.accounting.workbench\EBWebView.broken-r12`（改名后 exe 能正常启动）；
那是 WebView2 缓存 + 主题/字号这类 `localStorage`，项目数据不在里面，确认无影响后可删除。
