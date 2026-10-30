\# 开发任务卡片

> 先读 `DESIGN_STATE.md`：已确认的设计决策与当前进度以那份为准，本文件只保留最初的 P0–P12 路线卡片。



\## 使用方式

每次给 Codex 下任务时，复制对应卡片 + 附上根 AGENTS.md 路径。



\---



\### P0 骨架

目标：Tauri + React + FastAPI sidecar 跑通。

交付：

\- src-tauri/ 能启动 sidecar

\- 前端能调用 GET /api/health

\- 返回 {"status": "ok"}

验收：

\- npm run dev 后窗口打开

\- 控制台打印 backend port

\- /api/health 返回 200



\---



\### P1 导入

目标：支持 xlsx / xls / csv 导入，表格预览。

交付：

\- backend/io/importer.py

\- backend/routers/import\_router.py

\- src/components/table/DataGrid.tsx

验收：

\- 三种格式各导入一次

\- 10 万行可滚动无卡顿

\- 多 Sheet 弹窗提示



\---



\### P2 字段识别

目标：预定义字段识别 + 五类分类 + 固定规则入口。

交付：

\- backend/data/field\_registry.py

\- backend/constants.py

\- src/components/analysis/FixedRuleMenu.tsx

验收：

\- 命中 >= 10 字段时显示固定规则

\- 缺少字段时弹窗列出缺失项



\---



\### P3 计算引擎

目标：筛选、分组、聚合、派生指标。

交付：

\- backend/compute/engine.py

\- backend/compute/filters.py

\- backend/compute/groupby.py

\- backend/compute/aggregators.py

\- backend/compute/fixed\_rules.py

验收：

\- 三个固定规则结果与手工 Excel 一致

\- 空值、除零、文本转数值失败均正确处理



\---



\### P4 占比

目标：四种占比模式 + 多列输出。

交付：

\- backend/compute/ratios.py

验收：

\- 模式 a/b/c/d 与手工计算一致

\- 分母为 0 时留空



\---



\### P5 时间维度

目标：日期范围选择 + 按天分组。

交付：

\- backend/compute/time\_dimension.py

\- src/components/analysis/TimeRangePicker.tsx

验收：

\- 单日、跨日、未知日期均正确

\- 图表分析时按粒度汇总



\---



\### P6 图表

目标：ECharts 预览 + 导出 PDF/JPEG。

交付：

\- backend/chart/builder.py

\- backend/io/pdf\_exporter.py

\- backend/io/jpeg\_exporter.py

\- src/components/chart/ChartPreview.tsx

验收：

\- 五种图表类型均可渲染

\- 中文字体正常

\- PDF 矢量优先



\---



\### P7 导出

目标：xlsx / xls / csv 导出。

交付：

\- backend/io/excel\_exporter.py

\- backend/io/csv\_exporter.py

验收：

\- xls 超 65536 行时禁用并提示

\- csv 带 BOM



\---



\### P8 项目

目标：新建、打开、删除、合并。

交付：

\- backend/storage/project\_store.py

\- backend/data/merger.py

\- src/components/project/

验收：

\- 合并列顺序按规则正确

\- 删除时清理缓存目录



\---



\### P9 历史记录

目标：历史窗口 + 模糊索引 + 分页。

交付：

\- src/components/history/HistoryWindow.tsx

验收：

\- 每页 8 条

\- 项目名/创建人模糊索引

\- 创建时间范围索引



\---



\### P10 线性回归拟合

目标：独立工具 + 折线图。

交付：

\- backend/compute/regression.py

\- src/components/regression/RegressionWindow.tsx

验收：

\- 公式与手工计算一致

\- 支持手动输入与表格取数两种模式



\---



\### P11 设置

目标：字体、主题持久化。

交付：

\- backend/storage/settings\_store.py

\- src/stores/settingsStore.ts

验收：

\- 重启后保留



\---



\### P12 打包

目标：PyInstaller + Tauri 打包。

交付：

\- backend/build.py

\- scripts/build.sh

\- scripts/release.sh

验收：

\- 用户无需安装任何运行时

\- Windows / macOS 各一份安装包

