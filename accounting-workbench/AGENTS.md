\# 算账工作台 — 项目开发规范（AGENTS.md）



> 本文件是项目的唯一权威开发规范，Codex 在生成任何代码前必须先阅读本文件。所有代码必须与本文件的架构、数据模型、模块边界、命名约定保持一致。如有冲突，以本文件为准。



\---



\## 0. 文档说明



\- 本文件同时面向人类开发者与 Codex。

\- Codex 在每次生成代码前，必须先阅读本文件；生成代码后，必须自检是否符合第 15 章“禁止事项”。

\- 若某处需求不明确，Codex 必须\*\*停止生成并输出问题\*\*，不得自行假设。

\- 本文件使用中文，代码中的标识符（类名、函数名、变量名）使用英文。



\---



\## 1. 项目概述



\### 1.1 项目定位



本地单机运行的“算账工作台”，面向物流/快递行业的账单数据分析场景。用户导入结构化表格（xlsx/xls/csv），通过向导式流程完成字段选择、分组、聚合、占比、时间维度筛选等分析，输出数字表格或图表，并导出为本地文件。



\### 1.2 目标平台



\- Windows 10/11

\- macOS 11+

\- 仅 PC 端，不支持移动端



\### 1.3 核心能力



| 能力 | 说明 |

|---|---|

| 文件导入 | xlsx / xls / csv，单 Sheet，行列数不设上限（2026-10-28 取消 200 列 × 100,000 行限制） |

| 表格编辑 | 行列增删改、复制、剪切、粘贴、查找、撤销/重置 |

| 字段识别 | 自动识别 44 个预定义字段，触发固定规则与五类分类导航 |

| 分析配置 | 筛选、分组、聚合、占比、派生指标、时间维度 |

| 固定规则 | 网点货量分析、网点单公斤价格分析、网点折扣分析 |

| ~~占比分析~~（已砍掉 2026-10-25） | 用分析页指标 `÷` 连接符出「计算结果」列 |

| 线性回归拟合 | 独立工具，支持手动输入或从表格取数，输出折线图 |

| 输出 | 数字表格（xlsx/xls/csv）或图表（pdf/jpeg） |

| 项目管理 | 新建、打开、删除、合并、历史记录 |

| 设置 | 字体增大/缩小、深色/浅色主题 |



\### 1.4 设计导向



\*\*本地使用、简便可靠、简洁美观、代码可靠性一致性高、用户傻瓜式操作。\*\*



\---



\## 2. 设计原则



1\. \*\*单一数据源\*\*：完整数据只存在于 Python 后端，前端只持有预览与聚合结果。

2\. \*\*配置驱动计算\*\*：所有分析行为由 `AnalysisConfig` 对象描述，后端根据配置执行，不写死业务分支。

3\. \*\*单向数据流\*\*：前端 → API → 后端 → 结果 → 前端，禁止反向修改。

4\. \*\*模块边界清晰\*\*：导入、计算、导出、存储各自独立，通过明确定义的接口交互。

5\. \*\*错误显式化\*\*：所有失败路径必须返回结构化错误码与用户可读消息，禁止静默失败。

6\. \*\*开箱即用\*\*：用户无需安装 Python、Node.js 或任何运行时；所有依赖随应用打包。

7\. \*\*跨平台一致\*\*：快捷键、字体、路径处理在 Windows 与 macOS 上行为一致（差异通过 `mod` 键映射处理）。



\---



\## 3. 技术栈



\### 3.1 前端



| 项 | 选型 |

|---|---|

| 框架 | React 18 + TypeScript |

| 构建 | Vite |

| 状态管理 | Zustand |

| 表格 | AG Grid Community（虚拟滚动，支持 10 万行） |

| 图表 | ECharts 5 |

| 样式 | CSS Modules + CSS 变量 |

| 图标 | lucide-react |

| 路由 | 无（单窗口 + 内部状态切换） |



\### 3.2 桌面壳层



| 项 | 选型 |

|---|---|

| 壳层 | Tauri 2.x |

| 语言 | Rust（仅用于窗口管理、菜单、sidecar 生命周期） |

| 通信 | Tauri command → HTTP localhost → Python FastAPI |



\### 3.3 后端



| 项 | 选型 |

|---|---|

| 语言 | Python 3.11 |

| Web 框架 | FastAPI + Uvicorn |

| 数据处理 | pandas + numpy |

| Excel 读写 | openpyxl（xlsx）、xlrd 1.2.0（xls 读）、xlwt（xls 写） |

| CSV | pandas 内置 |

| 图表渲染 | matplotlib（后端渲染为图片） |

| PDF 导出 | reportlab（矢量优先） |

| 字体 | Noto Sans CJK SC（思源黑体，随应用打包，文件名 NotoSansCJKsc-*.otf） |

| 打包 | PyInstaller（单文件可执行） |



\### 3.4 通信协议



\- Python sidecar 启动时监听 `127.0.0.1` 随机端口，启动后通过 stdout 输出 `PORT=<port>`。

\- Tauri 捕获端口号，转发给前端。

\- 前端通过 `http://127.0.0.1:<port>/api/...` 调用后端。

\- 所有请求体与响应体均为 JSON。

\- 长任务通过 SSE（`/api/events`）推送进度。



\---



\## 4. 系统架构



```

┌─────────────────────────────────────────────┐

│              Tauri Shell (Rust)              │

│  - 窗口/菜单管理                              │

│  - Sidecar 生命周期                           │

│  - 文件对话框                                 │

└──────────────────┬──────────────────────────┘

&#x20;                  │ Tauri command (invoke)

┌──────────────────▼──────────────────────────┐

│           React Frontend (TS)                │

│  - 页面 / 组件                                │

│  - Zustand Store                             │

│  - HTTP Client                               │

└──────────────────┬──────────────────────────┘

&#x20;                  │ HTTP localhost

┌──────────────────▼──────────────────────────┐

│        Python Sidecar (FastAPI)              │

│  ┌─────────────────────────────────────┐    │

│  │  Routers（HTTP 接口层）              │    │

│  ├─────────────────────────────────────┤    │

│  │  Services（业务逻辑层）              │    │

│  │   - ImportService                   │    │

│  │   - ComputeService                  │    │

│  │   - ExportService                   │    │

│  │   - ProjectService                  │    │

│  │   - RegressionService               │    │

│  ├─────────────────────────────────────┤    │

│  │  Core（核心算法层）                  │    │

│  │   - FieldRegistry                   │    │

│  │   - FixedRules                      │    │

│  │   - Aggregators                     │    │

│  │   - RatioCalculator                 │    │

│  │   - TimeDimension                   │    │

│  │   - ChartBuilder                    │    │

│  ├─────────────────────────────────────┤    │

│  │  Storage（持久化层）                 │    │

│  │   - ProjectStore (SQLite)           │    │

│  │   - DatasetCache (parquet)          │    │

│  │   - SettingsStore (JSON)            │    │

│  └─────────────────────────────────────┘    │

└─────────────────────────────────────────────┘

```



