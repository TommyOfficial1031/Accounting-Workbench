import { useEffect, useMemo, useRef, useState } from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import { useAnalysisStore } from "../../stores/analysisStore";
import { useChartStore } from "../../stores/chartStore";
import { CHART_PALETTES } from "./chartPalette";
import {
  autoChartTitle,
  fitAxisLabels,
  prepareChartData,
  type ChartData,
  type FittedAxisLabels,
} from "../../utils/chartData";
import { formatChartValue } from "../../utils/numberFormat";
import { layoutViewport } from "../../utils/overlay";
import { layoutPieLabels } from "../../utils/pieLabelLayout";
import type { ChartConfig } from "../../types/api";
import styles from "./ChartPreview.module.css";

/** 放大弹层里可用的绘图宽度（粗略值，用来算每个刻度的可用宽度）。 */
function zoomCanvasWidth(): number {
  if (typeof document === "undefined") return 1000;
  // 不能用 window.innerWidth：设置页字号是 `html { zoom }`，两个坐标系不同步（坑 56 / 62），
  // 放大弹层里刻度字号/斜度会估错。统一走 overlay.ts 的视口探针（视觉宽度）。
  const { width } = layoutViewport();
  return Math.min(1060, Math.max(560, width * 0.92 - 60));
}

/** 放大弹层里画布的真实尺寸估计（饼图标签要按画布尺寸排版）。 */
function zoomCanvasSize(): { width: number; height: number } {
  if (typeof document === "undefined") return { width: 1000, height: 620 };
  const { width, height } = layoutViewport();
  // .zoomCard = min(1100px, 92vw) × min(760px, 86vh)，扣掉正文内边距与标题栏
  return {
    width: Math.min(1100, width * 0.92) - 28,
    height: Math.min(760, height * 0.86) - 66,
  };
}

const SWATCHES = ["#0071e3", "#34c759", "#ff9500", "#af52de", "#ff3b30", "#5ac8fa"];

function swatchOf(index: number): string {
  return SWATCHES[index % SWATCHES.length];
}

/** 图例/系列显示名：双击改过的名字优先。 */
function displayName(config: ChartConfig, name: string): string {
  return config.label_aliases?.[name] ?? name;
}

type Editing =
  | { kind: "title"; value: string }
  | { kind: "legend"; name: string; value: string };

