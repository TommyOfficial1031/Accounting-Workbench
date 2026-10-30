import { useEffect, useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";

import Modal from "../common/Modal";
import { useEconStore } from "../../stores/econStore";
import { formatChartValue } from "../../utils/numberFormat";
import { pickDirectory } from "../../utils/platform";
import type {
  RegressionGroup,
  RegressionManualConfig,
  RegressionTableRequest,
} from "../../types/api";
import styles from "./RegressionWindow.module.css";

interface RegressionWindowProps {
  onClose: () => void;
  datasetId: string | null;
  timeRange: { start: string; end: string; field: string };
}

type Mode = "table" | "manual";

const DIM_CANDIDATES = ["寄件所属一级网点"];
const PROVINCE_FIELD = "目的所属省份";
const BAND_FIELD = "公斤段";
/** 省份 × 公斤段级联：每个省份各自勾自己的公斤段（第 11 轮 A①，旧窗口同步）。 */
type CascadeMap = Record<string, string[]>;

function money(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const rounded = Math.abs(value) < 0.5 ? 0 : value;
  return `${rounded < 0 ? "-¥" : "¥"}${Math.abs(rounded).toLocaleString("zh-CN", {
    maximumFractionDigits: 0,
  })}`;
}

function pct(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

function num(value: number | null, digits = 4): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

/** 文件夹名用的时间戳：YYYY-MM-DD HH：MM（必须全角冒号，半角冒号在 Windows 上非法）。 */
function formatStamp(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  const ymd = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const hm = `${pad(date.getHours())}：${pad(date.getMinutes())}`;
  return `${ymd} ${hm}`;
}

/** 手动测算的默认值（与原型一致：48.5 折、车线 0.3、操作 0.08）。 */
function defaultManual(): RegressionManualConfig {
  return {
    p0: 0.8,
    d: 0.85,
    d_plan: 0.7,
    b_now: 3000,
    b_plan: 2000,
    c: 0.38,
    z_now: 120000,
    z_plan: 150000,
  };
}

interface PolicyDraft {
  c_line: string;
  op_cost: string;
  d_plan: string;
  z_plan: string;
}

const EMPTY_POLICY: PolicyDraft = { c_line: "", op_cost: "", d_plan: "", z_plan: "" };

function RegressionWindow({ onClose, datasetId, timeRange }: RegressionWindowProps) {
  const manual = useEconStore((state) => state.manual);
  const table = useEconStore((state) => state.table);
  const loading = useEconStore((state) => state.loading);
  const error = useEconStore((state) => state.error);
  const runManualModel = useEconStore((state) => state.runManualModel);
  const runTableModel = useEconStore((state) => state.runTableModel);
  const loadValues = useEconStore((state) => state.loadValues);
  const exportTable = useEconStore((state) => state.exportTable);
  const exportManual = useEconStore((state) => state.exportManual);
  const values = useEconStore((state) => state.values);

  const [mode, setMode] = useState<Mode>(datasetId === null ? "manual" : "table");
  const [manualDraft, setManualDraft] = useState<RegressionManualConfig>(defaultManual);
  const [dims, setDims] = useState<string[]>(["寄件所属一级网点"]);
  const [picks, setPicks] = useState<Record<string, string[]>>({});
  /** 省份 → 该省勾选的公斤段（旧窗口没有级联浮层，直接用两列 chip 表达） */
  const [cascade, setCascade] = useState<CascadeMap>({});
  const [policies, setPolicies] = useState<Record<string, PolicyDraft>>({});
  const [exportHint, setExportHint] = useState<string | null>(null);

  const cascadeValues = useEconStore((state) => state.cascadeValues);

  useEffect(() => {
    if (datasetId === null) return;
    void loadValues(
      datasetId,
      [...DIM_CANDIDATES, PROVINCE_FIELD, BAND_FIELD],
      { parent: PROVINCE_FIELD, child: BAND_FIELD },
    );
  }, [datasetId, loadValues]);

  useEffect(() => {
    void runManualModel(manualDraft);
    // 只在首次打开时算一次默认值
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tableRequest = useMemo<RegressionTableRequest | null>(() => {
    if (datasetId === null) return null;
    const parsedPolicies: Record<string, PolicyDraft> = policies;
    // 有级联勾选时 dims 顺序固定为 网点 → 省份 → 公斤段（标签 = 网点 · 省份 · 公斤段）
    const activeCascade = Object.fromEntries(
      Object.entries(cascade).filter(([, bands]) => bands.length > 0),
    ) as CascadeMap;
    const cascadeProvinces = Object.keys(activeCascade);
    const effectiveDims = [
      ...(dims.includes("寄件所属一级网点") || cascadeProvinces.length === 0
        ? ["寄件所属一级网点"]
        : []),
      ...(cascadeProvinces.length > 0 ? [PROVINCE_FIELD, BAND_FIELD] : []),
    ];
    const effectivePicks: Record<string, string[]> = {};
    if (effectiveDims.includes("寄件所属一级网点")) {
      effectivePicks["寄件所属一级网点"] = picks["寄件所属一级网点"] ?? [];
    }
    if (cascadeProvinces.length > 0) {
      effectivePicks[PROVINCE_FIELD] = cascadeProvinces;
      effectivePicks[BAND_FIELD] = [...new Set(Object.values(activeCascade).flat())];
    }
    const payload: RegressionTableRequest = {
      dataset_id: datasetId,
      time_range: timeRange,
      dims: effectiveDims,
      picks: effectivePicks,
      cascade: cascadeProvinces.length > 0 ? { [PROVINCE_FIELD]: activeCascade } : undefined,
      policies: Object.fromEntries(
        Object.entries(parsedPolicies)
          .map(([key, draft]) => {
            const entry: Record<string, number> = {};
            if (draft.c_line.trim() !== "") entry.c_line = Number(draft.c_line);
            if (draft.op_cost.trim() !== "") entry.op_cost = Number(draft.op_cost);
            if (draft.d_plan.trim() !== "") entry.d_plan = Number(draft.d_plan);
            if (draft.z_plan.trim() !== "") entry.z_plan = Number(draft.z_plan);
            return [key, entry] as const;
          })
          .filter(([, entry]) => Object.keys(entry).length > 0),
      ),
    };
    return payload;
  }, [datasetId, timeRange, dims, picks, cascade, policies]);

  function toggleDim(field: string): void {
    setDims((current) =>
      current.includes(field) ? current.filter((item) => item !== field) : [...current, field],
    );
  }

  function togglePick(field: string, value: string): void {
    setPicks((current) => {
      const next = current[field] ?? [];
      return {
        ...current,
        [field]: next.includes(value) ? next.filter((item) => item !== value) : [...next, value],
      };
    });
  }

  /** 勾 / 去勾某省的某个公斤段（全部取消 = 该省不参与）。 */
  function toggleProvinceBand(province: string, band: string): void {
    setCascade((current) => {
      const chosen = current[province] ?? [];
      const next = chosen.includes(band) ? chosen.filter((item) => item !== band) : [...chosen, band];
      const mapping: CascadeMap = { ...current };
      if (next.length === 0) delete mapping[province];
      else mapping[province] = next;
      return mapping;
    });
  }

  /** 该省份的候选公斤段（真实数据里出现过的；没有映射时退回全量候选）。 */
  function bandOptionsFor(province: string): string[] {
    const own = cascadeValues[province];
    return own !== undefined && own.length > 0 ? own : (values[BAND_FIELD] ?? []);
  }

  function updatePolicy(label: string, key: keyof PolicyDraft, value: string): void {
    setPolicies((current) => ({
      ...current,
      [label]: { ...(current[label] ?? EMPTY_POLICY), [key]: value },
    }));
  }


  /** 手动测算：L(Z) = m·Z + B 的两条线，附基准盈利线与计划货量竖线。 */
  const manualOption = useMemo<EChartsOption>(() => {
    if (manual === null) return {};
    const zMax = Math.max(manualDraft.z_now, manualDraft.z_plan, 1) * 2;
    const step = zMax / 40;
    const axis = Array.from({ length: 41 }, (_, index) => Math.round(index * step));
    const lineOf = (margin: number, fee: number) =>
      axis.map((z) => Math.round(margin * z + fee));
    return {
      grid: { left: 72, right: 28, top: 44, bottom: 48 },
      tooltip: { trigger: "axis", valueFormatter: formatChartValue },
      legend: { top: 0 },
      xAxis: { type: "category", data: axis, boundaryGap: false, name: "货量（kg）" },
      yAxis: {
        type: "value",
        name: "利润（元）",
        axisLabel: { formatter: formatChartValue },
      },
      series: [
        {
          name: "调整前",
          type: "line",
          showSymbol: false,
          lineStyle: { type: "dashed", width: 2 },
          itemStyle: { color: "#6e6e73" },
          data: lineOf(manual.m_now, manualDraft.b_now),
          markLine: {
            symbol: "none",
            lineStyle: { color: "#ff3b30", type: "dashed", width: 1.2 },
            data: [{ yAxis: 0, label: { formatter: "基准盈利线（利润 0）", position: "insideStartTop" } }],
          },
        },
        {
          name: "调整后",
          type: "line",
          showSymbol: false,
          lineStyle: { width: 2.2 },
          itemStyle: { color: "#0071e3" },
          data: lineOf(manual.m_plan, manualDraft.b_plan),
          markLine: {
            symbol: "none",
            lineStyle: { color: "#8e8e93", type: "dashed", width: 1.1 },
            data: [
              {
                xAxis: axis.findIndex((value) => value >= manualDraft.z_plan),
                label: { formatter: `计划货量 ${manualDraft.z_plan.toLocaleString("zh-CN")}`, position: "insideEndTop" },
              },
            ],
          },
        },
      ],
    };
  }, [manual, manualDraft.z_now, manualDraft.z_plan, manualDraft.b_now, manualDraft.b_plan]);

  /** 表格取数：每组一对线（调整前虚线 / 调整后实线），不含杂费所以都过原点。 */
  const tableOption = useMemo<EChartsOption>(() => {
    if (table === null) return {};
    const groups = table.groups.filter((group) => group.filled);
    const source = groups.length > 0 ? groups : table.groups;
    const zMax = Math.max(...source.map((group) => Math.max(group.z, group.z_plan ?? 0)), 1) * 1.6;
    const step = zMax / 30;
    const axis = Array.from({ length: 31 }, (_, index) => Math.round(index * step));
    const colors = ["#0071e3", "#34c759", "#ff9500", "#af52de", "#ff3b30", "#5ac8fa"];
    const series: NonNullable<EChartsOption["series"]> = [];
    source.forEach((group, index) => {
      const color = colors[index % colors.length];
      const mNow = (group.p ?? 0) - group.c;
      series.push({
        name: `${group.label} · 调整前`,
        type: "line",
        showSymbol: false,
        lineStyle: { type: "dashed", width: 1.5 },
        itemStyle: { color },
        data: axis.map((z) => Math.round(mNow * z)),
      });
      if (group.filled && group.p_plan !== null) {
        const mPlan = group.p_plan - group.c;
        series.push({
          name: `${group.label} · 调整后`,
          type: "line",
          showSymbol: false,
          lineStyle: { width: 2.2 },
          itemStyle: { color },
          data: axis.map((z) => Math.round(mPlan * z)),
        });
      }
    });
    series.push({
      name: "基准盈利线",
      type: "line",
      showSymbol: false,
      itemStyle: { color: "#ff3b30" },
      lineStyle: { type: "dashed", width: 1.2 },
      data: axis.map(() => 0),
      tooltip: { show: false },
    });
    return {
      grid: { left: 76, right: 28, top: 48, bottom: 48 },
      tooltip: { trigger: "axis", valueFormatter: formatChartValue },
      legend: { top: 0, type: "scroll" },
      xAxis: { type: "category", data: axis, boundaryGap: false, name: "货量（kg）" },
      yAxis: {
        type: "value",
        name: "利润（元）",
        axisLabel: { formatter: formatChartValue },
      },
      series,
    };
  }, [table]);


  /** 导出文件夹：整页 PDF + 网格 JPEG + 单图 JPEG + 汇算明细 XLSX。 */
  async function runExport(target: "manual" | "table"): Promise<void> {
    const dir = await pickDirectory();
    if (dir === null) {
      setExportHint("浏览器环境不支持选择目录，请在桌面应用里导出");
      return;
    }
    const stamp = formatStamp(new Date());
    const scope = dims.length > 0 ? picks[dims[0]]?.join("、") ?? "全部" : "全部";
    const message =
      target === "manual"
        ? await exportManual(manualDraft, dir, stamp)
        : await exportTable(dir, stamp, scope);
    setExportHint(message ?? useEconStore.getState().error ?? "导出失败");
  }

  const groups: RegressionGroup[] = table?.groups ?? [];

  return (
    <Modal title="盈亏平衡与折扣分析" onClose={onClose}>
      <div className={styles.modeRow}>
        <button
          type="button"
          className={mode === "table" ? styles.modeActive : styles.mode}
          onClick={() => setMode("table")}
          disabled={datasetId === null}
          title={datasetId === null ? "先导入表格才能用表格取数" : "按勾选组合拆卡片"}
        >
          表格取数
        </button>
        <button
          type="button"
          className={mode === "manual" ? styles.modeActive : styles.mode}
          onClick={() => setMode("manual")}
        >
          手动测算
        </button>
        <span className={styles.spacer} />
        {loading && <span className={styles.hint}>计算中…</span>}
      </div>

      {error !== null && <p className={styles.error}>{error}</p>}

      {mode === "manual" && (
        <section className={styles.section}>
          <div className={styles.grid}>
            {(
              [
                ["p0", "原价 P0（元/kg）"],
                ["d", "当前折扣"],
                ["d_plan", "计划折扣"],
                ["c", "C = 车线 + 操作（元/kg）"],
                ["b_now", "当前杂费 B"],
                ["b_plan", "计划杂费 B"],
                ["z_now", "当前货量（kg）"],
                ["z_plan", "计划承诺货量（kg）"],
              ] as Array<[keyof RegressionManualConfig, string]>
            ).map(([key, label]) => (
              <label key={key} className={styles.field}>
                <span>{label}</span>
                <input
                  type="number"
                  step="0.0001"
                  value={String(manualDraft[key] ?? "")}
                  onChange={(event) =>
                    setManualDraft((current) => ({
                      ...current,
                      [key]: Number(event.target.value),
                    }))
                  }
                />
              </label>
            ))}
          </div>
          <button
            type="button"
            className={styles.primary}
            onClick={() => void runManualModel(manualDraft)}
          >
            计算
          </button>

          {manual !== null && (
            <>
              <div className={styles.cards}>
                <div className={styles.card}>
                  <span className={styles.cardTitle}>① 政策调整前</span>
                  <strong className={styles.cardValue}>{money(manual.profit_now)}</strong>
                  <span className={styles.cardNote}>
                    利润率 {pct(manual.rate_now)} · 现价 {num(manual.p_now)} · 单公斤{" "}
                    {num(manual.m_now)}
                  </span>
                </div>
                <div className={styles.card}>
                  <span className={styles.cardTitle}>② 政策调整后</span>
                  <strong className={styles.cardValue}>{money(manual.profit_plan)}</strong>
                  <span className={styles.cardNote}>
                    利润率 {pct(manual.rate_plan)} · 现价 {num(manual.p_plan)} · 保本折扣{" "}
                    {pct(manual.break_even_discount)}
                  </span>
                </div>
              </div>
              <p className={styles.advice}>{manual.advice}</p>
              <div className={styles.dimRow}>
                <button type="button" className={styles.primary} onClick={() => void runExport("manual")}>
                  导出文件夹（PDF / JPEG / XLSX）
                </button>
                {exportHint !== null && <span className={styles.hint}>{exportHint}</span>}
              </div>

              {/* 手动模式图表 */}
              <div className={styles.chart}>
                <ReactECharts option={manualOption} style={{ height: 300, width: "100%" }} notMerge />
              </div>

              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>相对计划货量</th>
                    <th>承诺货量</th>
                    <th>保本折扣</th>
                    <th>中心利润</th>
                    <th>利润率</th>
                    <th>判定</th>
                  </tr>
                </thead>
                <tbody>
                  {manual.steps.map((step) => (
                    <tr key={step.factor}>
                      <td>{step.factor}×</td>
                      <td>{step.z.toLocaleString("zh-CN")} kg</td>
                      <td>{pct(step.break_even_discount)}</td>
                      <td>{money(step.profit)}</td>
                      <td>{pct(step.rate)}</td>
                      <td>{step.judge}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>
      )}

      {mode === "table" && (
        <section className={styles.section}>
          <div className={styles.dimRow}>
            <span className={styles.hint}>分组维度</span>
            {DIM_CANDIDATES.map((field) => (
              <button
                key={field}
                type="button"
                className={dims.includes(field) ? styles.chipOn : styles.chip}
                onClick={() => toggleDim(field)}
              >
                {field}
              </button>
            ))}
          </div>

          {DIM_CANDIDATES.filter((field) => dims.includes(field)).map((field) => (
            <div key={field} className={styles.pickRow}>
              <span className={styles.hint}>{field}</span>
              {(values[field] ?? []).slice(0, 12).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={(picks[field] ?? []).includes(value) ? styles.chipOn : styles.chip}
                  onClick={() => togglePick(field, value)}
                >
                  {value}
                </button>
              ))}
              {(values[field] ?? []).length === 0 && (
                <span className={styles.hint}>（没有候选值）</span>
              )}
            </div>
          ))}

          {/* 省份 × 公斤段：每省各自勾公斤段（旧窗口用两列 chip 表达，与新页面同一份 cascade 口径） */}
          <div className={styles.pickRow}>
            <span className={styles.hint}>{PROVINCE_FIELD} × {BAND_FIELD}</span>
            {(values[PROVINCE_FIELD] ?? []).slice(0, 12).map((province) => (
              <div key={province} className={styles.pickRow}>
                <span className={styles.hint}>
                  {province}
                  {(cascade[province] ?? []).length > 0 ? `（已选 ${cascade[province].length} 段）` : ""}
                </span>
                {bandOptionsFor(province).slice(0, 8).map((band) => (
                  <button
                    key={`${province}-${band}`}
                    type="button"
                    className={
                      (cascade[province] ?? []).includes(band) ? styles.chipOn : styles.chip
                    }
                    onClick={() => toggleProvinceBand(province, band)}
                  >
                    {band}
                  </button>
                ))}
              </div>
            ))}
            {(values[PROVINCE_FIELD] ?? []).length === 0 && (
              <span className={styles.hint}>（没有候选省份）</span>
            )}
          </div>

          <button
            type="button"
            className={styles.primary}
            disabled={tableRequest === null}
            onClick={() => {
              if (tableRequest !== null) void runTableModel(tableRequest);
            }}
          >
            计算
          </button>

          {table !== null && (
            <>
              <div className={styles.cards}>
                <div className={styles.card}>
                  <span className={styles.cardTitle}>① 政策调整前</span>
                  <strong className={styles.cardValue}>{money(table.profit_now)}</strong>
                  <span className={styles.cardNote}>
                    利润率 {pct(table.rate_now)} · 数据货量{" "}
                    {table.z.toLocaleString("zh-CN")} kg
                  </span>
                </div>
                <div className={styles.card}>
                  <span className={styles.cardTitle}>② 政策调整后</span>
                  <strong className={styles.cardValue}>
                    {table.profit_plan === null ? "待填四个值" : money(table.profit_plan)}
                  </strong>
                  <span className={styles.cardNote}>
                    利润率 {pct(table.rate_plan)} · 已填 {table.filled_count}/{table.groups.length} 组
                  </span>
                </div>
              </div>
              <p className={styles.advice}>{table.advice}</p>
              <div className={styles.dimRow}>
                <button type="button" className={styles.primary} onClick={() => void runExport("table")}>
                  导出文件夹（PDF / JPEG / XLSX）
                </button>
                {exportHint !== null && <span className={styles.hint}>{exportHint}</span>}
              </div>

              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>分组</th>
                    <th>车线</th>
                    <th>操作</th>
                    <th>计划折扣</th>
                    <th>计划货量</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => (
                    <tr key={group.key}>
                      <td>{group.label}</td>
                      {(["c_line", "op_cost", "d_plan", "z_plan"] as const).map((key) => (
                        <td key={key}>
                          <input
                            className={styles.cellInput}
                            type="number"
                            step="0.0001"
                            placeholder={key === "op_cost" ? "0.08" : ""}
                            value={(policies[group.label] ?? EMPTY_POLICY)[key]}
                            onChange={(event) => updatePolicy(group.label, key, event.target.value)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* 表格模式图表 */}
              <div className={styles.chart}>
                <ReactECharts option={tableOption} style={{ height: 300, width: "100%" }} notMerge />
              </div>

              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>分组</th>
                    <th>数据货量</th>
                    <th>原价</th>
                    <th>现价</th>
                    <th>折扣</th>
                    <th>成本</th>
                    <th>调整前</th>
                    <th>调整后</th>
                    <th>利润率</th>
                    <th>判定</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => (
                    <tr key={`${group.key}-detail`}>
                      <td>{group.label}</td>
                      <td>{group.z.toLocaleString("zh-CN")}</td>
                      <td>{num(group.p0)}</td>
                      <td>{num(group.p)}</td>
                      <td>{pct(group.d)}</td>
                      <td>{num(group.c)}</td>
                      <td>{money(group.profit_now)}</td>
                      <td>{group.filled ? money(group.profit_plan) : "—"}</td>
                      <td>{pct(group.rate_plan)}</td>
                      <td>
                        {!group.filled
                          ? "待填值"
                          : (group.profit_plan ?? 0) > 0
                            ? "盈利"
                            : (group.profit_plan ?? 0) < 0
                              ? "亏损"
                              : "持平"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>
      )}
    </Modal>
  );
}

export default RegressionWindow;