\### 4.1 分层职责



| 层 | 职责 | 禁止 |

|---|---|---|

| Routers | 解析请求、调用 Service、返回响应 | 禁止包含业务逻辑 |

| Services | 编排业务逻辑、调用 Core | 禁止直接操作 HTTP |

| Core | 纯计算与算法 | 禁止访问文件系统、网络 |

| Storage | 读写本地文件、SQLite | 禁止包含业务判断 |



\---



\## 5. 目录结构



```

accounting-workbench/

├── AGENTS.md                          # 本文件

├── README.md

├── package.json

├── vite.config.ts

├── tsconfig.json

├── index.html

├── src/                               # React 前端

│   ├── main.tsx

│   ├── App.tsx

│   ├── api/

│   │   ├── client.ts                  # HTTP 客户端，含错误处理

│   │   ├── project.ts

│   │   ├── import.ts

│   │   ├── compute.ts

│   │   ├── export.ts

│   │   ├── chart.ts

│   │   ├── regression.ts

│   │   └── settings.ts

│   ├── stores/

│   │   ├── projectStore.ts

│   │   ├── tableStore.ts

│   │   ├── analysisStore.ts

│   │   ├── historyStore.ts

│   │   └── settingsStore.ts

│   ├── components/

│   │   ├── common/

│   │   │   ├── Button.tsx

│   │   │   ├── Modal.tsx

│   │   │   ├── Dropdown.tsx

│   │   │   ├── Toast.tsx

│   │   │   ├── ConfirmDialog.tsx

│   │   │   └── Spinner.tsx

│   │   ├── layout/

│   │   │   ├── TopToolbar.tsx

│   │   │   ├── MenuBar.tsx

│   │   │   └── AppShell.tsx

│   │   ├── table/

│   │   │   ├── DataGrid.tsx

│   │   │   ├── ContextMenu.tsx

│   │   │   ├── ColumnHeader.tsx

│   │   │   └── CellEditor.tsx

│   │   ├── wizard/

│   │   │   ├── WizardShell.tsx

│   │   │   ├── WelcomeStep.tsx

│   │   │   ├── ImportStep.tsx

│   │   │   ├── AnalysisStep.tsx

│   │   │   ├── PreviewStep.tsx

│   │   │   └── ExportStep.tsx

│   │   ├── analysis/

│   │   │   ├── AnalysisWindow.tsx

│   │   │   ├── FieldSelector.tsx

│   │   │   ├── MethodSelector.tsx

│   │   │   ├── FilterBuilder.tsx

│   │   │   ├── GroupByBuilder.tsx

│   │   │   ├── RatioBuilder.tsx

│   │   │   ├── TimeRangePicker.tsx

│   │   │   └── FixedRuleMenu.tsx

│   │   ├── chart/

│   │   │   ├── ChartPreview.tsx

│   │   │   └── ChartConfigPanel.tsx

│   │   ├── regression/

│   │   │   └── RegressionWindow.tsx

│   │   ├── project/

│   │   │   ├── NewProjectDialog.tsx

│   │   │   ├── ProjectManager.tsx

│   │   │   └── MergeProjectsDialog.tsx

│   │   └── history/

│   │       └── HistoryWindow.tsx

│   ├── pages/

│   │   ├── WelcomePage.tsx

│   │   ├── WorkspacePage.tsx

│   │   └── ProjectManagerPage.tsx

│   ├── styles/

│   │   ├── global.css

│   │   ├── theme.css

│   │   └── variables.css

│   ├── utils/

│   │   ├── format.ts

│   │   ├── shortcuts.ts

│   │   ├── platform.ts

│   │   └── validators.ts

│   └── types/

│       ├── project.ts

│       ├── analysis.ts

│       ├── chart.ts

│       ├── regression.ts

│       └── api.ts

├── src-tauri/

│   ├── Cargo.toml

│   ├── tauri.conf.json

│   ├── build.rs

│   ├── icons/

│   ├── binaries/

│   │   └── accounting-backend-<target-triple>

│   └── src/

│       ├── main.rs

│       ├── sidecar.rs

│       ├── commands.rs

│       └── menu.rs

├── backend/

│   ├── pyproject.toml

│   ├── requirements.txt

│   ├── build.py                       # PyInstaller 打包脚本

│   └── accounting\_backend/

│       ├── \_\_init\_\_.py

│       ├── main.py                    # FastAPI 入口

│       ├── config.py

│       ├── constants.py               # 预定义字段、五类分类、固定规则

│       ├── schemas/

│       │   ├── \_\_init\_\_.py

│       │   ├── project.py

│       │   ├── dataset.py

│       │   ├── analysis.py

│       │   ├── chart.py

│       │   ├── regression.py

│       │   └── export.py

│       ├── io/

│       │   ├── \_\_init\_\_.py

│       │   ├── importer.py

│       │   ├── excel\_importer.py

│       │   ├── csv\_importer.py

│       │   ├── exporter.py

│       │   ├── excel\_exporter.py

│       │   ├── csv\_exporter.py

│       │   ├── pdf\_exporter.py

│       │   └── jpeg\_exporter.py

│       ├── data/

│       │   ├── \_\_init\_\_.py

│       │   ├── dataset.py

│       │   ├── field\_registry.py

│       │   └── merger.py

│       ├── compute/

│       │   ├── \_\_init\_\_.py

│       │   ├── engine.py

│       │   ├── filters.py

│       │   ├── aggregators.py

│       │   ├── groupby.py

│       │   ├── ratios.py

│       │   ├── time\_dimension.py

│       │   ├── fixed\_rules.py

│       │   └── regression.py

│       ├── chart/

│       │   ├── \_\_init\_\_.py

│       │   ├── builder.py

│       │   └── palette.py

│       ├── storage/

│       │   ├── \_\_init\_\_.py

│       │   ├── project\_store.py

│       │   ├── history\_store.py

│       │   ├── settings\_store.py

│       │   └── paths.py

│       ├── services/

│       │   ├── \_\_init\_\_.py

│       │   ├── project\_service.py

│       │   ├── import\_service.py

│       │   ├── compute\_service.py

│       │   ├── export\_service.py

│       │   └── regression\_service.py

│       └── routers/

│           ├── \_\_init\_\_.py

│           ├── project.py

│           ├── import\_router.py

│           ├── compute\_router.py

│           ├── export\_router.py

│           ├── chart\_router.py

│           ├── regression\_router.py

│           └── settings\_router.py

├── assets/

│   └── fonts/

│       ├── NotoSansCJKsc-Regular.otf

│       └── NotoSansCJKsc-Bold.otf

└── scripts/

&#x20;   ├── dev.sh

&#x20;   ├── build.sh

&#x20;   └── release.sh

```



