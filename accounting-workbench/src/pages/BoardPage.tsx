import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";

import { exportBoardChartFolder } from "../api/board";
import { exportTableBytes, exportTableToPath } from "../api/export";
import { useEconStore } from "../stores/econStore";
import { useAnalysisStore } from "../stores/analysisStore";
import { useExportStore } from "../stores/exportStore";
import { presetRange } from "../utils/analysisRows";
import {
  BOARD_PALETTE as PALETTE,
  boardMetricValue,
  planBoardChartExport,
} from "../utils/boardChartExport";
import { boardExportBaseName, stampMinute, type BoardFeatureName } from "../utils/exportName";
import { boardSharePct, boardTotalVolume } from "../utils/boardSummary";
import { formatChartValue } from "../utils/numberFormat";
import { isTauri, pickDirectory, pickSavePath } from "../utils/platform";
import type { BoardCell, BoardResult, ComputeResult } from "../types/api";
import styles from "./BoardPage.module.css";

interface BoardPageProps {
  datasetId: string | null;
  onBack?: () => void;
}

/** 图表样式：散点图已于 2026-10-30（第 14 轮）按用户要求下线，别再放回来。 */
type ChartType = "line" | "bar" | "pie";
type CompareMetric = "volume" | "flow" | "discount" | "price";
type FeatureKey = "summary" | "flow" | "discount" | "price" | "compare";

/** 按钮顺序 = 汇总 | 货物流向 | 公斤段折扣 | 公斤段单价 …「网点对比图表」用 CSS 推到最右。 */
const FEATURES: Array<{ key: FeatureKey; label: string }> = [
  { key: "summary", label: "汇总" },
  { key: "flow", label: "货物流向" },
  { key: "discount", label: "公斤段折扣" },
  { key: "price", label: "公斤段单价" },
  { key: "compare", label: "网点对比图表" },
];

/** 每个功能块对应的「指标」名（拼导出文件名用；对比图表取勾选的对比指标）。 */
const FEATURE_METRIC: Record<Exclude<FeatureKey, "compare">, string> = {
  summary: "货量、折扣、单价",
  flow: "货量",
  discount: "折扣",
  price: "单价",
};

const COMPARE_METRICS: Array<{ key: CompareMetric; label: string; kind: "kg" | "pct" | "price" }> = [
  { key: "volume", label: "货物流向数据", kind: "kg" },
  { key: "flow", label: "货物流向占比", kind: "pct" },
  { key: "discount", label: "公斤段折扣", kind: "pct" },
  { key: "price", label: "公斤段单价", kind: "price" },
];

const CHART_TYPES: Array<{ key: ChartType; label: string }> = [
  { key: "line", label: "折线" },
  { key: "bar", label: "柱状" },
  { key: "pie", label: "饼图" },
];

const EXCL_OPTIONS = ["全部", "不剔除", "剔除"];
const SRC_OPTIONS = ["全部", "普通物品", "审报物品"];

/** 分组维度一级：只提供 网点 / 网点 × 省份（用户 2026-10-29 定稿）。
 *  老项目快照里的 dims=["省份"] 仍原样保留、照常出结果（后端保留该能力），
 *  只是下拉里没有这一项 → 两个 radio 都不勾，用户点一下即切到新维度。 */
const DIM_MODES: Array<{ key: string; label: string; dims: Array<"省份" | "网点"> }> = [
  { key: "网点", label: "网点", dims: ["网点"] },
  { key: "网点+省份", label: "网点 × 省份", dims: ["网点", "省份"] },
];

function dimsKey(dims: Array<"省份" | "网点">): string {
  if (dims.length >= 2) return "网点+省份";
  return dims[0] ?? "网点";
}

