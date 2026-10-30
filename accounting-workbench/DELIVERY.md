# 交付状态（Windows 安装包）

> 目标：Windows 上一键安装、断网可用。macOS 本期不做（用户 2026-10-23 确认）。

## 1. 当前可交付物

| 产物 | 路径 | 说明 |
|---|---|---|
| 安装包（含 WebView2） | `dist-installer/算账工作台-0.1.0-win-x64-setup.exe` | 300 MB，离线可装 |
| 安装包（精简） | `dist-installer/算账工作台-0.1.0-win-x64-lite-setup.exe` | 95 MB，目标机需自带 WebView2 运行时 |
| 打包脚本 | `scripts/build-windows.ps1` | sidecar → 前端 → release → NSIS 一条命令 |
| 安装说明 | `INSTALL.md` | 目录结构、体积、验证清单 |
| 应用图标 | `assets/icon/A/`（16–1024 PNG）、`src-tauri/icons/`（多尺寸 ico + icns）、`scripts/make_icons.py` | 2026-10-27 换的 A 版计算器线稿 |

安装包内容：`accounting-workbench.exe`（前端已内嵌）+ `icon.ico` + `sidecar/`（PyInstaller onedir 后端 + Noto 字体）
+ WebView2 离线安装器 + 开始菜单/桌面快捷方式 + 卸载项。用户数据默认在 `%USERPROFILE%\.accounting-workbench`，可在「设置 → 数据 → 更改目录」改成自选目录（迁移后旧目录保留一份）。

## 2. 已完成的后端能力（pytest 163 条全绿）

| 模块 | 内容 | 接口 |
|---|---|---|
| 导入 / 表格编辑 / 计算引擎 | 原有 P1–P7 | `/api/import`、`/api/dataset/*`、`/api/compute` |
| 计算导出 | xlsx / xls / csv | `/api/export` |
| 图表渲染 | matplotlib → PDF / JPEG（中文字体随包） | `/api/chart/render` |
| 项目 / 历史 | SQLite `projects.db` + 排序与筛选 | `/api/projects*` |
| **一键算（看板）** | 筛选 → 网点/省份分组 → 6 个公斤段的量/价/折扣 + 加权与简单平均 + 维度候选值 | `/api/board`、`/api/board/sources` |
| **盈亏平衡** | 手动测算（L=mZ+B、保本折扣、1% 折扣）+ 表格取数（组合拆组、每组政策、判定、合计） | `/api/regression/manual`、`/api/regression/table` |
| **项目库（保存语义）** | `saved_kind`（manual/auto）+ `state`（三页输入快照 JSON）；排序：created_at / updated_at 倒序 | `/api/projects*` |
| **字段取值** | 分组筛选条件的候选值 | `/api/values` |
| **盈亏平衡导出** | 一个文件夹四类文件：整页 PDF / 网格 JPEG / 单图 JPEG / 汇算明细 XLSX | `/api/regression/export/table`、`/export/manual` |
| **派生指标带括号** | `derived_metrics[].expression` 支持嵌套括号、四则优先级、分母 0 留空（指标框表达式就靠它） | `/api/compute` |

## 3. 已完成的前端页面

- 导入 / 表格 / 分析页（筛选条件即可分组维度、指标框表达式、图表、导出）
- 项目 / 历史记录 / 导出文件管理页
- **一键算看板**：口径筛选、网点多选、分组维度、汇总卡、货物流向数据表、对比图表
- **盈亏平衡与折扣分析**：表格取数 + 手动测算两种模式、两张结论卡、分析段、扫描表、汇算明细表、利润–货量图
- **输入快照存取**：保存项目时把「图表配置 + 分析页（条件行 / 指标框）+ 一键算 + 盈亏平衡」写进项目 `state`，打开项目自动回填
- **指标区（2026-10-27 重构）**：指标1…N 各自独立框，框内一行表达式（字段(计算方式) ＋ － × ÷ 括号，可嵌套），合并/展开保留

## 4. 验证方式

```powershell
cd backend; & "E:\python3.9.6\python.exe" -m pytest tests -q   # 163 passed
npx tsc --noEmit                                               # 通过
npx vitest run                                                 # 97 passed（14 个测试文件）
cd backend; & "E:\python3.9.6\python.exe" scripts\e2e_real_data.py   # 真实 100 行数据全链路
cd backend; & "E:\python3.9.6\python.exe" scripts\check_caliber.py   # 口径守门
```

## 5. 待办（后续轮次）

1. 指标区视觉微调（等用户看图后定 45%/45%、1.3:1 的具体数值）；
2. 分析页图表仍是 ECharts 简版（原型是手绘 SVG + X 轴取值级联多选）；
3. sidecar 体积优化（当前 300 MB 安装包，可压到约 150 MB）。