\---



\## 6. 数据模型



\### 6.1 预定义字段（44 个）



```python

PREDEFINED\_FIELDS = \[

&#x20;   "账单时间", "运单号", "类区", "寄件省份", "寄件原所属分拨中心",

&#x20;   "寄件网点编号", "寄件所属一级网点", "寄件网点", "目的所属省份",

&#x20;   "目的所属一级网点", "公斤段", "现价", "原价", "实际重量",

&#x20;   "结算重量", "派件结算重量", "体积", "件数", "物品来源", "是否剔除",

&#x20;   "产品类型", "订单来源", "派件方式", "物品名称", "物品类型",

&#x20;   "包装类型", "转运费", "转运费原价", "收寄站操作费",

&#x20;   "收寄站操作费原价", "计抛操作费", "燃油费", "二级出港服务费",

&#x20;   "二级进港服务费", "收网点延伸费", "出港操作费", "运输费",

&#x20;   "付派站派件费原价", "收区域派费补贴", "出港派件管理费",

&#x20;   "网点装卸费", "服务保障费", "会务费", "进港管理费",

]

```



\### 6.2 五类字段分类



```python

FIELD\_CATEGORIES = {

&#x20;   "运单基本信息": \[

&#x20;       "账单时间", "运单号", "公斤段", "实际重量", "结算重量",

&#x20;       "派件结算重量", "体积", "件数", "物品来源", "是否剔除",

&#x20;       "产品类型", "订单来源", "派件方式", "物品名称", "物品类型",

&#x20;       "包装类型", "现价", "原价",

&#x20;   ],

&#x20;   "寄件网点信息": \[

&#x20;       "类区", "寄件省份", "寄件原所属分拨中心", "寄件网点编号",

&#x20;       "寄件所属一级网点", "寄件网点",

&#x20;   ],

&#x20;   "到件网点信息": \["目的所属省份", "目的所属一级网点"],

&#x20;   "中转费用": \["转运费", "转运费原价", "收寄站操作费", "收寄站操作费原价"],

&#x20;   "中转费用杂项": \[

&#x20;       "计抛操作费", "燃油费", "二级出港服务费", "二级进港服务费",

&#x20;       "收网点延伸费", "出港操作费", "运输费", "付派站派件费原价",

&#x20;       "收区域派费补贴", "出港派件管理费", "网点装卸费",

&#x20;       "服务保障费", "会务费", "进港管理费",

&#x20;   ],

}

```



> 注：`现价`、`原价` 归入“运单基本信息”，与业务语义一致。



\### 6.3 字段触发规则



\- 导入后扫描表头，统计命中 `PREDEFINED\_FIELDS` 的字段数。

\- 命中数 ≥ 10 时，启用“固定规则”与“五类分类导航”。

\- 命中数 < 10 时，仅启用自由分析，不显示固定规则入口。



\### 6.4 Dataset



```python

class ColumnMeta:

&#x20;   name: str

&#x20;   dtype: Literal\["number", "string", "date", "bool"]

&#x20;   category: str | None       # 五类之一，未命中为 None

&#x20;   is\_predefined: bool



class Dataset:

&#x20;   id: str                    # uuid

&#x20;   name: str                  # 来源文件名

&#x20;   source\_path: str

&#x20;   sheet\_name: str | None

&#x20;   columns: list\[ColumnMeta]

&#x20;   row\_count: int

&#x20;   col\_count: int

&#x20;   created\_at: datetime

&#x20;   # DataFrame 不放入此对象，由 DatasetCache 管理

```



\### 6.5 AnalysisConfig



```python

class TimeRange:

&#x20;   start: date

&#x20;   end: date

&#x20;   field: str = "账单时间"



class FilterCondition:

&#x20;   field: str

&#x20;   op: Literal\["eq", "ne", "gt", "ge", "lt", "le", "in", "not\_in", "contains"]

&#x20;   value: Any



class FilterGroup:

&#x20;   logic: Literal\["AND", "OR"] = "AND"

&#x20;   conditions: list\[FilterCondition]



class GroupByField:

&#x20;   field: str

&#x20;   time\_granularity: Literal\["day"] | None = None



class Metric:

&#x20;   id: str

&#x20;   field: str

&#x20;   agg: Literal\["sum", "avg", "max", "min", "median", "count"]

&#x20;   alias: str



class DerivedMetric:

&#x20;   id: str

&#x20;   expression: str            # 引用 Metric.id，如 "m1 / m2"

&#x20;   alias: str



class RatioMode:

&#x20;   id: str

&#x20;   name: str                  # "a" / "b" / "c" / "d" / "custom"

&#x20;   numerator\_fields: list\[str]

&#x20;   denominator\_fields: list\[str]

&#x20;   metric\_id: str

&#x20;   alias: str



class OutputConfig:

&#x20;   type: Literal\["table", "chart"]

&#x20;   table\_format: Literal\["xlsx", "xls", "csv"] | None

&#x20;   chart: "ChartConfig | None"



class AnalysisConfig:

&#x20;   dataset\_id: str

&#x20;   time\_range: TimeRange

&#x20;   filters: FilterGroup

&#x20;   group\_by: list\[GroupByField]

&#x20;   metrics: list\[Metric]

&#x20;   derived\_metrics: list\[DerivedMetric]

&#x20;   ratios: list\[RatioMode]

&#x20;   output: OutputConfig

```