function kg(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

function pct(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

function fixed3(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toFixed(3);
}

function fixed4(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toFixed(4);
}

/** 单元格按指标取数（实现在 utils/boardChartExport.ts，导出与预览共用同一套口径）。 */
function metricValue(cell: BoardCell, rowVolume: number, metric: CompareMetric): number | null {
  return boardMetricValue(cell, rowVolume, metric);
}

function BoardPage({ datasetId, onBack }: BoardPageProps) {
  const board = useEconStore((state) => state.board);
  const sources = useEconStore((state) => state.sources);
  const values = useEconStore((state) => state.values);
  const loading = useEconStore((state) => state.loading);
  const error = useEconStore((state) => state.error);
  const runBoard = useEconStore((state) => state.runBoard);
  const loadSources = useEconStore((state) => state.loadSources);
  const loadValues = useEconStore((state) => state.loadValues);
  const inputs = useEconStore((state) => state.boardInputs);
  const setInputs = useEconStore((state) => state.setBoardInputs);
  const timeRange = useAnalysisStore((state) => state.timeRange);
  const setTimeRange = useAnalysisStore((state) => state.setTimeRange);
  const ensureDetectedRange = useAnalysisStore((state) => state.ensureDetectedRange);

  const [features, setFeatures] = useState<Set<FeatureKey>>(
    // 进入页面默认勾选前三块，「网点对比图表」默认不勾（界面太挤）
    () => new Set<FeatureKey>(["flow", "discount", "price"]),
  );
  const [compareMetrics, setCompareMetrics] = useState<Set<CompareMetric>>(
    () => new Set<CompareMetric>(["discount"]),
  );
  const [chartType, setChartType] = useState<ChartType>("line");
  const [split, setSplit] = useState(true);
  const [netPickerOpen, setNetPickerOpen] = useState(false);
  const [dimPickerOpen, setDimPickerOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportHint, setExportHint] = useState<string | null>(null);
  const [zoom, setZoom] = useState<{ title: string; option: EChartsOption } | null>(null);

  const { nets, exclude, source, dims, dimValues } = inputs;
  // 分析页没选日期时 timeRange 可能是空字符串，直接发请求会被后端判 422
  const timeStart = timeRange?.start?.trim() ? timeRange.start : "1970-01-01";
  const timeEnd = timeRange?.end?.trim() ? timeRange.end : "2999-12-31";
  const timeField = timeRange?.field?.trim() ? timeRange.field : "账单时间";
  const effectiveTimeRange = useMemo(
    () => ({ start: timeStart, end: timeEnd, field: timeField }),
    [timeStart, timeEnd, timeField],
  );

  const presets = useMemo(
    () => ({ 本月: presetRange("本月"), 上月: presetRange("上月") }),
    [],
  );
  /* 日期模式：默认「自定义」（第 11 轮 C：取消默认本月，范围由 /time-range 识别后预填）；
   * 点「本月 / 上月」才是那两个快捷区间（用户反馈 9 第 1 条：点「自定义」要能真的切过去）。 */
  const [rangeMode, setRangeMode] = useState<"本月" | "上月" | "自定义">("自定义");
  const isCustomRange = rangeMode === "自定义";

  /* 进页面取一次识别出的时间范围（带缓存，重复进页面不再打接口） */
  useEffect(() => {
    if (datasetId === null) return;
    void ensureDetectedRange(datasetId);
  }, [datasetId, ensureDetectedRange]);

  const allNets = useMemo(() => {
    const found = (values["寄件所属一级网点"] ?? []).filter((item) => item.trim() !== "");
    return found.length > 0 ? found : (sources?.nets ?? []);
  }, [values, sources]);

  const exclOptions = useMemo(() => {
    const found = (values["是否剔除"] ?? []).filter((item) => item.trim() !== "");
    return found.length > 0 ? ["全部", ...found] : EXCL_OPTIONS;
  }, [values]);

  const srcOptions = useMemo(() => {
    const found = (values["物品来源"] ?? []).filter((item) => item.trim() !== "");
    return found.length > 0 ? ["全部", ...found] : SRC_OPTIONS;
  }, [values]);

  useEffect(() => {
    if (datasetId === null) return;
    void loadValues(datasetId, ["是否剔除", "物品来源", "寄件所属一级网点"]);
  }, [datasetId, loadValues]);

  /* 数据里的取值和默认值（不剔除/普通物品）不一致时，落到「全部」，免得筛出空结果 */
  useEffect(() => {
    if (!exclOptions.includes(exclude)) setInputs({ exclude: exclOptions[0] ?? "全部" });
  }, [exclOptions, exclude, setInputs]);

  useEffect(() => {
    if (!srcOptions.includes(source)) setInputs({ source: srcOptions[0] ?? "全部" });
  }, [srcOptions, source, setInputs]);

  useEffect(() => {
    if (datasetId === null) return;
    void loadSources({ dataset_id: datasetId, nets, exclude, source });
  }, [datasetId, nets, exclude, source, loadSources]);

  const requestSignature = JSON.stringify([datasetId, timeStart, timeEnd, timeField, nets, exclude, source, dims, dimValues]);
  const request = useMemo(
    () =>
      datasetId === null
        ? null
        : {
            dataset_id: datasetId,
            time_range: { start: timeStart, end: timeEnd, field: timeField },
            nets,
            // 「全部」= 不加这一层过滤（后端拿到空串就不筛）
            exclude: exclude === "全部" ? "" : exclude,
            source: source === "全部" ? "" : source,
            dims,
            dim_values: dimValues,
          },
    [datasetId, timeStart, timeEnd, timeField, nets, exclude, source, dims, dimValues],
  );

  /* 勾选即重算（原型行为）：用签名去重，避免同参数反复请求导致界面抖动 */
  const lastSignature = useRef("");
  useEffect(() => {
    if (request === null) return;
    if (requestSignature === lastSignature.current) return;
    const timer = window.setTimeout(() => {
      lastSignature.current = requestSignature;
      void runBoard(request);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [request, requestSignature, runBoard]);

  const rows = board?.rows ?? [];
  const ordered = useMemo(
    () =>
      rows
        .map((row) => ({ row, volume: row.cells.reduce((sum, cell) => sum + cell.vol, 0) }))
        .sort((left, right) => right.volume - left.volume),
    [rows],
  );
  /* 分组行全部参与（用户 2026-10-29 定稿：29 组就画 29 组，不再截断前 6 个） */
  const picked = ordered;

  const activeMetrics = useMemo(() => {
    const chosen = COMPARE_METRICS.filter((item) => compareMetrics.has(item.key));
    return chosen.length > 0 ? chosen : COMPARE_METRICS.filter((item) => item.key === "discount");
  }, [compareMetrics]);
  const hasAbsolute = activeMetrics.some((item) => item.kind === "kg");
  const mixed = hasAbsolute && activeMetrics.some((item) => item.kind !== "kg");

  const netsLabel =
    board === null
      ? "—"
      : board.rows.length === 1
        ? board.rows[0].label
        : `${board.rows.length} 组 · ${board.dim_label}`;

  /** 二级取值跟着一级维度走（省份 → 省份取值；网点/网点×省份 → 网点取值）。 */
  const valueDim = dims[dims.length - 1] ?? "省份";

  function toggleFeature(key: FeatureKey): void {
    setFeatures((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size === 1) return prev; // 至少留一项
        next.delete(key);
        return next;
      }
      if (key === "compare") {
        // 点「网点对比图表」时自动取消其余块（用户反馈 9）
        return new Set<FeatureKey>(["compare"]);
      }
      if (key === "summary") {
        // 汇总 = 三块合并的总表，与三块互斥（用户 2026-10-29 定稿）
        return new Set<FeatureKey>(["summary"]);
      }
      next.delete("compare");
      next.delete("summary");
      next.add(key);
      return next;
    });
  }

  function toggleCompareMetric(key: CompareMetric): void {
    setCompareMetrics((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size === 1) return prev; // 至少留一个
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function seriesFor(entry: { row: BoardResult["rows"][number]; volume: number }, entryIndex: number) {
    return activeMetrics.map((metric, metricIndex) => ({
      name: `${entry.row.label} · ${metric.label}`,
      color: PALETTE[(entryIndex * activeMetrics.length + metricIndex) % PALETTE.length],
      values: entry.row.cells.map((cell) => metricValue(cell, entry.volume, metric.key)),
    }));
  }

  const axisOption = useCallback(
    (series: Array<{ name: string; color: string; values: Array<number | null> }>): EChartsOption => {
      const absolute = hasAbsolute;
      return {
        grid: { left: 70, right: 20, top: 34, bottom: 48 },
        // 千以上的数值一律千分位（1,000 / 10,000），不再用「万」缩写（用户 2026-10-29 定稿）
        tooltip: { trigger: "axis", valueFormatter: formatChartValue },
        legend: { show: false },
        xAxis: {
          type: "category",
          data: board?.bands ?? [],
          boundaryGap: chartType === "bar",
          name: "公斤段",
          nameTextStyle: { fontSize: 10 },
          axisLabel: { fontSize: 10 },
        },
        yAxis: {
          type: "value",
          name: absolute ? "结算重量（kg）" : "比率 / 单价",
          nameTextStyle: { fontSize: 10 },
          axisLabel: {
            fontSize: 10,
            formatter: formatChartValue,
          },
        },
        series: series.map((item) => ({
          name: item.name,
          type: chartType === "bar" ? "bar" : "line",
          showSymbol: chartType !== "bar",
          symbolSize: 5,
          itemStyle: { color: item.color },
          lineStyle: { width: 2, color: item.color },
          data: item.values,
        })),
      };
    },
    [board, chartType, hasAbsolute],
  );

  const mergedOption = useMemo<EChartsOption>(() => {
    if (board === null) return {};
    const series = picked.flatMap((entry, index) => seriesFor(entry, index));
    return axisOption(series);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, picked, axisOption, activeMetrics]);

  const singleOption = useCallback(
    (entry: { row: BoardResult["rows"][number]; volume: number }, index: number): EChartsOption =>
      axisOption(seriesFor(entry, index)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [axisOption, activeMetrics, chartType],
  );

  const pieOption = useMemo<EChartsOption>(() => {
    if (board === null) return {};
    return {
      tooltip: {
        trigger: "item",
        // 饼图的 {c} 是原始数字：走同一个格式化器，千以上带千分位
        formatter: (params: unknown): string => {
          const item = params as { name?: string; value?: unknown; percent?: number };
          const value = typeof item.value === "number" ? formatChartValue(item.value) : "—";
          const percent = typeof item.percent === "number" ? item.percent.toFixed(1) : "0.0";
          return `${item.name ?? ""}：${value}（${percent}%）`;
        },
      },
      legend: { show: false },
      series: [
        {
          type: "pie",
          radius: "58%",
          center: ["50%", "54%"],
          label: { formatter: "{b} {d}%", fontSize: 11 },
          labelLine: { length: 12, length2: 14 },
          data: picked.map((entry, index) => ({
            name: entry.row.label,
            value: Math.round(entry.volume),
            itemStyle: { color: PALETTE[index % PALETTE.length] },
          })),
        },
      ],
    };
  }, [board, picked]);

  const legendItems = useMemo(() => {
    if (chartType === "pie") {
      const total = picked.reduce((sum, entry) => sum + entry.volume, 0) || 1;
      return picked.map((entry, index) => ({
        color: PALETTE[index % PALETTE.length],
        label: `${entry.row.label} ${((entry.volume / total) * 100).toFixed(1)}%`,
      }));
    }
    if (split) {
      return picked.map((entry, index) => ({
        color: PALETTE[(index * activeMetrics.length) % PALETTE.length],
        label: entry.row.label,
      }));
    }
    return picked.flatMap((entry, index) =>
      seriesFor(entry, index).map((series) => ({ color: series.color, label: series.name })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartType, split, picked, activeMetrics]);

  /* ── 导出：当前视图 / 全部功能 ── */

  function longTable(allFeatures: boolean): ComputeResult | null {
    if (board === null) return null;
    // 汇总 = 三块拼在一起，功能名列写「汇总」（用户 2026-10-29 定稿：xlsx/csv 要能导汇总）
    const wantsSummary = !allFeatures && features.has("summary");
    const keys: Array<"flow" | "discount" | "price"> = allFeatures || wantsSummary
      ? ["flow", "discount", "price"]
      : (["flow", "discount", "price"] as const).filter((key) => features.has(key));
    if (keys.length === 0 && !features.has("compare")) return null;

    const featureName = (key: "flow" | "discount" | "price"): string => {
      if (wantsSummary) return "汇总";
      if (key === "flow") return "货物流向";
      if (key === "discount") return "公斤段折扣";
      return "公斤段单价";
    };

    const header = ["功能", board.dim_label, "公斤段", "指标", "值"];
    const body: unknown[][] = [];
    /* 占比口径必须和界面一致（用户 2026-10-29 反馈「导出的表格有部分数值不一致」）：
     * 界面（汇总表 / 货物流向块）算的是「该单元格 ÷ 全表累计货量」，导出原来用的是
     * 「÷ 该行货量」，同一个格子会差出几十倍（191 → 0.1567 vs 0.1%）。
     * 现在统一走 utils/boardSummary.ts，界面与导出同一套分母、同一套 1 位小数。 */
    const totalVolume = boardTotalVolume(board);
    const sharePct = (volume: number): number | null => boardSharePct(volume, totalVolume);
    for (const key of keys) {
      for (const row of ordered) {
        row.row.cells.forEach((cell, bandIndex) => {
          const band = board.bands[bandIndex] ?? `段${bandIndex + 1}`;
          if (key === "flow") {
            body.push([featureName(key), row.row.label, band, "货量", Math.round(cell.vol)]);
            body.push([featureName(key), row.row.label, band, "占比（%）", sharePct(cell.vol)]);
          } else if (key === "discount") {
            body.push([
              featureName(key),
              row.row.label,
              band,
              "折扣",
              cell.orig > 0 ? Number((cell.price / cell.orig).toFixed(6)) : null,
            ]);
          } else {
            body.push([
              featureName(key),
              row.row.label,
              band,
              "单价",
              cell.vol > 0 ? Number((cell.price / cell.vol).toFixed(6)) : null,
            ]);
          }
        });
      }
    }
    if (features.has("compare") || allFeatures) {
      for (const entry of picked) {
        activeMetrics.forEach((metric) => {
          entry.row.cells.forEach((cell, bandIndex) => {
            const band = board.bands[bandIndex] ?? `段${bandIndex + 1}`;
            body.push([
              "网点对比图表",
              entry.row.label,
              band,
              metric.label,
              metricValue(cell, entry.volume, metric.key),
            ]);
          });
        });
      }
    }
    return { columns: header, rows: body, row_count: body.length, meta: {} };
  }

  async function handleExport(format: "xlsx" | "csv" | "pdf" | "jpeg", scope: "current" | "all"): Promise<void> {
    setExportOpen(false);

    /** 文件名主体：功能 · 网点 · 分组维度 · 指标（用户 2026-10-28 定稿，见 utils/exportName.ts） */
    function exportBaseName(keys: FeatureKey[]): string {
      const names: BoardFeatureName[] = keys.map((key) => ({
        label: FEATURES.find((item) => item.key === key)?.label ?? key,
        metric:
          key === "compare"
            ? activeMetrics.map((item) => item.label).join("、")
            : FEATURE_METRIC[key],
      }));
      return boardExportBaseName({
        scope,
        features: names,
        nets,
        dimLabel: board?.dim_label ?? dims.join(" × "),
      });
    }

    try {
      if (format === "xlsx" || format === "csv") {
        const table = longTable(scope === "all");
        if (table === null) {
          setExportHint("请先选择至少一个计算功能");
          return;
        }
        const scopeKeys: FeatureKey[] =
          scope === "all"
            ? ["flow", "discount", "price", "compare"]
            : FEATURES.filter((item) => features.has(item.key)).map((item) => item.key);
        const filename = `${exportBaseName(scopeKeys)}_${stampMinute()}.${format}`;
        if (isTauri()) {
          const path = await pickSavePath(filename, format);
          if (path === null) return;
          await exportTableToPath(table, format, path);
          await useExportStore.getState().record({ path, kind: "file", name: filename });
          setExportHint(`已导出：${path}`);
        } else {
          const blob = await exportTableBytes(table, format, filename);
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = filename;
          anchor.click();
          URL.revokeObjectURL(url);
          setExportHint(`已导出：${filename}`);
        }
        return;
      }

      if (format === "pdf" || format === "jpeg") {
        // 仅「网点对比图表」能导出图表文件夹（用户 2026-10-29 定稿）
        if (!features.has("compare")) {
          setExportHint("导出 PDF / JPEG 前请先勾选「网点对比图表」");
          return;
        }
        if (chartType !== "line" && chartType !== "bar") {
          setExportHint("对比图表的饼图暂不支持导出，请先切成折线 / 柱状");
          return;
        }
        if (board === null || picked.length === 0) {
          setExportHint("还没有可导出的分组，请先确认口径与日期范围");
          return;
        }
        if (!isTauri()) {
          setExportHint("浏览器环境暂不支持图表导出，请在桌面端使用");
          return;
        }

        const dir = await pickDirectory();
        if (dir === null) return; // 用户取消选目录

        const stamp = stampMinute();
        const plan = planBoardChartExport({
          entries: picked.map((entry) => ({
            label: entry.row.label,
            volume: entry.volume,
            cells: entry.row.cells,
          })),
          bands: board.bands,
          metrics: activeMetrics,
          chartType,
          nets,
          dimLabel: board.dim_label,
          metricPart: activeMetrics.map((item) => item.label).join("、"),
        });

        setExportHint(`正在导出 ${plan.fileNames.length} 张图…`);
        const response = await exportBoardChartFolder({
          merged: { ...plan.merged, render_opts: { figsize: [14, 8], dpi: 300 } },
          splits: plan.splits.map((job) => ({
            ...job,
            render_opts: { figsize: [11, 6.4], dpi: 300 },
          })),
          out_dir: dir,
          stamp,
          folder_base: plan.folderBase,
          file_names: plan.fileNames,
          format,
          render_opts: { dpi: 300, quality: 92, optimize: true },
        });

        const folderName = response.folder.split(/[\\/]/).pop() ?? plan.folderBase;
        await useExportStore.getState().record({
          path: response.folder,
          kind: "folder",
          name: folderName,
        });
        setExportHint(`已导出 ${response.files.length} 个文件：${response.folder}`);
        return;
      }
    } catch (err) {
      setExportHint(err instanceof Error ? err.message : String(err));
    }
  }

  const shown = FEATURES.filter((item) => features.has(item.key));

  /* 图表导出（PDF / JPEG）只在「网点对比图表 + 折线/柱状」下可用：导出的是一个文件夹 */
  const chartTypeExportable = chartType === "line" || chartType === "bar";
  const chartExportReady = features.has("compare") && chartTypeExportable;
  const chartExportHint = !features.has("compare")
    ? "PDF / JPEG 仅在勾选「网点对比图表」时可用"
    : chartTypeExportable
      ? `PDF / JPEG 导出到文件夹：1 张合并大图 + ${picked.length} 张拆分小图`
      : "饼图暂不支持导出，请先切成折线 / 柱状";

  return (
    <section className={styles.page}>
      <header className={styles.head}>
        <div>
          <div className={styles.title}>一键算</div>
          <div className={styles.sub}>选定口径直接出结果，不用再写公式</div>
        </div>
        <div className={styles.headActions}>
          <div className={styles.exportWrap}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setExportOpen((prev) => !prev)}
            >
              导出
            </button>
            {exportOpen && (
              <>
                <div className={styles.mask} onClick={() => setExportOpen(false)} />
                <div className={styles.flyout}>
                  <div className={styles.hint}>当前选中的功能</div>
                  <button type="button" onClick={() => void handleExport("xlsx", "current")}>
                    导出 xlsx（当前）
                  </button>
                  <button type="button" onClick={() => void handleExport("csv", "current")}>
                    导出 CSV（当前）
                  </button>
                  <button
                    type="button"
                    disabled={!chartExportReady}
                    title={chartExportHint}
                    onClick={() => void handleExport("pdf", "current")}
                  >
                    导出 PDF（当前）
                  </button>
                  <button
                    type="button"
                    disabled={!chartExportReady}
                    title={chartExportHint}
                    onClick={() => void handleExport("jpeg", "current")}
                  >
                    导出 JPEG（当前）
                  </button>
                  <div className={styles.hint}>{chartExportHint}</div>
                  <div className={styles.flyoutSep} />
                  <div className={styles.hint}>全部功能（一个 Sheet）</div>
                  <button type="button" onClick={() => void handleExport("xlsx", "all")}>
                    导出 xlsx（全部）
                  </button>
                  <button type="button" onClick={() => void handleExport("csv", "all")}>
                    导出 CSV（全部）
                  </button>
                </div>
              </>
            )}
          </div>
          <button type="button" className="btn btn-ghost" onClick={onBack}>
            返回表格
          </button>
        </div>
      </header>

      <div className={styles.board}>
        {/* 参数行：起止日期 / 网点 / 是否剔除 / 物品来源 / 分组维度 */}
        <div className={styles.params}>
          <div className={styles.field}>
            <label>起止日期</label>
            <div className={styles.row}>
              <div className="segmented">
                {(["本月", "上月", "自定义"] as const).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={rangeMode === preset ? "on" : ""}
                    onClick={() => {
                      setRangeMode(preset);
                      if (preset !== "自定义") {
                        const range = presets[preset];
                        setTimeRange(range.start, range.end);
                      }
                    }}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <input
                className={styles.date}
                type="date"
                value={timeStart === "1970-01-01" ? "" : timeStart}
                disabled={!isCustomRange}
                onChange={(event) => {
                  setRangeMode("自定义");
                  setTimeRange(event.target.value, timeEnd);
                }}
              />
              <span className={styles.tiny}>至</span>
              <input
                className={styles.date}
                type="date"
                value={timeEnd === "2999-12-31" ? "" : timeEnd}
                disabled={!isCustomRange}
                onChange={(event) => {
                  setRangeMode("自定义");
                  setTimeRange(timeStart, event.target.value);
                }}
              />
            </div>
          </div>

          <div className={styles.field}>
            <label>网点（寄件所属一级网点）</label>
            <div className={styles.pickerWrap}>
              <button
                type="button"
                className={`btn btn-secondary ${styles.pickerBtn}`}
                onClick={() => setNetPickerOpen((prev) => !prev)}
              >
                <span>
                  {nets.length === 0
                    ? `全部网点（${allNets.length}）`
                    : nets.length === 1
                      ? nets[0]
                      : `${nets[0]} 等 ${nets.length} 个`}
                </span>
                <span aria-hidden="true">▾</span>
              </button>
              {netPickerOpen && (
                <>
                  <div className={styles.mask} onClick={() => setNetPickerOpen(false)} />
                  <div className={styles.picker}>
                    <label className={styles.pickerItem}>
                      <input
                        type="checkbox"
                        checked={nets.length === 0}
                        onChange={() => setInputs({ nets: [] })}
                      />
                      <span>全部网点</span>
                    </label>
                    {allNets.map((net) => (
                      <label key={net} className={styles.pickerItem}>
                        <input
                          type="checkbox"
                          checked={nets.includes(net)}
                          onChange={() =>
                            setInputs({
                              nets: nets.includes(net)
                                ? nets.filter((item) => item !== net)
                                : [...nets, net],
                            })
                          }
                        />
                        <span>{net}</span>
                      </label>
                    ))}
                    <div className={styles.pickerFoot}>
                      <button
                        type="button"
                        className={styles.linkBtn}
                        onClick={() => setInputs({ nets: allNets })}
                      >
                        全选
                      </button>
                      <button
                        type="button"
                        className={styles.linkBtn}
                        onClick={() => setInputs({ nets: [] })}
                      >
                        取消全选
                      </button>
                      <span style={{ flex: 1 }} />
                      <button type="button" className="btn btn-primary" onClick={() => setNetPickerOpen(false)}>
                        完成
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className={styles.field}>
            <label>是否剔除</label>
            <div className="segmented">
              {exclOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={option === exclude ? "on" : ""}
                  onClick={() => setInputs({ exclude: option })}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <label>物品来源</label>
            <div className="segmented">
              {srcOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={option === source ? "on" : ""}
                  onClick={() => setInputs({ source: option })}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <label>分组维度</label>
            <div className={styles.pickerWrap}>
              <button
                type="button"
                className={`btn btn-secondary ${styles.pickerBtn}`}
                onClick={() => setDimPickerOpen((prev) => !prev)}
              >
                <span>{dims.join(" + ")}</span>
                <span aria-hidden="true">▾</span>
              </button>
              {dimPickerOpen && (
                <>
                  <div className={styles.mask} onClick={() => setDimPickerOpen(false)} />
                  <div className={`${styles.picker} ${styles.pickerCascade}`}>
                    <div className={styles.cascadeLeft}>
                      <div className={styles.cascadeHint}>一级：选分组维度</div>
                      {DIM_MODES.map((mode) => (
                        <label key={mode.key} className={styles.cascadeItem}>
                          <input
                            type="radio"
                            name="board-dim-mode"
                            checked={dimsKey(dims) === mode.key}
                            onChange={() => {
                              setInputs({
                                dims: [...mode.dims],
                                // 维度变了，二级取值跟着清空
                                dimValues: {},
                              });
                            }}
                          />
                          <span>{mode.label}</span>
                        </label>
                      ))}
                    </div>
                    <div className={styles.cascadeRight}>
                      <div className={styles.cascadeHint}>
                        二级：{valueDim} 的取值（不勾 = 全部）
                      </div>
                      <div className={styles.cascadeList}>
                        {(valueDim === "省份" ? (sources?.provinces ?? []) : allNets).map((value) => {
                          const chosen = dimValues[valueDim] ?? [];
                          return (
                            <label key={value} className={styles.cascadeItem}>
                              <input
                                type="checkbox"
                                checked={chosen.includes(value)}
                                onChange={() => {
                                  const next = chosen.includes(value)
                                    ? chosen.filter((item) => item !== value)
                                    : [...chosen, value];
                                  setInputs({
                                    dimValues: { ...dimValues, [valueDim]: next },
                                  });
                                }}
                              />
                              <span>{value}</span>
                            </label>
                          );
                        })}
                        {(valueDim === "省份" ? (sources?.provinces ?? []) : allNets).length === 0 && (
                          <div className={styles.cascadeEmpty}>当前口径下没有可选值</div>
                        )}
                      </div>
                      <div className={styles.pickerFoot}>
                        <button
                          type="button"
                          className={styles.linkBtn}
                          onClick={() =>
                            setInputs({
                              dimValues: {
                                ...dimValues,
                                [valueDim]:
                                  valueDim === "省份" ? (sources?.provinces ?? []) : allNets,
                              },
                            })
                          }
                        >
                          全选
                        </button>
                        <button
                          type="button"
                          className={styles.linkBtn}
                          onClick={() => setInputs({ dimValues: { ...dimValues, [valueDim]: [] } })}
                        >
                          取消全选
                        </button>
                        <span style={{ flex: 1 }} />
                        <button type="button" className="btn btn-primary" onClick={() => setDimPickerOpen(false)}>
                          完成
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* 计算功能：可多选 · 多选同屏（汇总与三块互斥；「网点对比图表」推到最右） */}
        <div className={styles.features}>
          <span className={styles.tiny}>计算功能（可多选 · 多选同屏）</span>
          {FEATURES.map((feature) => {
            const on = features.has(feature.key);
            return (
              <button
                key={feature.key}
                type="button"
                className={`${on ? styles.featureOn : styles.feature}${
                  feature.key === "compare" ? ` ${styles.featureRight}` : ""
                }`}
                onClick={() => toggleFeature(feature.key)}
              >
                <span className={styles.tick}>{on ? "✓" : ""}</span>
                {feature.label}
              </button>
            );
          })}
          {loading && <span className={styles.tiny}>计算中…</span>}
          {error !== null && <span className={styles.error}>{error}</span>}
        </div>

        {/* 口径说明行 */}
        <div className={styles.scope}>
          <span>
            口径：<b>{netsLabel}</b> · <b>{exclude}</b> · <b>{source}</b> ·{" "}
            <b>
              {effectiveTimeRange.start} ~ {effectiveTimeRange.end}
            </b>
          </span>
          <span>
            命中 <b>{board === null ? "—" : board.filtered.toLocaleString()}</b> 行 / 所选网点{" "}
            <b>{board === null ? "—" : board.scanned.toLocaleString()}</b> 行
          </span>
          <span>
            {exclude === "全部"
              ? "是否剔除：全部取值都算"
              : `是否剔除 = ${exclude} · 未计入 ${
                  board === null
                    ? "—"
                    : Math.max(board.scanned - board.filtered, 0).toLocaleString()
                } 行`}
            {source === "全部" ? " · 物品来源：全部取值都算" : ` · 物品来源 = ${source}`}
          </span>
        </div>

        <div className={styles.body}>
          {exportHint !== null && (
            <div className={styles.exportHint} onClick={() => setExportHint(null)}>
              {exportHint}
            </div>
          )}

          {shown.length === 0 ? (
            <div className={styles.empty}>
              已取消全部计算功能
              <span className={styles.tiny}>请选择至少一项后查看结果</span>
            </div>
          ) : (
            shown.map((feature) => {
              if (feature.key === "summary") {
                /* 汇总总表 = 分组维度 | 货物流向（货量+占比 12 列）| 公斤段折扣（6 列）| 公斤段单价（6 列）
                 * = 1 + 12 + 6 + 6 = 25 列（用户 2026-10-29 定稿）。 */
                const bands = board?.bands ?? [];
                const discountOf = (cell: BoardCell): number | null =>
                  cell.orig > 0 ? cell.price / cell.orig : null;
                const unitOf = (cell: BoardCell): number | null =>
                  cell.vol > 0 ? cell.price / cell.vol : null;
                const shareOf = (vol: number): number | null =>
                  (board?.sum_vol ?? 0) > 0 && vol > 0 ? vol / (board?.sum_vol ?? 1) : null;
                const totalRow = board?.band_totals ?? [];
                return (
                  <section key="summary" className={styles.section}>
                    <div className={styles.sectionHead}>
                      <span className={styles.sectionTitle}>汇总</span>
                      <span className={styles.sectionSub}>
                        货物流向 + 公斤段折扣 + 公斤段单价（{board?.dim_label ?? "分组"} × 公斤段）
                      </span>
                      <div className={styles.pillGroup}>
                        <span className={styles.pillFlat}>
                          <span className={styles.pillK}>累计货量</span>
                          <span className={styles.pillV}>{kg(board?.sum_vol ?? null)}</span>
                          <span className={styles.pillNote}>kg</span>
                        </span>
                        <span className={styles.pillFlat}>
                          <span className={styles.pillK}>综合折扣</span>
                          <span className={styles.pillV}>
                            {board?.weighted_disc === null || board?.weighted_disc === undefined
                              ? "—"
                              : fixed4(board.weighted_disc)}
                          </span>
                          <span className={styles.pillNote}>加权</span>
                        </span>
                        <span className={styles.pillFlat}>
                          <span className={styles.pillK}>综合单价</span>
                          <span className={styles.pillV}>
                            {board?.weighted_unit === null || board?.weighted_unit === undefined
                              ? "—"
                              : fixed3(board.weighted_unit)}
                          </span>
                          <span className={styles.pillNote}>加权</span>
                        </span>
                      </div>
                    </div>
                    <div className={styles.matrixWrap}>
                      <table className={styles.matrix}>
                        <thead>
                          <tr>
                            <th className={styles.colArea} rowSpan={2}>
                              {board?.dim_label ?? "分组"}
                            </th>
                            <th className={styles.bandGroup} colSpan={bands.length * 2}>
                              货物流向（货量 kg / 占比）
                            </th>
                            <th className={styles.bandGroup} colSpan={bands.length}>
                              公斤段折扣
                            </th>
                            <th className={styles.bandGroup} colSpan={bands.length}>
                              公斤段单价
                            </th>
                          </tr>
                          <tr>
                            {bands.map((band) => (
                              <Fragment key={`sum-flow-${band}`}>
                                {/* 用户 2026-10-29 反馈：这里原来 6 个格子全写「货量」，
                                    看不出是哪个公斤段 → 改成公斤段名 + 占比 */}
                                <th className={`${styles.num} ${styles.bandGroup}`}>{band}</th>
                                <th className={styles.num}>占比</th>
                              </Fragment>
                            ))}
                            {bands.map((band) => (
                              <th key={`sum-disc-${band}`} className={`${styles.num} ${styles.bandGroup}`}>
                                {band}
                              </th>
                            ))}
                            {bands.map((band) => (
                              <th key={`sum-unit-${band}`} className={`${styles.num} ${styles.bandGroup}`}>
                                {band}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row) => (
                            <tr key={row.label}>
                              <td className={styles.colArea}>{row.label}</td>
                              {row.cells.map((cell, index) => (
                                <Fragment key={`flow-${row.label}-${index}`}>
                                  <td
                                    className={`${styles.num}${index === 0 ? ` ${styles.bandFirst}` : ""}${
                                      cell.vol > 0 ? "" : ` ${styles.blank}`
                                    }`}
                                  >
                                    {cell.vol > 0 ? kg(cell.vol) : "—"}
                                  </td>
                                  <td className={`${styles.num}${cell.vol > 0 ? "" : ` ${styles.blank}`}`}>
                                    {pct(shareOf(cell.vol))}
                                  </td>
                                </Fragment>
                              ))}
                              {row.cells.map((cell, index) => (
                                <td
                                  key={`disc-${row.label}-${index}`}
                                  className={`${styles.num}${index === 0 ? ` ${styles.bandFirst}` : ""}`}
                                >
                                  {discountOf(cell) === null ? "—" : fixed3(discountOf(cell))}
                                </td>
                              ))}
                              {row.cells.map((cell, index) => (
                                <td
                                  key={`unit-${row.label}-${index}`}
                                  className={`${styles.num}${index === 0 ? ` ${styles.bandFirst}` : ""}`}
                                >
                                  {unitOf(cell) === null ? "—" : fixed3(unitOf(cell))}
                                </td>
                              ))}
                            </tr>
                          ))}
                          {rows.length > 0 && (
                            <tr className={styles.totalRow}>
                              <td className={styles.colArea}>合计</td>
                              {totalRow.map((cell, index) => (
                                <Fragment key={`total-flow-${index}`}>
                                  <td
                                    className={`${styles.num}${index === 0 ? ` ${styles.bandFirst}` : ""}`}
                                  >
                                    {kg(cell.vol)}
                                  </td>
                                  <td className={styles.num}>{pct(shareOf(cell.vol))}</td>
                                </Fragment>
                              ))}
                              {totalRow.map((cell, index) => (
                                <td
                                  key={`total-disc-${index}`}
                                  className={`${styles.num}${index === 0 ? ` ${styles.bandFirst}` : ""}`}
                                >
                                  {discountOf(cell) === null ? "—" : fixed3(discountOf(cell))}
                                </td>
                              ))}
                              {totalRow.map((cell, index) => (
                                <td
                                  key={`total-unit-${index}`}
                                  className={`${styles.num}${index === 0 ? ` ${styles.bandFirst}` : ""}`}
                                >
                                  {unitOf(cell) === null ? "—" : fixed3(unitOf(cell))}
                                </td>
                              ))}
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>
                );
              }

              if (feature.key === "flow") {
                return (
                  <section key="flow" className={styles.section}>
                    <div className={styles.sectionHead}>
                      <span className={styles.sectionTitle}>货物流向数据</span>
                      <span className={styles.sectionSub}>
                        结算重量按 {board?.dim_label ?? "分组"} × 公斤段 分布
                      </span>
                      <span className={styles.pill}>
                        <span className={styles.pillK}>累计货量</span>
                        <span className={styles.pillV}>{kg(board?.sum_vol ?? null)}</span>
                        <span className={styles.pillNote}>kg</span>
                      </span>
                    </div>
                    <div className={styles.matrixWrap}>
                      <table className={styles.matrix}>
                        <thead>
                          <tr>
                            <th className={styles.colArea} rowSpan={2} colSpan={2}>
                              {board?.dim_label ?? "分组"}
                            </th>
                            {(board?.bands ?? []).map((band) => (
                              <th key={band} className={styles.bandGroup} colSpan={2}>
                                {band}
                              </th>
                            ))}
                          </tr>
                          <tr>
                            {(board?.bands ?? []).map((band) => (
                              <ThPair key={`${band}-pair`} />
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row) => {
                            return (
                              <tr key={row.label}>
                                <td className={styles.colArea} colSpan={2}>
                                  {row.label}
                                </td>
                                {row.cells.map((cell, index) => (
                                  <FlowCells
                                    key={`${row.label}-${index}`}
                                    vol={cell.vol}
                                    total={board?.sum_vol ?? 0}
                                    first={index === 0}
                                  />
                                ))}
                              </tr>
                            );
                          })}
                          {rows.length > 0 && (
                            <tr className={styles.totalRow}>
                              <td className={styles.colArea} colSpan={2}>
                                合计
                              </td>
                              {(board?.band_totals ?? []).map((cell, index) => (
                                <FlowCells
                                  key={`total-${index}`}
                                  vol={cell.vol}
                                  total={board?.sum_vol ?? 0}
                                  first={index === 0}
                                  alwaysShow
                                />
                              ))}
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>
                );
              }

              // 对比图表单独渲染在下面，这里跳过（否则会重复出现「公斤段单价」）
              if (feature.key === "compare") return null;

              const isDiscount = feature.key === "discount";
              return (
                <section key={feature.key} className={styles.section}>
                  <div className={styles.sectionHead}>
                    <span className={styles.sectionTitle}>
                      {isDiscount ? "公斤段折扣" : "公斤段单价"}
                    </span>
                    <span className={styles.sectionSub}>
                      {isDiscount ? "现价合计 ÷ 原价合计" : "现价合计 ÷ 结算重量"}（加权）
                      {isDiscount
                        ? ` · Excel 原公式为简单平均（本例 ${fixed4(board?.simple_disc ?? null)}）`
                        : ` · Excel 原公式为简单平均（本例 ${fixed3(board?.simple_unit ?? null)}）`}
                    </span>
                    <span className={styles.pill}>
                      <span className={styles.pillK}>{isDiscount ? "综合折扣" : "综合单价"}</span>
                      <span className={styles.pillV}>
                        {isDiscount
                          ? fixed4(board?.weighted_disc ?? null)
                          : fixed3(board?.weighted_unit ?? null)}
                      </span>
                      <span className={styles.pillNote}>加权</span>
                    </span>
                  </div>
                  <div className={styles.matrixWrap}>
                    <table className={styles.matrix}>
                      <thead>
                        <tr>
                          <th className={styles.colArea} colSpan={2}>
                            {board?.dim_label ?? "分组"}
                          </th>
                          {(board?.bands ?? []).map((band) => (
                            <th key={band} className={`${styles.num} ${styles.bandGroup}`}>
                              {band}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr key={row.label}>
                            <td className={styles.colArea} colSpan={2}>
                              {row.label}
                            </td>
                            {row.cells.map((cell, index) => {
                              const empty = isDiscount ? cell.vol <= 0 || cell.orig <= 0 : cell.vol <= 0;
                              const value = isDiscount
                                ? cell.orig > 0
                                  ? cell.price / cell.orig
                                  : null
                                : cell.vol > 0
                                  ? cell.price / cell.vol
                                  : null;
                              return (
                                <td
                                  key={`${row.label}-${index}`}
                                  className={`${styles.num}${index === 0 ? ` ${styles.bandFirst}` : ""}${
                                    empty ? ` ${styles.blank}` : ""
                                  }`}
                                >
                                  {empty ? "—" : fixed3(value)}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                        {rows.length > 0 && (
                          <tr className={styles.totalRow}>
                            <td className={styles.colArea} colSpan={2}>
                              合计（加权）
                            </td>
                            {(board?.band_totals ?? []).map((cell, index) => {
                              const value = isDiscount
                                ? cell.orig > 0
                                  ? cell.price / cell.orig
                                  : null
                                : cell.vol > 0
                                  ? cell.price / cell.vol
                                  : null;
                              return (
                                <td
                                  key={`total-${index}`}
                                  className={`${styles.num}${index === 0 ? ` ${styles.bandFirst}` : ""}`}
                                >
                                  {value !== null && value > 0 ? fixed3(value) : "—"}
                                </td>
                              );
                            })}
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })
          )}

          {features.has("compare") && (
            <section className={`${styles.section} ${styles.sectionCharts}`}>
              <div className={styles.sectionHead}>
                <span className={styles.sectionTitle}>网点对比图表</span>
                <span className={styles.sectionSub}>
                  {chartType === "pie"
                    ? `饼图 · 按「${board?.dim_label ?? "分组"}」构成（只用第一个对比指标）`
                    : split
                      ? `X = 公斤段；每个「${board?.dim_label ?? "分组"}」分组一张图（组内每条线 = 指标）`
                      : `X = 公斤段；每条折线 = 「${board?.dim_label ?? "分组"}」分组 × 指标`}
                </span>
              </div>

              <div className={styles.chipsRow}>
                <span className={styles.tiny}>对比指标</span>
                {COMPARE_METRICS.map((metric) => {
                  const on = activeMetrics.some((item) => item.key === metric.key);
                  return (
                    <button
                      key={metric.key}
                      type="button"
                      className={on ? styles.cmetricOn : styles.cmetric}
                      onClick={() => toggleCompareMetric(metric.key)}
                    >
                      <span className={styles.tick}>{on ? "✓" : ""}</span>
                      {metric.label}
                    </button>
                  );
                })}
              </div>

              <div className={styles.chipsRow}>
                <span className={styles.tiny}>图表样式</span>
                {CHART_TYPES.map((type) => {
                  const on = chartType === type.key;
                  return (
                    <button
                      key={type.key}
                      type="button"
                      className={on ? styles.cmetricOn : styles.cmetric}
                      onClick={() => setChartType(type.key)}
                    >
                      <span className={styles.tick}>{on ? "✓" : ""}</span>
                      {type.label}
                    </button>
                  );
                })}
                <span style={{ flex: 1 }} />
                {chartType !== "pie" && (
                  <>
                    <button
                      type="button"
                      className={split ? styles.cmetricOn : styles.cmetric}
                      onClick={() => setSplit(true)}
                    >
                      <span className={styles.tick}>{split ? "✓" : ""}</span>
                      分组拆分
                    </button>
                    <button
                      type="button"
                      className={!split ? styles.cmetricOn : styles.cmetric}
                      onClick={() => setSplit(false)}
                    >
                      <span className={styles.tick}>{!split ? "✓" : ""}</span>
                      合并一张
                    </button>
                  </>
                )}
              </div>

              {mixed && (
                <div className={styles.warnLine}>
                  量纲不同：kg 与占比（折扣/单价/占比）画在同一张图里，纵轴刻度按 kg 显示，比较时看趋势即可
                </div>
              )}

              <div className={styles.legend}>
                {legendItems.map((item, index) => (
                  <span key={`${item.label}-${index}`}>
                    <i style={{ background: item.color }} />
                    {item.label}
                  </span>
                ))}
              </div>

              {chartType === "pie" ? (
                <div className={styles.chartBox} onDoubleClick={() => setZoom({ title: "网点对比图表", option: pieOption })}>
                  <ReactECharts option={pieOption} style={{ height: "100%", width: "100%" }} notMerge />
                </div>
              ) : split ? (
                <div className={styles.chartGrid}>
                  {picked.map((entry, index) => (
                    <div
                      key={entry.row.label}
                      className={styles.chartCell}
                      onDoubleClick={() => setZoom({ title: entry.row.label, option: singleOption(entry, index) })}
                    >
                      <div className={styles.chartCellTitle}>{entry.row.label}</div>
                      <div className={styles.chartCellBody}>
                        {/* 29 张图时首屏要快：lazyUpdate 让 ECharts 只在需要时合并渲染 */}
                        <ReactECharts
                          option={singleOption(entry, index)}
                          style={{ height: "100%", width: "100%" }}
                          notMerge
                          lazyUpdate
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.chartBox} onDoubleClick={() => setZoom({ title: "网点对比图表", option: mergedOption })}>
                  <ReactECharts
                    option={mergedOption}
                    style={{ height: "100%", width: "100%" }}
                    notMerge
                    lazyUpdate
                  />
                </div>
              )}
            </section>
          )}
        </div>
      </div>

      {zoom !== null && (
        <div className={styles.zoomMask} onClick={() => setZoom(null)}>
          <div className={styles.zoomCard} onClick={(event) => event.stopPropagation()}>
            <div className={styles.zoomHead}>
              <b>{zoom.title}</b>
              <span className={styles.tiny}>Esc 或点击空白处关闭</span>
              <span style={{ flex: 1 }} />
              <button type="button" className="btn btn-ghost" onClick={() => setZoom(null)}>
                ✕
              </button>
            </div>
            <div className={styles.zoomBody}>
              {/* 放大层补上与页面内小图同一份的图例（颜色靠 currentColor 由 <i> 传递） */}
              {legendItems.length > 0 && (
                <div className={styles.zoomLegend}>
                  {legendItems.map((item, index) => (
                    <span key={`${item.label}-${index}`}>
                      <i style={{ color: item.color }} />
                      {item.label}
                    </span>
                  ))}
                </div>
              )}
              <div className={styles.zoomChart}>
                <ReactECharts option={zoom.option} style={{ height: "100%", width: "100%" }} notMerge />
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function ThPair() {
  return (
    <>
      <th className={styles.num}>货量</th>
      <th className={styles.num}>占比</th>
    </>
  );
}

function FlowCells(props: { vol: number; total: number; first: boolean; alwaysShow?: boolean }) {
  const { vol, total, first, alwaysShow = false } = props;
  const show = alwaysShow || vol > 0;
  const share = total > 0 && vol > 0 ? vol / total : null;
  return (
    <>
      <td className={`${styles.num}${first ? ` ${styles.bandFirst}` : ""}${show ? "" : ` ${styles.blank}`}`}>
        {show ? kg(vol) : "—"}
      </td>
      <td className={`${styles.num}${show ? "" : ` ${styles.blank}`}`}>{show ? pct(share) : "—"}</td>
    </>
  );
}

export default BoardPage;
