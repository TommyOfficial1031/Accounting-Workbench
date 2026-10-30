import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";

import { useEconStore } from "../stores/econStore";
import { useAnalysisStore } from "../stores/analysisStore";
import {
  BAND_FIELD,
  NET_FIELD,
  PROVINCE_FIELD,
  applyCostToLabels,
  commonPolicyValue,
  provinceGroups,
  visibleGroups,
} from "../utils/regressionGroups";
import { formatChartValue } from "../utils/numberFormat";
import { placeOverlay, type OverlayPlacement } from "../utils/overlay";
import { pickDirectory } from "../utils/platform";
import type { GroupPolicy, RegressionGroup } from "../types/api";
import styles from "./RegressionPage.module.css";

interface RegressionPageProps {
  datasetId: string | null;
  onBack: () => void;
}

/** 独立的单维度（网点）；「目的所属省份 × 公斤段」走级联控件（第 11 轮 A①）。 */
const DIM_CANDIDATES = [NET_FIELD];
const PALETTE = ["#0071e3", "#34c759", "#ff9500", "#af52de", "#ff3b30", "#5ac8fa"];
const EMPTY_POLICY = { c_line: "", op_cost: "", d_plan: "", z_plan: "" };
/** 级联浮层宽度（与 CSS 里的 .cascade 一致，用于视口夹取）。 */
const CASCADE_WIDTH = 452;

/** 把省市两级维度按「网点 → 省份 → 公斤段」的顺序补齐（标签顺序靠 dims 顺序）。 */
function withCascadeDims(current: string[]): string[] {
  const next = [...current];
  for (const field of [PROVINCE_FIELD, BAND_FIELD]) {
    if (!next.includes(field)) next.push(field);
  }
  return next;
}

/** 空级联映射的稳定引用（放进 useEffect 依赖里，不能每次新建 `{}`，否则 effect 每帧重跑）。 */
const NO_BANDS: Record<string, string[]> = {};

function money(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const rounded = Math.abs(value) < 0.5 ? 0 : value;
  return `${rounded < 0 ? "-¥" : "¥"}${Math.abs(rounded).toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`;
}