\### 6.6 ChartConfig



```python

class ChartConfig:

&#x20;   chart\_type: Literal\["line", "bar", "column", "pie"]   # scatter 已于 2026-10-30 下线

&#x20;   x\_axis: str | None

&#x20;   y\_axis: str | None

&#x20;   series: str | None

&#x20;   show\_fields: list\[str]

&#x20;   sort\_by: Literal\["x", "y", "custom"] = "x"

&#x20;   sort\_order: Literal\["asc", "desc"] = "asc"

&#x20;   top\_n: int | None = None

&#x20;   palette: str = "default"

&#x20;   title: str = ""

&#x20;   show\_legend: bool = True

&#x20;   show\_data\_labels: bool = False

&#x20;   time\_granularity: Literal\["day", "month", "quarter", "year"] | None = None

```



\### 6.7 RegressionConfig



```python

class RegressionInput:

&#x20;   mode: Literal\["manual", "from\_table"]

&#x20;   # manual

&#x20;   p: float | None                # 转运费现价

&#x20;   p0: float | None               # 转运费原价

&#x20;   discount: float | None         # 折扣

&#x20;   extra\_fee: float = 0.0         # 杂费 B

&#x20;   unit\_cost: float               # 操作单位成本 C（必填）

&#x20;   volume\_min: float = 0.0        # 货量下限

&#x20;   volume\_max: float              # 货量上限（必填）

&#x20;   # from\_table

&#x20;   dataset\_id: str | None

&#x20;   # 输出

&#x20;   baseline\_price: float          # 盈利基线 P（手动输入或从表格计算的 P）



class RegressionResult:

&#x20;   volume\_axis: list\[float]

&#x20;   critical\_price: list\[float]    # P\_critical = C - B/Z

&#x20;   baseline\_price: float          # 水平线

&#x20;   profit\_curve: list\[float]      # L = (P - C) \* Z + B

&#x20;   break\_even\_volume: float | None

```



\---



\## 7. 核心模块设计



\### 7.1 文件导入（`io/importer.py`）



\*\*职责\*\*：读取 xlsx / xls / csv，返回 `Dataset` + pandas DataFrame。



\*\*规则\*\*：



\- xlsx：`openpyxl`，只读第一个 Sheet；若有多 Sheet，返回警告信息。

\- xls：`xlrd==1.2.0`，只读第一个 Sheet；行数 > 65536 时返回错误。

\- csv：`pandas.read\_csv`，自动检测编码（chardet），失败时尝试 utf-8 → gbk → gb18030。

\- 表头：第一行作为列名，去除首尾空格。

\- 空列名：自动命名为 `列1`、`列2`……

\- 重复列名：自动追加 `\_2`、`\_3`……

\- 类型推断：每列尝试转数值，失败则保留字符串；日期列尝试解析为 datetime。



\*\*函数签名\*\*：



```python

def import\_file(path: str, encoding: str | None = None) -> ImportResult: ...



@dataclass

class ImportResult:

&#x20;   dataset: Dataset

&#x20;   dataframe: pd.DataFrame

&#x20;   warnings: list\[str]

&#x20;   errors: list\[str]

```



\### 7.2 字段注册表（`data/field\_registry.py`）



\*\*职责\*\*：维护预定义字段、五类分类、固定规则，并提供检测函数。



```python

class FieldRegistry:

&#x20;   def detect\_predefined(self, columns: list\[str]) -> list\[str]: ...

&#x20;   def categorize(self, field: str) -> str | None: ...

&#x20;   def get\_missing\_fields(self, rule\_name: str, columns: list\[str]) -> list\[str]: ...

&#x20;   def is\_rule\_available(self, rule\_name: str, columns: list\[str]) -> bool: ...

```



\### 7.3 计算引擎（`compute/engine.py`）



\*\*职责\*\*：根据 `AnalysisConfig` 执行计算，返回结构化结果。



\*\*执行顺序\*\*：



1\. 校验配置（字段存在性、时间范围、聚合合法性）。

2\. 应用筛选条件。

3\. 应用时间范围筛选。

4\. 按 `group\_by` 分组。

5\. 计算 `metrics` 聚合。

6\. 计算 `derived\_metrics` 派生指标。

7\. 计算 `ratios` 占比列。

8\. 排序、Top N。

9\. 返回 `ComputeResult`。



```python

def execute(config: AnalysisConfig, df: pd.DataFrame) -> ComputeResult: ...



@dataclass

class ComputeResult:

&#x20;   columns: list\[str]

&#x20;   rows: list\[list\[Any]]

&#x20;   row\_count: int

&#x20;   meta: dict                # 包含分组维度、指标别名等

```



\### 7.4 固定规则（`compute/fixed\_rules.py`）



```python

FIXED\_RULES = {

&#x20;   "网点货量分析": {

&#x20;       "required\_fields": \[

&#x20;           "账单时间", "寄件所属一级网点", "目的所属省份",

&#x20;           "公斤段", "物品来源", "是否剔除", "结算重量",

&#x20;       ],

&#x20;       "group\_by": \[

&#x20;           "账单时间", "寄件所属一级网点", "目的所属省份",

&#x20;           "公斤段", "物品来源", "是否剔除",

&#x20;       ],

&#x20;       "metrics": \[

&#x20;           {"field": "结算重量", "agg": "sum", "alias": "货量"},

&#x20;       ],

&#x20;   },

&#x20;   "网点单公斤价格分析": {

&#x20;       "required\_fields": \[

&#x20;           "账单时间", "寄件所属一级网点", "目的所属省份",

&#x20;           "公斤段", "物品来源", "是否剔除", "现价", "结算重量",

&#x20;       ],

&#x20;       "group\_by": \[

&#x20;           "账单时间", "寄件所属一级网点", "目的所属省份",

&#x20;           "公斤段", "物品来源", "是否剔除",

&#x20;       ],

&#x20;       "metrics": \[

&#x20;           {"field": "现价", "agg": "sum", "alias": "现价合计"},

&#x20;           {"field": "结算重量", "agg": "sum", "alias": "货量"},

&#x20;       ],

&#x20;       "derived\_metrics": \[

&#x20;           {"expression": "现价合计 / 货量", "alias": "单公斤价格"},

&#x20;       ],

&#x20;   },

&#x20;   "网点折扣分析": {

&#x20;       "required\_fields": \[

&#x20;           "账单时间", "寄件所属一级网点", "目的所属省份",

&#x20;           "公斤段", "现价", "原价", "物品来源", "是否剔除",

&#x20;           "产品类型", "订单来源",

&#x20;       ],

&#x20;       "group\_by": \[

&#x20;           "账单时间", "寄件所属一级网点", "目的所属省份",

&#x20;           "公斤段", "物品来源", "是否剔除",

&#x20;       ],

&#x20;       "metrics": \[

&#x20;           {"field": "现价", "agg": "sum", "alias": "现价合计"},

&#x20;           {"field": "原价", "agg": "sum", "alias": "原价合计"},

&#x20;       ],

&#x20;       "derived\_metrics": \[

&#x20;           {"expression": "现价合计 / 原价合计", "alias": "折扣"},

&#x20;       ],

&#x20;   },

}

```