function ChartPreview() {
  const result = useAnalysisStore((state) => state.result);
  const config = useChartStore((state) => state.config);
  const updateConfig = useChartStore((state) => state.updateConfig);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [zoom, setZoom] = useState(false);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const data = useMemo<ChartData | null>(() => {
    if (result === null) return null;
    return prepareChartData(result, config);
  }, [result, config]);

  /* 图表板块尺寸固定：量出画布宽高（饼图标签也要按画布尺寸排版） */
  useEffect(() => {
    const element = canvasRef.current;
    if (element === null) return;
    const update = (): void =>
      setCanvasSize({ width: element.clientWidth, height: element.clientHeight });
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [data]);

  const colors = CHART_PALETTES[config.palette] ?? CHART_PALETTES.default;

  const inlineFit = useMemo<FittedAxisLabels | null>(() => {
    if (data === null) return null;
    const count = Math.max(1, data.categories.length);
    const width = canvasSize.width > 0 ? canvasSize.width : 420;
    return fitAxisLabels(data.categories, Math.max(14, (width - 56) / count));
  }, [data, canvasSize.width]);

  const zoomFit = useMemo<FittedAxisLabels | null>(() => {
    if (data === null) return null;
    const count = Math.max(1, data.categories.length);
    return fitAxisLabels(data.categories, Math.max(14, (zoomCanvasWidth() - 70) / count));
  }, [data]);

  const option = useMemo<EChartsOption>(() => {
    if (data === null) return {};
    return _buildOption(data, config, colors, inlineFit, canvasSize);
  }, [data, config, colors, inlineFit, canvasSize]);

  const zoomOption = useMemo<EChartsOption>(() => {
    if (data === null) return {};
    return _buildOption(data, config, colors, zoomFit, zoomCanvasSize());
  }, [data, config, colors, zoomFit]);

  /* 放大预览：Esc 关闭（用户 2026-10-28 反馈） */
  useEffect(() => {
    if (!zoom) return;
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") setZoom(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [zoom]);

  if (result === null || data === null) return null;

  const titleText = config.title.trim() !== "" ? config.title : autoChartTitle(config);

  function commit(current: Editing | null): void {
    if (current === null) return;
    const text = current.value.trim();
    setEditing(null);
    if (text === "") return;
    if (current.kind === "title") {
      updateConfig({ title: text });
      return;
    }
    updateConfig({
      label_aliases: { ...(config.label_aliases ?? {}), [current.name]: text },
    });
  }

  return (
    <div className={styles.preview}>
      <div
        className={styles.title}
        title="双击改名"
        onDoubleClick={() => setEditing({ kind: "title", value: titleText })}
      >
        {editing?.kind === "title" ? (
          <input
            autoFocus
            className={styles.titleInput}
            value={editing.value}
            onChange={(event) => setEditing({ kind: "title", value: event.target.value })}
            onBlur={() => commit(editing)}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit(editing);
              if (event.key === "Escape") setEditing(null);
            }}
          />
        ) : (
          titleText
        )}
      </div>

      <div
        className={styles.canvas}
        ref={canvasRef}
        onDoubleClick={() => setZoom(true)}
        title="双击放大"
      >
        <ReactECharts option={option} style={{ height: "100%", width: "100%" }} notMerge />
      </div>

      <div className={styles.legend}>
        {data.series.map((series) => (
          <span
            key={series.name}
            className={styles.legendItem}
            title="双击改名"
            onDoubleClick={() =>
              setEditing({
                kind: "legend",
                name: series.name,
                value: displayName(config, series.name),
              })
            }
          >
            <i
              className={styles.swatch}
              style={{ background: swatchOf(data.series.indexOf(series)) }}
            />
            {editing?.kind === "legend" && editing.name === series.name ? (
              <input
                autoFocus
                className={styles.legendInput}
                value={editing.value}
                onChange={(event) =>
                  setEditing({ kind: "legend", name: series.name, value: event.target.value })
                }
                onBlur={() => commit(editing)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commit(editing);
                  if (event.key === "Escape") setEditing(null);
                }}
              />
            ) : (
              displayName(config, series.name)
            )}
          </span>
        ))}
      </div>

      {zoom && (
        <div className={styles.zoomMask} onClick={() => setZoom(false)}>
          <div className={styles.zoomCard} onClick={(event) => event.stopPropagation()}>
            <div className={styles.zoomHead}>
              <b>{titleText}</b>
              <span className={styles.zoomHint}>Esc 或点击空白处关闭</span>
              <span style={{ flex: 1 }} />
              <button type="button" className="btn btn-ghost" onClick={() => setZoom(false)}>
                ✕
              </button>
            </div>
            <div className={styles.zoomBody}>
              <ReactECharts
                option={zoomOption}
                style={{ height: "100%", width: "100%" }}
                notMerge
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function _buildOption(
  data: ChartData,
  config: ChartConfig,
  colors: string[],
  fit: FittedAxisLabels | null,
  size: { width: number; height: number },
): EChartsOption {
  // 标题与图例由 ChartPreview 自己画（双击可改名），ECharts 只负责画布
  if (config.chart_type === "pie") {
    /* 第 15 轮（用户反馈「线条全挤在一起」）：不再用 ECharts 的径向标签，
     * 改成「左右两列 + 同列纵向错开 + 三点辅助线」，与导出端同一套几何。 */
    const fontSize = Math.max(9, Math.min(12, Math.min(size.width, size.height) / 42 || 11));
    const lineHeight = fontSize + 3;
    const measured = size.width > 0 && size.height > 0;
    const pie = layoutPieLabels({
      categories: data.categories,
      values: data.series[0]?.data ?? [],
      width: size.width,
      height: size.height,
      fontSize,
      lineHeight,
      radiusPct: 0.58,
      center: [0.5, 0.52],
    });
    return {
      color: colors,
      // {c} 是原始数字：走统一格式化器，千以上带千分位（用户 2026-10-29 定稿）
      tooltip: {
        trigger: "item",
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
          center: ["50%", "52%"],
          // 自己排好了标签位置，关掉 ECharts 的自动避让（否则会在我们之后又挪一次）
          avoidLabelOverlap: false,
          data: data.categories.map((category, index) => ({
            name: category,
            value: data.series[0]?.data[index] ?? 0,
          })),
          label: {
            show: true,
            formatter: measured
              ? (params: unknown): string => {
                  const item = params as { dataIndex?: number };
                  const index = item.dataIndex;
                  return index === undefined ? "" : (pie.texts[index] ?? "");
                }
              : "{b}\n{d}%",
            fontSize,
            lineHeight,
          },
          labelLine: { show: true },
          labelLayout: measured
            ? (params: unknown) => {
                const item = params as { dataIndex?: number };
                const index = item.dataIndex;
                const placement = index === undefined ? null : (pie.placements[index] ?? null);
                if (placement === null) return {};
                return {
                  x: placement.x,
                  y: placement.y,
                  align: placement.align,
                  verticalAlign: "middle" as const,
                  labelLinePoints: placement.points,
                };
              }
            : undefined,
          emphasis: { label: { fontSize: fontSize + 1, fontWeight: 600 } },
        },
      ],
    } as EChartsOption;
  }

  // 分类轴：字号/斜度/每行字数按每个刻度的可用宽度自适应（挤不下就隔几个显示）
  const labels = fit?.labels ?? data.categories;
  const fontSize = fit?.fontSize ?? 11;
  const rotate = fit?.rotate ?? 0;
  const interval = fit?.interval ?? 0;
  const multiline = labels.some((label) => label.includes("\n"));
  return {
    color: colors,
    tooltip: { trigger: "axis", valueFormatter: formatChartValue },
    legend: { show: false },
    grid: {
      left: 12,
      right: 20,
      // 顶部留出 Y 轴名的位置（nameLocation: "end" 会把名字画在轴线上方）
      top: 34,
      bottom: multiline ? 16 : 8,
      containLabel: true,
    },
    xAxis: {
      type: "category",
      data: labels,
      axisLabel: {
        rotate,
        fontSize,
        interval,
        // ECharts 自己再躲一次：斜排 + 折行后仍有余量时不会硬挤在一起
        hideOverlap: true,
        margin: 8,
        lineHeight: fontSize + 3,
      },
    },
    yAxis: {
      type: "value",
      name: config.y_axis ?? "",
      nameLocation: "end",
      nameGap: 10,
      // 名字左对齐到轴线上方，画在网格顶部预留的 34px 里，不会像原来那样被裁掉
      nameTextStyle: { align: "left", fontSize: 11 },
      axisLabel: { fontSize: 11, formatter: formatChartValue },
    },
    series: data.series.map((s) => ({
      type: config.chart_type === "line" ? "line" : "bar",
      name: s.name,
      data: s.data,
      label: config.show_data_labels ? { show: true, fontSize: 10 } : undefined,
    })),
  } as EChartsOption;
}

export default ChartPreview;