function pct(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

function num(value: number | null, digits = 4): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

function badgeOf(group: RegressionGroup): { text: string; className: string } {
  if (!group.filled || group.profit_plan === null) return { text: "待填值", className: styles.chip };
  if (group.profit_plan > 1e-9) return { text: "盈利", className: `${styles.chip} ${styles.chipOk}` };
  if (group.profit_plan < -1e-9) return { text: "亏损", className: `${styles.chip} ${styles.chipDanger}` };
  return { text: "持平", className: styles.chip };
}

/** 手动模式的判定文案（后端给「盈利 / 亏损 / 持平」）：按结论上色。 */
function judgeClass(judge: string): string {
  if (judge.includes("盈利")) return `${styles.chip} ${styles.chipOk}`;
  if (judge.includes("亏损")) return `${styles.chip} ${styles.chipDanger}`;
  return styles.chip;
}

/** 文件夹名用的时间戳：YYYY-MM-DD HH：MM（全角冒号，Windows 合法）。 */
function formatStamp(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}：${pad(date.getMinutes())}`;
}

/** 图表 X 轴范围：轴从 0 起（保留原点），利润线自己从当前货量开始画。 */
function zRange(start: number, plan: number): [number, number] {
  const safeStart = Number.isFinite(start) && start > 0 ? start : 1;
  const safePlan = Number.isFinite(plan) && plan > 0 ? plan : safeStart;
  const end = Math.max(safeStart * 2, safePlan * 1.5);
  return [0, Math.round(end)];
}

function RegressionPage({ datasetId, onBack }: RegressionPageProps) {
  const table = useEconStore((state) => state.table);
  const manual = useEconStore((state) => state.manual);
  const loading = useEconStore((state) => state.loading);
  const error = useEconStore((state) => state.error);
  const runTableModel = useEconStore((state) => state.runTableModel);
  const runManualModel = useEconStore((state) => state.runManualModel);
  const loadValues = useEconStore((state) => state.loadValues);
  const values = useEconStore((state) => state.values);
  const inputs = useEconStore((state) => state.regressionInputs);
  const setInputs = useEconStore((state) => state.setRegressionInputs);
  const exportTable = useEconStore((state) => state.exportTable);
  const exportManual = useEconStore((state) => state.exportManual);
  const cascadeValues = useEconStore((state) => state.cascadeValues);
  const timeRange = useAnalysisStore((state) => state.timeRange);
  const detectedRange = useAnalysisStore((state) => state.detectedRange);
  const ensureDetectedRange = useAnalysisStore((state) => state.ensureDetectedRange);
  const setToast = useAnalysisStore((state) => state.setToast);

  const [exportHint, setExportHint] = useState<string | null>(null);
  const [expandedDim, setExpandedDim] = useState<string | null>(null);
  const [showFormula, setShowFormula] = useState(false);
  const [exclude, setExclude] = useState("不剔除");
  const [source, setSource] = useState("全部");
  /* 省份 × 公斤段级联浮层（形制同分析页图表 X 轴取值浮层：portal + 视口夹取） */
  const [cascadeOpen, setCascadeOpen] = useState(false);
  const [cascadeAnchor, setCascadeAnchor] = useState<OverlayPlacement | null>(null);
  const [activeProvince, setActiveProvince] = useState<string | null>(null);
  const cascadeButtonRef = useRef<HTMLButtonElement | null>(null);
  const cascadeRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState<{
    title: string;
    option: EChartsOption;
    legend?: { color: string; before: string; after: string };
  } | null>(null);

  const mode = inputs.mode;
  // 手动测算：车线 + 操作 两个输入（存在 store 里，随项目快照持久化），C 自动相加且只读
  const { dims, picks, cascade, policies, manual: manualDraft, cLine, opCost } = inputs;

  useEffect(() => {
    if (datasetId === null) return;
    // 取值 + 「省份 → 该省公斤段」的级联映射（每省各自的公斤段集合）
    void loadValues(
      datasetId,
      [...DIM_CANDIDATES, PROVINCE_FIELD, BAND_FIELD, "是否剔除", "物品来源"],
      { parent: PROVINCE_FIELD, child: BAND_FIELD },
    );
  }, [datasetId, loadValues]);

  /* 进页面取一次识别出的时间范围（带缓存）：默认「自定义」+ 预填（第 11 轮 C） */
  useEffect(() => {
    if (datasetId === null) return;
    void ensureDetectedRange(datasetId);
  }, [datasetId, ensureDetectedRange]);

  // 分析页没选日期时 timeRange 可能是空字符串，直接发请求会被后端判 422
  const timeField = detectedRange?.field ?? (timeRange?.field?.trim() ? timeRange.field : "账单时间");
  /* 时间维度：进入功能后默认勾选，只提供自定义日期（用户 2026-10-25 反馈第 6 条） */
  const [timeOn, setTimeOn] = useState(true);
  const [timeFrom, setTimeFrom] = useState("");
  const [timeTo, setTimeTo] = useState("");
  /* 识别出时间范围就预填；识别不出来保持空（= 全量 1970-01-01 ~ 2999-12-31，不预填） */
  useEffect(() => {
    if (detectedRange === null) return;
    setTimeFrom(detectedRange.start);
    setTimeTo(detectedRange.end);
  }, [detectedRange]);
  const timeStart = timeOn && timeFrom.trim() !== "" ? timeFrom : "1970-01-01";
  const timeEnd = timeOn && timeTo.trim() !== "" ? timeTo : "2999-12-31";
  const effectiveTimeRange = useMemo(
    () => ({ start: timeStart, end: timeEnd, field: timeField }),
    [timeStart, timeEnd, timeField],
  );

  /* 后端返回多少组就显示多少组（第 11 轮 A③：卡片与图表都不再截断） */
  const groups = visibleGroups(table);
  const provinceRows = useMemo(() => provinceGroups(groups), [groups]);

  /* 级联勾选：cascade[省份] → 该省勾选的公斤段；picks[省份] = 参与计算的省份（点击顺序） */
  const provinceBands = cascade[PROVINCE_FIELD] ?? NO_BANDS;
  const provinceOrder = picks[PROVINCE_FIELD] ?? [];
  const cascadeOn = dims.includes(PROVINCE_FIELD) && dims.includes(BAND_FIELD);
  const provinceOptions = values[PROVINCE_FIELD] ?? [];
  const bandOptionsFor = useCallback(
    (province: string | null): string[] => {
      if (province === null) return [];
      const own = cascadeValues[province];
      return own !== undefined && own.length > 0 ? own : (values[BAND_FIELD] ?? []);
    },
    [cascadeValues, values],
  );

  /* 老项目快照只有 picks（省份 + 公斤段分开勾），进页面时升成 cascade，卡片口径不变 */
  const cascadeMigrated = useRef(false);
  useEffect(() => {
    if (cascadeMigrated.current) return;
    if (Object.keys(cascade).length > 0) return;
    const provinces = picks[PROVINCE_FIELD] ?? [];
    const bands = picks[BAND_FIELD] ?? [];
    if (provinces.length === 0 || bands.length === 0) return;
    cascadeMigrated.current = true;
    const mapping: Record<string, string[]> = {};
    provinces.forEach((province) => {
      mapping[province] = [...bands];
    });
    setInputs({ cascade: { [PROVINCE_FIELD]: mapping }, dims: withCascadeDims(dims) });
  }, [cascade, picks, dims, setInputs]);

  /* ── 计算：表格模式 / 手动模式 ── */
  const calcTable = useCallback(() => {
    if (datasetId === null) return;
    const parsedPolicies: Record<string, GroupPolicy> = {};
    Object.entries(policies).forEach(([key, draft]) => {
      const entry: GroupPolicy = {};
      (["c_line", "op_cost", "d_plan", "z_plan"] as const).forEach((field) => {
        const raw = draft?.[field]?.trim();
        if (raw !== undefined && raw !== "") entry[field] = Number(raw);
      });
      if (Object.keys(entry).length > 0) parsedPolicies[key] = entry;
    });
    const hasCascade = Object.keys(provinceBands).length > 0;
    void runTableModel({
      dataset_id: datasetId,
      time_range: effectiveTimeRange,
      dims,
      picks,
      // 有级联映射时后端按「省份 → 该省勾选的公斤段」展开；没有就退回 picks 的笛卡尔积
      cascade: hasCascade ? { [PROVINCE_FIELD]: provinceBands } : undefined,
      policies: parsedPolicies,
      exclude: exclude === "全部" ? undefined : exclude,
      source: source === "全部" ? undefined : source,
    });
  }, [
    datasetId,
    policies,
    dims,
    picks,
    provinceBands,
    timeStart,
    timeEnd,
    timeField,
    exclude,
    source,
    runTableModel,
  ]);

  /* 原型行为：填完四个值就自动出结果（不再要求点按钮）。首次进入也算一次。 */
  const lastSignature = useRef("");
  useEffect(() => {
    if (datasetId === null) return;
    const signature = JSON.stringify([
      datasetId,
      dims,
      picks,
      provinceBands,
      policies,
      timeStart,
      timeEnd,
      timeField,
      exclude,
      source,
    ]);
    if (signature === lastSignature.current) return;
    const timer = window.setTimeout(() => {
      lastSignature.current = signature;
      calcTable();
    }, 400);
    return () => window.clearTimeout(timer);
  }, [calcTable, datasetId, dims, picks, provinceBands, policies, timeStart, timeEnd, timeField, exclude, source]);

  const lastManualSignature = useRef("");
  useEffect(() => {
    if (mode !== "manual") return;
    // p0 / 计划货量 必须是正数，否则后端 422
    if (!(manualDraft.p0 > 0) || !(manualDraft.z_plan > 0)) return;
    const signature = JSON.stringify(manualDraft);
    if (signature === lastManualSignature.current) return;
    const timer = window.setTimeout(() => {
      lastManualSignature.current = signature;
      void runManualModel(manualDraft);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [mode, manualDraft, runManualModel]);

  /* ── 手动模式图 ── */
  const manualOption = useMemo<EChartsOption>(() => {
    if (manual === null) return {};
    // 轴从 0 起；利润线从「当前货量」这个点开始画（用户 2026-10-25 反馈第 5 条）
    const [zMin, zEnd] = zRange(manualDraft.z_now, manualDraft.z_plan);
    const zFrom = Math.max(manualDraft.z_now, 0);
    return {
      grid: { left: 72, right: 24, top: 40, bottom: 46 },
      // 千以上一律千分位（1,000 / 10,000），不再用「万」缩写（用户 2026-10-29 定稿）
      tooltip: { trigger: "axis", valueFormatter: formatChartValue },
      legend: { show: false },
      xAxis: {
        type: "value",
        min: zMin,
        max: zEnd,
        name: "货量（kg）",
        axisLabel: { formatter: formatChartValue },
      },
      yAxis: {
        type: "value",
        name: "利润（元）",
        axisLabel: { formatter: formatChartValue },
      },
      series: [
        {
          name: "调整前",
          type: "line",
          showSymbol: true,
          symbolSize: 5,
          lineStyle: { type: "dashed", width: 2 },
          itemStyle: { color: "#6e6e73" },
          data: [
            [zFrom, Math.round(manual.m_now * zFrom + manualDraft.b_now)],
            [zEnd, Math.round(manual.m_now * zEnd + manualDraft.b_now)],
          ],
        },
        {
          name: "调整后",
          type: "line",
          showSymbol: true,
          symbolSize: 5,
          lineStyle: { width: 2.2 },
          itemStyle: { color: "#0071e3" },
          data: [
            [zFrom, Math.round(manual.m_plan * zFrom + manualDraft.b_plan)],
            [zEnd, Math.round(manual.m_plan * zEnd + manualDraft.b_plan)],
          ],
          markLine: {
            symbol: "none",
            lineStyle: { color: "#ff3b30", type: "dashed", width: 1.2 },
            data: [
              { yAxis: 0, label: { formatter: "基准盈利线（利润 0）", position: "insideStartTop" } },
              {
                xAxis: manualDraft.z_plan,
                lineStyle: { color: "#8e8e93" },
                label: {
                  formatter: `计划货量 ${Math.round(manualDraft.z_plan).toLocaleString("zh-CN")}`,
                  position: "insideEndTop",
                },
              },
            ],
          },
        },
      ],
    };
  }, [manual, manualDraft]);

  /* ── 表格模式：每组一张小图 ── */
  const groupOption = useCallback(
    (group: RegressionGroup, index: number): EChartsOption => {
      const color = PALETTE[index % PALETTE.length];
      // 轴 0 起；线从该组当前货量开始
      const [zMin, zEnd] = zRange(group.z, group.z_plan ?? 0);
      const zFrom = Math.max(group.z, 0);
      const mNow = (group.p ?? 0) - group.c;
      const series: NonNullable<EChartsOption["series"]> = [
        {
          name: "调整前",
          type: "line",
          showSymbol: true,
          symbolSize: 4,
          z: 5,
          lineStyle: { type: "dashed", width: 2.6 },
          itemStyle: { color },
          data: [
            [zFrom, Math.round(mNow * zFrom)],
            [zEnd, Math.round(mNow * zEnd)],
          ],
        },
      ];
      if (group.filled && group.p_plan !== null) {
        const mPlan = group.p_plan - group.c;
        series.push({
          name: "调整后",
          type: "line",
          showSymbol: true,
          symbolSize: 4,
          lineStyle: { width: 2.2 },
          itemStyle: { color },
          data: [
            [zFrom, Math.round(mPlan * zFrom)],
            [zEnd, Math.round(mPlan * zEnd)],
          ],
          markLine: {
            symbol: "none",
            lineStyle: { color: "#8e8e93", type: "dashed", width: 1 },
            data: [
              { yAxis: 0, label: { show: false }, lineStyle: { color: "#ff3b30" } },
              {
                xAxis: group.z_plan ?? 0,
                label: {
                  formatter: `计划货量 ${Math.round(group.z_plan ?? 0).toLocaleString("zh-CN")}`,
                  fontSize: 10,
                },
              },
            ],
          },
        });
      }
      return {
        grid: { left: 58, right: 16, top: 26, bottom: 34 },
        legend: { show: false },
        xAxis: {
          type: "value",
          min: zMin,
          max: zEnd,
          name: "货量（kg）",
          nameTextStyle: { fontSize: 10 },
          axisLabel: { fontSize: 10, formatter: formatChartValue },
        },
        yAxis: {
          type: "value",
          name: "利润（元）",
          nameTextStyle: { fontSize: 10 },
          axisLabel: { fontSize: 10, formatter: formatChartValue },
        },
        series,
      };
    },
    [],
  );

  function toggleDim(field: string): void {
    const next = dims.includes(field) ? dims.filter((item) => item !== field) : [...dims, field];
    setInputs({ dims: next });
  }

  /** 级联维度（目的所属省份 × 公斤段）整体的开 / 关；打开时直接弹出勾选浮层。 */
  function toggleCascadeDim(): void {
    if (cascadeOn) {
      setInputs({ dims: dims.filter((item) => item !== PROVINCE_FIELD && item !== BAND_FIELD) });
      setCascadeOpen(false);
      setCascadeAnchor(null);
      return;
    }
    setInputs({ dims: withCascadeDims(dims) });
    openCascadePicker();
  }

  /** 点取值框：没启用级联就先启用（用户原话「点省份 × 公斤段 → 点安徽省 → 勾公斤段」）。 */
  function handleCascadeValueClick(): void {
    if (cascadeOpen) {
      setCascadeOpen(false);
      setCascadeAnchor(null);
      return;
    }
    if (!cascadeOn) setInputs({ dims: withCascadeDims(dims) });
    openCascadePicker();
  }

  function togglePick(field: string, value: string): void {
    const current = picks[field] ?? [];
    setInputs({
      picks: {
        ...picks,
        [field]: current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
      },
    });
  }

  /**
   * 写一个省份的公斤段勾选（第 11 轮 A①，勾选逻辑同分析页 X 轴取值浮层）：
   * 勾几项 = 只取这些；该省全部取消 = 该省不参与计算。picks[省份] 顺序 = 用户点击顺序。
   */
  function setProvinceBands(province: string, bands: string[]): void {
    const nextBands: Record<string, string[]> = { ...provinceBands };
    if (bands.length === 0) delete nextBands[province];
    else nextBands[province] = bands;
    const nextOrder =
      bands.length === 0
        ? provinceOrder.filter((item) => item !== province)
        : provinceOrder.includes(province)
          ? provinceOrder
          : [...provinceOrder, province];
    const allBands = [...new Set(Object.values(nextBands).flat())];
    setInputs({
      cascade: { [PROVINCE_FIELD]: nextBands },
      picks: { ...picks, [PROVINCE_FIELD]: nextOrder, [BAND_FIELD]: allBands },
      dims: withCascadeDims(dims),
    });
  }

  function toggleProvinceBand(province: string, band: string): void {
    const current = provinceBands[province] ?? [];
    setProvinceBands(
      province,
      current.includes(band) ? current.filter((item) => item !== band) : [...current, band],
    );
  }

  function updatePolicy(label: string, key: keyof typeof EMPTY_POLICY, value: string): void {
    setInputs({
      policies: {
        ...policies,
        [label]: { ...(policies[label] ?? EMPTY_POLICY), [key]: value },
      },
    });
  }

  /** 按省份统一写成本：覆盖该省全部卡片（之后单卡仍可单独改，只影响那一张）。 */
  function writeProvinceCost(labels: string[], key: "c_line" | "op_cost", value: string): void {
    setInputs({ policies: applyCostToLabels(policies, labels, key, value) });
  }

  /* ── 级联浮层：打开 / 关闭（点外面、Esc、滚动都会收） ── */
  function openCascadePicker(): void {
    const rect = cascadeButtonRef.current?.getBoundingClientRect();
    if (rect === undefined) return;
    const fallback =
      provinceOrder.find((province) => provinceOptions.includes(province)) ?? provinceOptions[0] ?? null;
    setActiveProvince(
      activeProvince !== null && provinceOptions.includes(activeProvince) ? activeProvince : fallback,
    );
    // 视口夹取 + html { zoom } 换算统一走 placeOverlay（坑 62）
    setCascadeAnchor(
      placeOverlay({
        left: rect.left,
        belowY: rect.bottom + 6,
        aboveY: rect.top - 6,
        width: CASCADE_WIDTH,
        designMax: 460,
        minBelow: 320,
        minHeight: 180,
      }),
    );
    setCascadeOpen(true);
  }

  useEffect(() => {
    if (!cascadeOpen) return;
    function onPointerDown(event: MouseEvent): void {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (cascadeRef.current?.contains(target)) return;
      if (cascadeButtonRef.current?.contains(target)) return;
      setCascadeOpen(false);
      setCascadeAnchor(null);
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setCascadeOpen(false);
        setCascadeAnchor(null);
      }
    }
    function onViewportChange(event: Event): void {
      // 浮层自己内部的列表滚动不要收起（坑 57）
      const target = event.target;
      if (target instanceof Node && cascadeRef.current?.contains(target)) return;
      setCascadeOpen(false);
      setCascadeAnchor(null);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [cascadeOpen]);

  async function runExport(): Promise<void> {
    const dir = await pickDirectory();
    if (dir === null) {
      const message = "浏览器环境不支持选择目录，请在桌面应用里导出";
      setExportHint(message);
      setToast(message);
      return;
    }
    const stamp = formatStamp(new Date());
    const prefix = dims.length > 0 ? (picks[dims[0]]?.join("、") ?? "全部") : "全部";
    const message =
      mode === "manual"
        ? await exportManual(manualDraft, dir, stamp)
        : await exportTable(dir, stamp, prefix);
    const finalMessage = message ?? useEconStore.getState().error ?? "导出失败";
    setExportHint(finalMessage);
    setToast(finalMessage);
  }

  /* 点击页面其他地方收起维度下拉 */
  useEffect(() => {
    if (expandedDim === null) return;
    function onPointerDown(event: PointerEvent): void {
      const target = event.target as HTMLElement | null;
      if (target !== null && target.closest("[data-dim-list]")) return;
      setExpandedDim(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [expandedDim]);

  const pPlanManual = manualDraft.p0 * manualDraft.d_plan;

  return (
    <section className={styles.page}>
      <header className={styles.head}>
        <div className={styles.title}>盈亏平衡与折扣分析</div>
        <div className={styles.actions}>
          <button type="button" className="btn btn-secondary" onClick={() => void runExport()}>
            导出
          </button>
          <button type="button" className="btn btn-secondary" onClick={onBack}>
            返回表格
          </button>
        </div>
      </header>

      {/* 导出结果紧贴按钮下方（原型：导出后立刻在按钮附近给提示） */}
      {exportHint !== null && (
        <div className={styles.exportBar}>
          <span>{exportHint}</span>
          <button type="button" title="关闭" onClick={() => setExportHint(null)}>
            ✕
          </button>
        </div>
      )}

      <div className={styles.split}>
        {/* ══ 左侧 ══ */}
        <div className={styles.left}>
          <div className="segmented">
            <button
              type="button"
              className={mode === "table" ? "on" : undefined}
              onClick={() => setInputs({ mode: "table" })}
              disabled={datasetId === null}
            >
              表格取数
            </button>
            <button
              type="button"
              className={mode === "manual" ? "on" : undefined}
              onClick={() => setInputs({ mode: "manual" })}
            >
              手动测算
            </button>
          </div>

          {mode === "table" ? (
            <>
              {/* ① 字段识别：六格（与原型一致） */}
              <div className={styles.cardSoft}>
                <div className={styles.fieldCheck}>
                  {[
                    ["寄件所属一级网点", "网点"],
                    ["公斤段", "公斤段"],
                    ["目的所属省份", "省份"],
                    ["结算重量", "结算重量"],
                    ["现价", "现价"],
                    ["原价", "原价"],
                  ].map(([field, label]) => (
                    <div key={field} className={styles.fieldCell}>
                      <span className={styles.fieldName}>{label}</span>
                      <span className={styles.fieldOk}>✓</span>
                    </div>
                  ))}
                </div>
                <div className={styles.tiny} style={{ marginTop: 6 }}>
                  {datasetId === null ? "尚未导入表格" : "字段识别 6 / 6 · 缺任一字段将无法计算"}
                </div>
              </div>

              {/* ② 口径 */}
              <div className={styles.subHead}>
                <span>计算口径</span>
              </div>
              <div className={styles.cardSoft}>
                <div className={styles.inRow}>
                  <label>
                    是否剔除
                    <select value={exclude} onChange={(event) => setExclude(event.target.value)}>
                      <option value="全部">全部（剔除 + 不剔除）</option>
                      {(values["是否剔除"] ?? ["不剔除", "剔除"]).slice(0, 6).map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    物品来源
                    <select value={source} onChange={(event) => setSource(event.target.value)}>
                      <option value="全部">全部（普通物品 + 审报物品）</option>
                      {(values["物品来源"] ?? ["普通物品"]).slice(0, 6).map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              {/* ③ 分组筛选条件：时间 + 每个维度一行（当前值 + 展开勾选） */}
              <div className={styles.subHead}>
                <span>分组筛选条件</span>
              </div>
              <div className={styles.dimRow}>
                <button
                  type="button"
                  className={timeOn ? styles.dimBtnOn : styles.dimBtn}
                  onClick={() => setTimeOn((prev) => !prev)}
                  title={timeOn ? "点击取消时间筛选" : "点击按时间筛选"}
                >
                  时间
                </button>
                <div className={styles.timeRow}>
                  <input
                    type="date"
                    className="input"
                    value={timeFrom}
                    disabled={!timeOn}
                    onChange={(event) => setTimeFrom(event.target.value)}
                  />
                  <span className={styles.tiny}>至</span>
                  <input
                    type="date"
                    className="input"
                    value={timeTo}
                    disabled={!timeOn}
                    onChange={(event) => setTimeTo(event.target.value)}
                  />
                </div>
              </div>
              {DIM_CANDIDATES.map((field) => {
                const active = dims.includes(field);
                const chosen = picks[field] ?? [];
                const open = expandedDim === field;
                return (
                  <div key={field} className={styles.dimRow}>
                    <button
                      type="button"
                      className={active ? styles.dimBtnOn : styles.dimBtn}
                      onClick={() => toggleDim(field)}
                      title={active ? "点击取消这个维度" : "点击把该维度加入拆分"}
                    >
                      {field}
                    </button>
                    <button
                      type="button"
                      className={styles.dimValue}
                      disabled={!active}
                      onClick={() => setExpandedDim(open ? null : field)}
                    >
                      {chosen.length > 0 ? chosen.join("、") : "全部"}
                      <span className={styles.caret}>▾</span>
                    </button>
                    {open && active && (
                      <div className={styles.dimList} data-dim-list="1">
                        <div className={styles.dimBulk}>
                          <button
                            type="button"
                            className={styles.linkBtn}
                            onClick={() =>
                              setInputs({
                                picks: { ...picks, [field]: (values[field] ?? []).slice(0, 20) },
                              })
                            }
                          >
                            全选
                          </button>
                          <button
                            type="button"
                            className={styles.linkBtn}
                            onClick={() => setInputs({ picks: { ...picks, [field]: [] } })}
                          >
                            取消全选
                          </button>
                        </div>
                        {(values[field] ?? []).slice(0, 20).map((value) => (
                          <label key={value} className={styles.dimItem}>
                            <input
                              type="checkbox"
                              checked={chosen.includes(value)}
                              onChange={() => togglePick(field, value)}
                            />
                            <span>{value}</span>
                          </label>
                        ))}
                        {(values[field] ?? []).length === 0 && (
                          <span className={styles.tiny}>没有候选值</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* ③-b 目的所属省份 × 公斤段：一级点省份、二级勾该省的公斤段（第 11 轮 A①） */}
              <div className={styles.dimRow}>
                <button
                  type="button"
                  className={cascadeOn ? styles.dimBtnOn : styles.dimBtn}
                  onClick={toggleCascadeDim}
                  title={cascadeOn ? "点击取消这个维度" : "点击把「省份 × 公斤段」加入拆分"}
                >
                  目的所属省份 × 公斤段
                </button>
                <button
                  ref={cascadeButtonRef}
                  type="button"
                  className={styles.dimValue}
                  onClick={handleCascadeValueClick}
                  aria-expanded={cascadeOpen}
                  title={
                    provinceOrder.length === 0
                      ? "还没勾省份：不勾 = 全部合成合计一行"
                      : provinceOrder
                          .map((province) => `${province}（${(provinceBands[province] ?? []).length} 段）`)
                          .join("、")
                  }
                >
                  {provinceOrder.length === 0
                    ? "全部"
                    : provinceOrder
                        .map((province) => `${province} ${(provinceBands[province] ?? []).length} 段`)
                        .join("、")}
                  <span className={styles.caret}>▾</span>
                </button>
              </div>

              <div className={styles.tiny} style={{ padding: "2px 2px 0" }}>
                {groups.length > 0
                  ? `命中 ${groups.reduce((sum, group) => sum + group.row_count, 0)} 行 · ${groups.length} 张卡片${
                      table?.empty_combos ? ` · ${table.empty_combos} 个组合无数据已隐藏` : ""
                    }`
                  : "未勾选取值 = 合成合计一行"}
              </div>

              {/* ③ 计算卡片：每组一张（只读行 + 四个手填值） */}
              <div className={styles.subHead}>
                <span>计算卡片</span>
              </div>

              {/* ③-c 按省份统一写成本：写入 = 覆盖该省全部卡片，之后单卡仍可单独改（用户 2026-10-29 定稿） */}
              {provinceRows.length > 0 && (
                <>
                  <div className={styles.subHead}>
                    <span>按省份统一写成本</span>
                    <span className={styles.tiny}>写入覆盖该省全部卡片 · 单卡之后仍可单独改</span>
                  </div>
                  <div className={`${styles.cardSoft} ${styles.unify}`}>
                    {provinceRows.map(({ province, labels }) => {
                      const cLineValue = commonPolicyValue(policies, labels, "c_line");
                      const opCostValue = commonPolicyValue(policies, labels, "op_cost");
                      return (
                        <div key={province} className={styles.unifyRow}>
                          <span className={styles.unifyName} title={province}>
                            {province}
                          </span>
                          <label>
                            车线成本
                            <input
                              type="number"
                              step="0.0001"
                              placeholder={cLineValue === null ? "多个值" : "0"}
                              value={cLineValue ?? ""}
                              onChange={(event) =>
                                writeProvinceCost(labels, "c_line", event.target.value)
                              }
                            />
                          </label>
                          <label>
                            操作成本
                            <input
                              type="number"
                              step="0.0001"
                              placeholder={opCostValue === null ? "多个值" : "0.08"}
                              value={opCostValue ?? ""}
                              onChange={(event) =>
                                writeProvinceCost(labels, "op_cost", event.target.value)
                              }
                            />
                          </label>
                          <span className={styles.tiny}>{labels.length} 张卡片</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {groups.length === 0 ? (
                <div className={styles.cardSoft}>
                  <div className={styles.tiny}>勾选取值后，这里会为每个组合生成一张卡片</div>
                </div>
              ) : (
                groups.map((group) => (
                  <div key={group.key} className={styles.cardSoft}>
                    <div className={styles.cardHead}>
                      <b>{group.label}</b>
                      <span className={styles.tiny}>
                        {group.row_count} 行 · {group.z.toLocaleString("zh-CN")} kg
                      </span>
                    </div>
                    <div className={styles.roRow}>
                      <span>
                        原价 <b>{num(group.p0)}</b>
                      </span>
                      <span>
                        现价 <b>{num(group.p)}</b>
                      </span>
                      <span>
                        折扣 <b>{pct(group.d, 1)}</b>
                      </span>
                    </div>
                    <div className={styles.inRow}>
                      <label>
                        车线成本
                        <input
                          type="number"
                          step="0.0001"
                          placeholder="0"
                          value={policies[group.label]?.c_line ?? ""}
                          onChange={(event) => updatePolicy(group.label, "c_line", event.target.value)}
                        />
                      </label>
                      <label>
                        操作成本
                        <input
                          type="number"
                          step="0.0001"
                          placeholder="0.08"
                          value={policies[group.label]?.op_cost ?? ""}
                          onChange={(event) => updatePolicy(group.label, "op_cost", event.target.value)}
                        />
                      </label>
                    </div>
                    <div className={styles.inRow}>
                      <label>
                        计划调整折扣
                        <input
                          type="number"
                          step="0.0001"
                          placeholder={num(group.d, 3)}
                          value={policies[group.label]?.d_plan ?? ""}
                          onChange={(event) => updatePolicy(group.label, "d_plan", event.target.value)}
                        />
                      </label>
                      <label>
                        计划承诺货量
                        <input
                          type="number"
                          step="1"
                          placeholder={String(Math.round(group.z))}
                          value={policies[group.label]?.z_plan ?? ""}
                          onChange={(event) => updatePolicy(group.label, "z_plan", event.target.value)}
                        />
                      </label>
                    </div>
                    <div className={styles.tiny}>
                      成本 {num(group.c)} · 调整前 {money(group.profit_now)} · 调整后{" "}
                      {group.filled ? money(group.profit_plan) : "填完四个值后自动计算"}
                    </div>
                  </div>
                ))
              )}
            </>
          ) : (
            <>
              <div className={styles.subHead}>
                <span>网点基础数据</span>
                <span className={styles.tiny}>起点：当前这个网点的实际数字</span>
              </div>
              {(
                [
                  ["z_now", "当前货量（kg）"],
                  ["p0", "原价 P0（元/kg）"],
                  ["d", "当前折扣"],
                  ["b_now", "当前杂费 B"],
                ] as Array<[keyof typeof manualDraft, string]>
              ).map(([key, label]) => (
                <label key={key} className={styles.field}>
                  <span>{label}</span>
                  <input
                    type="number"
                    step="0.0001"
                    value={String(manualDraft[key] ?? "")}
                    onChange={(event) =>
                      setInputs({ manual: { ...manualDraft, [key]: Number(event.target.value) } })
                    }
                  />
                </label>
              ))}

              <div className={styles.subHead}>
                <span>成本</span>
              </div>
              <label className={styles.field}>
                <span>车线成本（元/kg）</span>
                <input
                  type="number"
                  step="0.0001"
                  value={cLine}
                  onChange={(event) => {
                    setInputs({
                      cLine: event.target.value,
                      manual: {
                        ...manualDraft,
                        c: (Number(event.target.value) || 0) + (Number(opCost) || 0),
                      },
                    });
                  }}
                />
              </label>
              <label className={styles.field}>
                <span>操作成本（元/kg）</span>
                <input
                  type="number"
                  step="0.0001"
                  value={opCost}
                  onChange={(event) => {
                    setInputs({
                      opCost: event.target.value,
                      manual: {
                        ...manualDraft,
                        c: (Number(cLine) || 0) + (Number(event.target.value) || 0),
                      },
                    });
                  }}
                />
              </label>
              <label className={styles.field}>
                <span>C = 车线 + 操作（自动算）</span>
                <input type="text" readOnly value={num(manualDraft.c)} />
              </label>

              <div className={styles.subHead}>
                <span>计划政策</span>
              </div>
              <label className={styles.field}>
                <span>计划调整折扣</span>
                <input
                  type="number"
                  step="0.0001"
                  value={String(manualDraft.d_plan ?? "")}
                  onChange={(event) =>
                    setInputs({ manual: { ...manualDraft, d_plan: Number(event.target.value) } })
                  }
                />
              </label>
              <label className={styles.field}>
                <span>计划现价（自动算）</span>
                <input type="text" readOnly value={num(pPlanManual)} />
              </label>
              <label className={styles.field}>
                <span>计划杂费 B</span>
                <input
                  type="number"
                  step="1"
                  value={String(manualDraft.b_plan ?? "")}
                  onChange={(event) =>
                    setInputs({ manual: { ...manualDraft, b_plan: Number(event.target.value) } })
                  }
                />
              </label>
              <label className={styles.field}>
                <span>计划承诺货量（kg）</span>
                <input
                  type="number"
                  step="1"
                  value={String(manualDraft.z_plan ?? "")}
                  onChange={(event) =>
                    setInputs({ manual: { ...manualDraft, z_plan: Number(event.target.value) } })
                  }
                />
              </label>

              <div className={styles.acc}>
                <button type="button" className={styles.accHead} onClick={() => setShowFormula(!showFormula)}>
                  公式说明 <span>▾</span>
                </button>
                {showFormula && (
                  <div className={styles.accBody}>
                    P = P0 × d　m = P − C（单公斤利润）
                    <br />
                    利润 = (P − C) × Z + B　利润率 = 利润 ÷ (P × Z + B)
                    <br />
                    图中：调整前 L = m·Z + 当前杂费；调整后 L = m调·Z + B
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* ══ 右侧 ══ */}
        <div className={styles.right}>
          <div className={styles.summary}>
            <div className={styles.summaryCard}>
              <div className={styles.summaryLabel}>① 政策调整前 · 利润 / 利润率</div>
              <div className={styles.summaryValue}>
                {mode === "manual" ? (manual === null ? "—" : money(manual.profit_now)) : money(table?.profit_now ?? null)}
              </div>
              <div className={styles.summaryNote}>
                {mode === "manual"
                  ? manual === null
                    ? "填完左侧参数后自动计算"
                    : `利润 = ${money(manual.profit_now)}｜利润率 ${pct(manual.rate_now)}`
                  : `Σ（现价 − C组）× 数据货量｜利润率 ${pct(table?.rate_now ?? null)}`}
              </div>
            </div>
            <div className={styles.summaryCard}>
              <div className={styles.summaryLabel}>② 政策调整后 · 利润 / 利润率</div>
              <div className={styles.summaryValue}>
                {mode === "manual"
                  ? manual === null
                    ? "—"
                    : money(manual.profit_plan)
                  : table === null || table.profit_plan === null
                    ? "待填四个值"
                    : money(table.profit_plan)}
              </div>
              <div className={styles.summaryNote}>
                {mode === "manual"
                  ? manual === null
                    ? "填完左侧参数后自动计算"
                    : `利润 = ${money(manual.profit_plan)}｜利润率 ${pct(manual.rate_plan)}`
                  : `Σ（计划现价 − C组）× 计划货量｜利润率 ${pct(table?.rate_plan ?? null)}`}
              </div>
            </div>
          </div>

          <div className={styles.advice}>
            <div className={styles.adviceHead}>调整盈亏情况分析</div>
            {mode === "manual"
              ? (manual?.advice ?? "填完左侧参数后自动给出调整盈亏情况分析。")
              : (table?.advice ?? "填完每张卡片的四个值后，这里自动给出调整盈亏情况分析。")}
          </div>

          {loading && <div className={styles.hint}>计算中…</div>}
          {error !== null && <div className={styles.error}>{error}</div>}

          {mode === "manual" ? (
            <div
              className={styles.mini}
              onDoubleClick={() =>
                setZoom({
                  title: "货量 – 利润：调整前 vs 调整后",
                  option: manualOption,
                  legend: {
                    color: "#0071e3",
                    before: `调整前 ${money(manual?.profit_now ?? null)}`,
                    after: `调整后 ${money(manual?.profit_plan ?? null)}`,
                  },
                })
              }
              title="双击放大"
            >
              <div className={styles.miniTitle}>货量 – 利润：调整前 vs 调整后</div>
              <div className={styles.miniBox} style={{ height: 300 }}>
                <ReactECharts option={manualOption} style={{ height: "100%", width: "100%" }} notMerge />
              </div>
              <div className={styles.miniLegend}>
                <span>
                  <i className={`${styles.swDashed} ${styles.swGray}`} />
                  调整前 {money(manual?.profit_now ?? null)}（{pct(manual?.rate_now ?? null)}）
                </span>
                <span>
                  <i className={`${styles.swSolid} ${styles.swBlue}`} />
                  调整后 {money(manual?.profit_plan ?? null)}（{pct(manual?.rate_plan ?? null)}）
                </span>
              </div>
            </div>
          ) : (
            <div className={styles.charts}>
              {groups.map((group, index) => (
                <div
                  key={group.key}
                  className={styles.mini}
                  onDoubleClick={() =>
                    setZoom({
                      title: group.label,
                      option: groupOption(group, index),
                      legend: {
                        color: PALETTE[index % PALETTE.length],
                        before: `调整前 ${money(group.profit_now)}（${pct(group.rate_now)}）`,
                        after: group.filled
                          ? `调整后 ${money(group.profit_plan)}（${pct(group.rate_plan)}）`
                          : "调整后 待填",
                      },
                    })
                  }
                  title="双击放大"
                >
                  <div className={styles.miniTitle}>{group.label}</div>
                  <div className={styles.miniBox}>
                    <ReactECharts
                      option={groupOption(group, index)}
                      style={{ height: "100%", width: "100%" }}
                      notMerge
                    />
                  </div>
                  <div className={styles.miniLegend}>
                    <span>
                      <i className={styles.swDashed} />调整前 {money(group.profit_now)}（{pct(group.rate_now)}）
                    </span>
                    <span>
                      <i className={styles.swSolid} />调整后{" "}
                      {group.filled ? `${money(group.profit_plan)}（${pct(group.rate_plan)}）` : "待填"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className={`${styles.cardSoft} ${styles.concl}`}>
            <div className={styles.conclHead}>
              <b>
                {mode === "manual" ? "不同承诺货量下的保本折扣、利润与利润率" : "汇算明细（按分组）"}
              </b>
              <span className={styles.tiny}>
                {mode === "manual"
                  ? "利润 = (P − C) × Z + B"
                  : `合计货量 ${(table?.z ?? 0).toLocaleString("zh-CN")} kg · 计划货量 ${(table?.z_plan ?? 0).toLocaleString("zh-CN")} kg · 利润 = (P0·计划折扣 − C) × 计划货量`}
              </span>
            </div>
            {mode === "manual" ? (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>相对计划货量</th>
                    <th>承诺货量（kg）</th>
                    <th>该量下的保本折扣</th>
                    <th>中心利润（元）</th>
                    <th>利润率</th>
                    <th>判定</th>
                  </tr>
                </thead>
                <tbody>
                  {(manual?.steps ?? []).map((step) => (
                    <tr key={step.factor}>
                      <td>{step.factor}×</td>
                      <td>{step.z.toLocaleString("zh-CN")}</td>
                      <td>{pct(step.break_even_discount, 1)}</td>
                      <td>{money(step.profit)}</td>
                      <td>{pct(step.rate)}</td>
                      <td>
                        <span className={judgeClass(step.judge)}>{step.judge}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>分组</th>
                    <th>数据货量</th>
                    <th>原价</th>
                    <th>现价</th>
                    <th>折扣</th>
                    <th>成本</th>
                    <th>计划折扣</th>
                    <th>计划货量</th>
                    <th>调整前</th>
                    <th>调整后</th>
                    <th>利润率</th>
                    <th>判定</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => {
                    const badge = badgeOf(group);
                    return (
                      <tr key={group.key}>
                        <td>{group.label}</td>
                        <td>{group.z.toLocaleString("zh-CN")}</td>
                        <td>{num(group.p0)}</td>
                        <td>{num(group.p)}</td>
                        <td>{pct(group.d)}</td>
                        <td>{num(group.c)}</td>
                        <td>{group.filled ? pct(group.d_plan) : "—"}</td>
                        <td>{group.filled ? (group.z_plan ?? 0).toLocaleString("zh-CN") : "—"}</td>
                        <td>{money(group.profit_now)}</td>
                        <td>{group.filled ? money(group.profit_plan) : "—"}</td>
                        <td>{pct(group.rate_plan)}</td>
                        <td>
                          <span className={badge.className}>{badge.text}</span>
                        </td>
                      </tr>
                    );
                  })}
                  {groups.length > 0 && (
                    <tr>
                      <td>合计</td>
                      <td>{(table?.z ?? 0).toLocaleString("zh-CN")}</td>
                      <td>{num(table?.p0 ?? null)}</td>
                      <td>{num(table?.p ?? null)}</td>
                      <td>{pct(table?.d ?? null)}</td>
                      <td>—</td>
                      <td>{pct(table?.d_plan ?? null)}</td>
                      <td>{table?.z_plan ? table.z_plan.toLocaleString("zh-CN") : "—"}</td>
                      <td>{money(table?.profit_now ?? null)}</td>
                      <td>{money(table?.profit_plan ?? null)}</td>
                      <td>{pct(table?.rate_plan ?? null)}</td>
                      <td>—</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* 省份 × 公斤段级联浮层：portal 到 body（滚动容器里会被裁掉，坑 52/59） */}
      {cascadeOpen &&
        cascadeAnchor !== null &&
        createPortal(
          <div
            ref={cascadeRef}
            className={`${styles.portal} ${styles.cascade}`}
            style={{
              left: cascadeAnchor.left,
              top: cascadeAnchor.top,
              maxHeight: cascadeAnchor.maxHeight,
            }}
            role="dialog"
            aria-label="目的所属省份 × 公斤段"
          >
            <div className={styles.cascadeLeft}>
              <div className={styles.cascadeHint}>一级：点省份看它的公斤段</div>
              {provinceOptions.map((province) => {
                const chosen = provinceBands[province] ?? [];
                return (
                  <div
                    key={province}
                    className={`${styles.cascadeRow} ${
                      chosen.length > 0 ? styles.cascadeRowOn : ""
                    } ${province === activeProvince ? styles.cascadeRowActive : ""}`}
                    role="button"
                    tabIndex={0}
                    aria-pressed={chosen.length > 0}
                    title={
                      chosen.length > 0
                        ? `已勾 ${chosen.length} 段，点这里改`
                        : "点这里勾这个省份的公斤段"
                    }
                    onClick={() => setActiveProvince(province)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      setActiveProvince(province);
                    }}
                  >
                    <span className={styles.cascadeName}>{province}</span>
                    {chosen.length > 0 && (
                      <span className={styles.cascadeMeta}>{chosen.length} 段</span>
                    )}
                  </div>
                );
              })}
              {provinceOptions.length === 0 && (
                <div className={styles.cascadeEmpty}>当前口径下没有可选省份</div>
              )}
            </div>
            <div className={styles.cascadeRight}>
              <div className={styles.cascadeHint}>
                二级：{activeProvince ?? "省份"} 的公斤段（勾几项 = 只取这些，全取消 = 该省不参与 ｜ 已勾{" "}
                {(provinceBands[activeProvince ?? ""] ?? []).length} 项）
              </div>
              <div className={styles.cascadeList}>
                {bandOptionsFor(activeProvince).map((band) => (
                  <label key={band} className={styles.cascadeItem}>
                    <input
                      type="checkbox"
                      checked={(provinceBands[activeProvince ?? ""] ?? []).includes(band)}
                      onChange={() => {
                        if (activeProvince === null) return;
                        toggleProvinceBand(activeProvince, band);
                      }}
                    />
                    <span>{band}</span>
                  </label>
                ))}
                {activeProvince === null && (
                  <div className={styles.cascadeEmpty}>先在左边点一个省份</div>
                )}
                {activeProvince !== null && bandOptionsFor(activeProvince).length === 0 && (
                  <div className={styles.cascadeEmpty}>该省份没有可选公斤段</div>
                )}
              </div>
              <div className={styles.cascadeFoot}>
                <button
                  type="button"
                  className={styles.linkBtn}
                  title="该省份的公斤段全部勾选"
                  onClick={() => {
                    if (activeProvince === null) return;
                    setProvinceBands(activeProvince, bandOptionsFor(activeProvince));
                  }}
                >
                  全选
                </button>
                <button
                  type="button"
                  className={styles.linkBtn}
                  title="全部取消 = 这个省份不参与计算"
                  onClick={() => {
                    if (activeProvince === null) return;
                    setProvinceBands(activeProvince, []);
                  }}
                >
                  取消全选
                </button>
                <span className={styles.spacer} />
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setCascadeOpen(false);
                    setCascadeAnchor(null);
                  }}
                >
                  完成
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

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
              <ReactECharts option={zoom.option} style={{ height: "100%", width: "100%" }} notMerge />
            </div>
            {zoom.legend !== undefined && (
              <div className={styles.miniLegend} style={{ fontSize: 14, color: zoom.legend.color }}>
                <span>
                  <i className={styles.swDashed} />
                  {zoom.legend.before}
                </span>
                <span>
                  <i className={styles.swSolid} />
                  {zoom.legend.after}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export default RegressionPage;