\*\*触发逻辑\*\*：



\- 点击固定规则时，检查 `required\_fields` 是否全部存在。

\- 缺少字段时，弹窗列出缺失字段，允许用户关闭弹窗继续自定义。

\- 满足时，自动填充 `group\_by`、`metrics`、`derived\_metrics`。



\### 7.5 占比计算（已砍掉，2026-10-25 用户决定）

> **本节的四种占比预设模式已从产品中移除**：后端 `compute/ratios.py`、`AnalysisConfig.ratios`、`ImportResponse.ratio_presets` 与前端占比入口/帮助文案全部删除。需要「占比」时用分析页指标连接符 `÷` 生成「计算结果」列（分子 ÷ 分母）。下方文字仅作历史记录，不要据此再实现该功能。



\*\*前置条件\*\*：表格至少包含 `账单时间`、`寄件所属一级网点`、`目的所属省份`、`公斤段`、`物品来源`、`是否剔除` 六个字段。



\*\*四种预设模式\*\*：



| 模式 | 分子分组维度 | 分母分组维度 | 指标 |

|---|---|---|---|

| a | 账单时间, 寄件所属一级网点 | 账单时间 | 结算重量求和 |

| b | 账单时间, 寄件所属一级网点, 目的所属省份 | 账单时间, 寄件所属一级网点 | 结算重量求和 |

| c | 账单时间, 寄件所属一级网点, 目的所属省份, 公斤段 | 账单时间, 寄件所属一级网点, 目的所属省份 | 结算重量求和 |

| d | 账单时间, 寄件所属一级网点, 公斤段 | 账单时间, 寄件所属一级网点 | 结算重量求和 |



\*\*通用公式\*\*：



```

ratio = sum(metric | numerator\_fields) / sum(metric | denominator\_fields)

```



\*\*实现\*\*：



```python

def compute\_ratio(

&#x20;   df: pd.DataFrame,

&#x20;   metric\_field: str,

&#x20;   numerator\_fields: list\[str],

&#x20;   denominator\_fields: list\[str],

&#x20;   agg: str = "sum",

) -> pd.Series: ...

```



\- 分母维度必须是分子维度的子集。

\- 分母为 0 时留空。

\- 支持同时输出多列占比（每种模式生成一列）。



\### 7.6 时间维度（`compute/time\_dimension.py`）



\*\*职责\*\*：



\- 自动识别“账单时间”字段的时间跨度。

\- 校验用户选择的日期范围是否在跨度内。

\- 按天分组时，输出表中每天一行。

\- 图表分析时，按用户选择的时间粒度汇总。



\*\*规则\*\*：



\- 时间范围为必选项。

\- 开始日期与结束日期相同表示单日。

\- 日期解析失败的行归入“未知日期”组，并在结果中提示。

\- 无“账单时间”字段时，允许分析，但固定规则不可用。



\### 7.7 线性回归拟合（`compute/regression.py`）



\*\*输入参数\*\*：



| 参数 | 说明 | 必填 |

|---|---|---|

| P | 转运费现价（元/kg） | 二选一 |

| P0 | 转运费原价（元/kg） | 二选一 |

| d | 折扣 | 二选一 |

| B | 杂费（元） | 否，默认 0 |

| C | 操作单位成本（元/kg） | 是 |

| Z | 货量（kg） | 是 |



\*\*公式\*\*：



```

d = P / P0                              # 若填 P、P0 自动计算

A = Z \* P0 \* d + B                      # 总收入

L = (P - C) \* Z + B                     # 利润

P\_critical = C - B / Z                  # 临界转运费现价

break\_even\_volume = B / (C - P)         # 盈亏平衡货量（P < C 时有效）

```



\*\*从表格取数\*\*：



\- 必须包含 `转运费`、`转运费原价`、`收寄站操作费`、`收寄站操作费原价` 四个字段。

\- `P = 转运费 + 收寄站操作费`

\- `P0 = 转运费原价 + 收寄站操作费原价`

\- `d = P / P0`

\- 弹窗提醒用户补充 `B`、`C`、`Z`。



\*\*输出\*\*：



\- 折线图：X 轴货量 Z，Y 轴 P\_critical，蓝线为临界曲线，红线为盈利基线 P。

\- 数字表格：各货量点对应的 P\_critical、L。



\### 7.8 图表构建（`chart/builder.py`）



\*\*图表类型与字段映射\*\*：



| 类型 | X 轴 | Y 轴 | 系列 | 限制 |

|---|---|---|---|---|

| line | 分类/时间 | 数值 | 可选 | X 轴有序 |

| bar | 分类 | 数值 | 可选 | 类别 ≤ 50 |

| column | 分类 | 数值 | 可选 | 同 bar |

| pie | 标签 | 数值 | 无 | 值非负 |

> 散点图（scatter）已于 2026-10-30 按用户要求下线：分析界面与「网点对比图表」都不再提供入口，
> 后端 schema 也拒绝 `scatter`；老项目快照里的散点配置按折线读回。饼图导出的辅助线/标签排版见 `HANDOVER_PLAN.md` §21。



