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
  const [canvasWidth, setCanvasWidth] = useState(0);

  const data = useMemo<ChartData | null>(() => {
    if (result === null) return null;
    return prepareChartData(result, config);
  }, [result, config]);

  /* 图表板块尺寸固定：量出画布宽度，按「每个刻度可用宽度」自适应字号/斜度/折行 */
  useEffect(() => {
    const element = canvasRef.current;
    if (element === null) return;
    const update = (): void => setCanvasWidth(element.clientWidth);
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
    const width = canvasWidth > 0 ? canvasWidth : 420;
    return fitAxisLabels(data.categories, Math.max(14, (width - 56) / count));
  }, [data, canvasWidth]);

  const zoomFit = useMemo<FittedAxisLabels | null>(() => {
    if (data === null) return null;
    const count = Math.max(1, data.categories.length);
    return fitAxisLabels(data.categories, Math.max(14, (zoomCanvasWidth() - 70) / count));
  }, [data]);

  const option = useMemo<EChartsOption>(() => {
    if (data === null) return {};
    return _buildOption(data, config, colors, inlineFit);
  }, [data, config, colors, inlineFit]);

  const zoomOption = useMemo<EChartsOption>(() => {
    if (data === null) return {};
    return _buildOption(data, config, colors, zoomFit);
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
): EChartsOption {
  // 标题与图例由 ChartPreview 自己画（双击可改名），ECharts 只负责画布
  if (config.chart_type === "pie") {
    const labels = fit?.labels ?? data.categories;
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
          data: data.categories.map((category, index) => ({
            name: labels[index] ?? category,
            value: data.series[0]?.data[index] ?? 0,
          })),
          label: {
            show: true,
            formatter: "{b}\n{d}%",
            fontSize: fit?.fontSize ?? 11,
            lineHeight: (fit?.fontSize ?? 11) + 3,
          },
          labelLine: { show: true, length: 10, length2: 8 },
          emphasis: { label: { fontSize: 12, fontWeight: 600 } },
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