\*\*数据来源\*\*：分析结果表（聚合后），不是原始数据。



\*\*导出\*\*：



\- PDF：matplotlib 渲染为矢量，嵌入思源黑体，白底，2x 或 300 DPI。

\- JPEG：matplotlib 渲染为位图，分辨率 300 DPI，白底。



\### 7.9 文件导出（`io/exporter.py`）



| 格式 | 库 | 限制 |

|---|---|---|

| xlsx | openpyxl | 1,048,576 行 × 16,384 列 |

| xls | xlwt | 65,536 行 × 256 列；超限时禁用并提示 |

| csv | pandas | UTF-8 with BOM |

| pdf | reportlab / matplotlib | 仅图表 |

| jpeg | matplotlib | 仅图表 |



\### 7.10 项目与历史存储（`storage/`）



\*\*项目存储\*\*：



\- 项目元数据存 SQLite：`\~/.accounting-workbench/projects.db`

\- 项目数据缓存存 parquet：`\~/.accounting-workbench/projects/<project\_id>/data.parquet`

\- 分析结果缓存存 JSON：`\~/.accounting-workbench/projects/<project\_id>/result.json`

\- 删除项目时，同时删除缓存目录。

\- 数据缓存语义：`datasets/<dataset_id>.parquet` = 导入原始快照（只读，reset 来源）；内存工作副本 = 编辑态；`projects/<project_id>/data.parquet` = 保存后的当前状态。



\*\*项目元数据结构\*\*：



```sql

CREATE TABLE projects (

&#x20;   id TEXT PRIMARY KEY,

&#x20;   name TEXT NOT NULL,

&#x20;   creator TEXT NOT NULL,

&#x20;   created\_at TEXT NOT NULL,

&#x20;   updated\_at TEXT NOT NULL,

&#x20;   source\_path TEXT,

&#x20;   source\_type TEXT,

&#x20;   row\_count INTEGER,

&#x20;   col\_count INTEGER,

&#x20;   analysis\_config TEXT,

&#x20;   has\_result INTEGER DEFAULT 0

);

```



\*\*历史记录\*\*：



\- 工具栏“历史记录”悬停下拉最近 5 个项目。

\- “更多历史记录”打开历史窗口。

\- 支持项目名、创建人模糊索引，创建时间范围索引。

\- 每页 8 个项目，底部翻页。



\*\*项目合并\*\*：



\- 入口：历史记录 → 多选 → 合并项目；或工具栏项目 → 项目管理。

\- 字段名精确匹配（去除首尾空格）。

\- 不同名字段各占一列。

\- 字段顺序以字段数最多的项目为准。

\- 字段数相同时，以用户选择的“基准项目”为准（默认创建时间最早）。

\- 数据行按项目字段数从多到少排序，字段多的项目数据在上。

\- 合并结果不自动添加来源列，但预览中显示来源。



\---



\## 8. 前后端通信协议



\### 8.1 启动流程



1\. Tauri 启动时 spawn Python sidecar。

2\. Python 启动 FastAPI，监听 `127.0.0.1:0`（随机端口）。

3\. Python 输出 `PORT=<port>` 到 stdout。

4\. Tauri 捕获端口，存入全局状态。

5\. 前端通过 `invoke("get\_backend\_port")` 获取端口。



\### 8.2 API 约定



\- 基础路径：`/api`

\- 请求/响应：JSON

\- 错误响应：



```json

{

&#x20; "error": {

&#x20;   "code": "MISSING\_FIELDS",

&#x20;   "message": "缺少字段：现价、原价",

&#x20;   "details": {"missing": \["现价", "原价"]}

&#x20; }

}

```



\### 8.3 主要接口



| 方法 | 路径 | 说明 |

|---|---|---|

| POST | `/api/projects` | 新建项目 |

| GET | `/api/projects` | 列出项目 |

| GET | `/api/projects/{id}` | 获取项目 |

| PATCH | `/api/projects/{id}` | 保存项目 |

| DELETE | `/api/projects/{id}` | 删除项目 |

| POST | `/api/projects/merge` | 合并项目 |

| POST | `/api/import` | 导入文件 |

| GET | `/api/dataset/{id}/preview` | 预览数据 |

| GET | `/api/dataset/{id}/time-range` | 自动识别时间字段与 min~max 日期（优先「账单时间」，否则第一个日期列；识别不出返回全 null，第 11 轮新增） |

| PATCH | `/api/dataset/{id}` | 编辑数据（编辑指令协议：单元格/粘贴/剪切/行列增删/撤销/重做/重置） |

| POST | `/api/values` | 字段候选取值（可按时间范围收窄；传 `parent_field` + `child_field` 时另返回「父值 → 子值集合」级联映射，第 11 轮新增） |

| POST | `/api/compute` | 执行分析 |

| POST | `/api/board` | 一键算看板（汇总 / 货物流向 / 公斤段折扣 / 公斤段单价 / 网点对比图表） |

| POST | `/api/board/sources` | 一键算维度的候选取值（网点、省份、是否剔除、物品来源） |

| POST | `/api/board/export/chart-folder` | 一键算图表导出文件夹：1 张合并大图 + N 张拆分小图（N = 分组行数，不截断；2026-10-29 新增） |

| POST | `/api/chart/render` | 渲染图表 |

| POST | `/api/export` | 导出文件 |

| POST | `/api/regression/manual` | 盈亏平衡：手动测算 |

| POST | `/api/regression/table` | 盈亏平衡：表格取数（`dims` + `picks` 笛卡尔积；带 `cascade` 时按「省份 → 该省勾选的公斤段」展开，第 11 轮新增） |

| POST | `/api/regression/export/table` | 盈亏平衡导出文件夹（PDF + 小图网格 + 每张卡片一张单图 + 汇算明细 xlsx） |

| POST | `/api/regression/export/manual` | 手动测算导出文件夹 |

| GET | `/api/settings` | 获取设置 |

| PATCH | `/api/settings` | 更新设置 |



\---



\## 9. UI 规范



\### 9.1 设计原则



参考 Apple Human Interface Guidelines：



\- 层级清晰：工具栏 → 主内容区 → 状态栏

\- 留白充足：最小间距 8px，常用 16px / 24px

\- 圆角统一：按钮 6px，卡片 10px，弹窗 12px

\- 阴影柔和：`0 1px 3px rgba(0,0,0,0.08)`

\- 动效克制：过渡 150-200ms，ease-out



\### 9.2 字体



```css

\--font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text",

&#x20;              "PingFang SC", "Segoe UI", "Microsoft YaHei",

&#x20;              "Source Han Sans SC", "Noto Sans CJK SC", sans-serif;

```



\- macOS：SF Pro + PingFang SC

\- Windows：Segoe UI + Microsoft YaHei

\- 导出 PDF：思源黑体（随应用打包）



\### 9.3 颜色（浅色主题）



```css

\--color-bg: #ffffff;

\--color-bg-secondary: #f5f5f7;

\--color-text: #1d1d1f;

\--color-text-secondary: #6e6e73;

\--color-border: #d2d2d7;

\--color-primary: #0071e3;

\--color-primary-hover: #0077ed;

\--color-danger: #ff3b30;

\--color-success: #34c759;

\--color-warning: #ff9500;

```



\### 9.4 颜色（深色主题）



```css

\--color-bg: #1c1c1e;

\--color-bg-secondary: #2c2c2e;

\--color-text: #f5f5f7;

\--color-text-secondary: #98989d;

\--color-border: #38383a;

\--color-primary: #0a84ff;

\--color-danger: #ff453a;

```



\### 9.5 间距



```

\--space-xs: 4px;

\--space-sm: 8px;

\--space-md: 16px;

\--space-lg: 24px;

\--space-xl: 32px;

```



\### 9.6 圆角



```

\--radius-sm: 6px;

\--radius-md: 10px;

\--radius-lg: 12px;

```



\### 9.7 组件规范



\- \*\*Button\*\*：主按钮蓝色填充，次按钮白底描边，危险按钮红色。

\- \*\*Modal\*\*：居中，最大宽 720px，遮罩 `rgba(0,0,0,0.4)`。

\- \*\*Dropdown\*\*：点击展开，悬停高亮，选中项左侧打勾。

\- \*\*Toast\*\*：右上角，1.5s 自动淡出。

\- \*\*DataGrid\*\*：表头灰底，行高 28px，选中行蓝色浅底。



\---



\## 10. 页面与交互流程



\### 10.1 顶层结构



```

┌──────────────────────────────────────────┐

│  工具栏：文件 设置 历史记录 高级计算 项目 帮助  │

├──────────────────────────────────────────┤

│                                          │

│              主内容区                     │

│                                          │

└──────────────────────────────────────────┘

```



\### 10.2 工具栏菜单



| 菜单 | 悬停下拉 |

|---|---|

| 文件 | 导入 Excel 文件、导入 CSV 文件、保存 |

| 设置 | 字体增大、字体缩小、深色主题、浅色主题 |

| 历史记录 | 最近 5 个项目、更多历史记录 |

| 高级计算 | 线性回归拟合 |

| 项目 | 项目管理 |

| 帮助 | 软件说明文档 |



\### 10.3 向导流程



```

引导页 → 新建项目 → 导入页 → 分析窗口 → 预览页 → 导出

```



\*\*引导页\*\*：



居中显示 6 段灰色斜体文字：



```

点击或 Ctrl+Shift+N 创建新项目

将文件拖到此处创建新项目

Ctrl+Shift+K 分析数据

Ctrl+S 保存项目

请将数据格式（公式、条件格式、颜色填充等）清洗后导入

支持 xlsx、xls、csv 文件

```



\*\*新建项目弹窗\*\*：



\- 项目名（必填）

\- 创建人（必填，第二次起自动补全）

\- 创建时间（自动，不可改，YYYY-MM-DD HH:MM:SS）

\- 文件导入路径（粘贴或浏览，拖入时自动补全）

\- 确定（蓝色）/ 取消



\*\*导入页\*\*：



\- 表格界面，上方：后退一步、向前一步、重置、分析

\- 列名 A/B/C…AA/AB…（列数不设上限）

\- 行号 1/2/3…（行数不设上限）

\- 支持行列的选中、删除、复制、剪切、插入

\- 右键菜单：剪切、复制、粘贴、插入、删除、分析



\*\*分析窗口\*\*：



\- 上方：输出方式（数字表格 / 图表，二选一）

\- 中间：时间范围选择器（日历 + 手动输入）

\- 字段选择区：初始 1 行 5 个，点击 + 增加一行，最多 8 行 40 个

\- 每行：字段下拉 + 分析方法下拉 + 删除按钮（红色 ×）

\- 分析方法：筛选、求和、平均值、最大值、最小值、中位数、计数

\- 固定规则入口：二级菜单

\- 占比配置区

\- 底部：开始（蓝色）、取消、帮助



\*\*预览与导出页\*\*：



\- 数字表格：表格预览，保存 / 取消 / 导出

\- 图表：图表类型、颜色、显示内容、X 轴、Y 轴、系列、排序、Top N

\- 底部：保存 / 取消 / 导出



\### 10.4 快捷键



| 快捷键 | 功能 |

|---|---|

| `mod+Shift+N` | 新建项目 |

| `mod+Shift+K` | 分析数据 |

| `mod+S` | 保存项目 |

| `mod+Z` | 撤销 |

| `mod+Y` | 重做（仅表格编辑） |

| `mod+A` | 选中全部数据区域 |

| `mod+C / X / V` | 复制 / 剪切 / 粘贴 |



`mod` 在 macOS 为 `Cmd`，Windows 为 `Ctrl`。



\---



\## 11. 编码规范



\### 11.1 Python



\- 遵循 PEP 8。

\- 使用类型注解（`from \_\_future\_\_ import annotations`）。

\- 使用 `pydantic` 定义 schema。

\- 使用 `dataclasses` 定义内部数据类。

\- 函数单一职责，长度 ≤ 50 行。

\- 禁止在 Core 层访问文件系统或网络。

\- 所有公开函数必须有 docstring。

\- 错误使用自定义异常 `AccountingError`，禁止裸 `raise Exception`。



\### 11.2 TypeScript



\- 严格模式（`strict: true`）。

\- 禁止 `any`，必要时用 `unknown` + 类型守卫。

\- 组件使用函数式 + Hooks。

\- 状态管理用 Zustand，禁止在组件内直接调 API。

\- API 调用统一走 `api/` 层。

\- 样式用 CSS Modules，禁止内联大段样式。



\### 11.3 命名



| 类型 | 约定 | 示例 |

|---|---|---|

| Python 类 | PascalCase | `AnalysisConfig` |

| Python 函数 | snake\_case | `compute\_ratio` |

| Python 常量 | UPPER\_SNAKE | `PREDEFINED\_FIELDS` |

| TS 组件 | PascalCase | `AnalysisWindow` |

| TS 函数 | camelCase | `fetchProjects` |

| TS 类型 | PascalCase | `AnalysisConfig` |

| CSS 变量 | kebab-case | `--color-primary` |

| 文件名（Python） | snake\_case | `fixed\_rules.py` |

| 文件名（TS） | PascalCase 或 camelCase | `DataGrid.tsx` / `client.ts` |



\---



\## 12. 开发路线图



| 阶段 | 交付物 | 验收标准 |

|---|---|---|

| P0 骨架 | Tauri + React + FastAPI sidecar 跑通 | 前端能调用后端 `/api/health` |

| P1 导入 | xlsx/xls/csv 导入 + 表格预览 | 10 万行数据可滚动，无卡顿 |

| P2 字段 | 字段识别 + 五类分类 + 固定规则入口 | 缺少字段时弹窗正确 |

| P3 计算 | 筛选、分组、聚合、派生指标 | 固定规则结果与手工 Excel 一致 |

| P4 占比（已砍掉 2026-10-25） | ~~四种占比模式 + 多列输出~~ | 用分析页 `÷` 连接符出「计算结果」列 |

| P5 时间 | 时间范围选择 + 按天分组 | 单日、跨日、未知日期均正确 |

| P6 图表 | ECharts 预览 + 导出 PDF/JPEG | 中文字体正常，矢量优先 |

| P7 导出 | xlsx/xls/csv 导出 | xls 超限时禁用 |

| P8 项目 | 新建、打开、删除、合并 | 合并结果列顺序正确 |

| P9 历史 | 历史记录窗口 + 模糊索引 | 分页、索引、删除均正确 |

| P10 回归 | 线性回归拟合 + 折线图 | 公式与手工计算一致 |

| P11 设置 | 字体、主题 | 持久化，重启后保留 |

| P12 打包 | PyInstaller + Tauri 打包 | 用户无需安装任何运行时 |



\---



\## 13. Codex 工作指令



\### 13.1 生成代码前



1\. 阅读本文件第 4、5、6、7 章。

2\. 确认目标模块的职责边界。

3\. 确认数据模型与函数签名。

4\. 若发现需求冲突，停止并输出问题。



\### 13.2 生成代码时



1\. 遵循目录结构，禁止新建未定义的顶层目录。

2\. 遵循命名约定。

3\. 每个函数必须单一职责。

4\. 必须处理空值、类型错误、边界条件。

5\. 必须添加 docstring 或注释说明非显然逻辑。



\### 13.3 生成代码后



1\. 自检是否符合第 14 章“禁止事项”。

2\. 自检是否与已有模块冲突。

3\. 自检是否覆盖错误路径。

4\. 输出变更清单与验证方式。



\---



\## 14. 禁止事项



1\. \*\*禁止\*\*在前端保存完整数据集（超过 1000 行）。

2\. \*\*禁止\*\*在 Core 层访问文件系统或网络。

3\. \*\*禁止\*\*在 Routers 层写业务逻辑。

4\. \*\*禁止\*\*使用 `any`（TypeScript）或裸 `Exception`（Python）。

5\. \*\*禁止\*\*硬编码文件路径，必须通过 `storage/paths.py` 获取。

6\. \*\*禁止\*\*在计算中使用浮点数直接比较相等。

7\. \*\*禁止\*\*在导出 PDF 时忽略中文字体嵌入。

8\. \*\*禁止\*\*在 xls 导出超过 65,536 行时不提示。

9\. \*\*禁止\*\*在项目删除时不删除缓存目录。

10\. \*\*禁止\*\*在分析配置未确认时执行计算。

11\. \*\*禁止\*\*在固定规则字段缺失时静默降级。

12\. \*\*禁止\*\*在派生指标（`÷` 计算）分母为 0 时输出 `inf` 或 `NaN`，必须留空。

13\. \*\*禁止\*\*在图表导出时使用非白底（除非用户显式选择）。

14\. \*\*禁止\*\*引入未在本文件第 3 章列出的第三方库。

15\. \*\*禁止\*\*修改本文件未定义的 API 路径。



\---



\## 15. 验证方式



\### 15.1 后端



```bash

cd backend

pytest tests/ -v

```



\### 15.2 前端



```bash

npm run typecheck

npm run lint

npm run test

```



\### 15.3 集成



```bash

\# 启动开发环境

./scripts/dev.sh



\# 验证清单

\# 1. 导入 xlsx / xls / csv 各一份

\# 2. 使用固定规则“网点货量分析”计算

\# 3. ~~使用占比模式 c 计算~~（已砍掉，改测分析页 ÷ 连接符）

\# 4. 导出 xlsx / csv

\# 5. 导出图表 PDF / JPEG

\# 6. 新建、打开、删除、合并项目

\# 7. 切换深色主题

\# 8. 线性回归拟合

```



\### 15.4 打包



```bash

./scripts/build.sh

./scripts/release.sh

```



\---



\## 16. 附录：关键公式汇总



| 公式 | 说明 |

|---|---|

| `d = P / P0` | 折扣 |

| `A = Z \* P0 \* d + B` | 总收入 |

| `L = (P - C) \* Z + B` | 利润 |

| `P\_critical = C - B / Z` | 临界转运费现价 |

| `break\_even\_volume = B / (C - P)` | 盈亏平衡货量（P < C） |

| `ratio = sum(metric \\| numerator\_fields) / sum(metric \\| denominator\_fields)` | 占比 |

| `货量 = sum(结算重量)` | 网点货量分析指标 |

| `单公斤价格 = sum(现价) / sum(结算重量)` | 网点单公斤价格分析 |

| `折扣 = sum(现价) / sum(原价)` | 网点折扣分析 |



\---



\*\*本文件版本：v1.0\*\*  

\*\*最后更新：2026-10-06\*\*  

\*\*维护者：项目发起人\*\*

