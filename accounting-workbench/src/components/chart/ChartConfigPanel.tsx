import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useAnalysisStore } from "../../stores/analysisStore";
import { useChartStore } from "../../stores/chartStore";
import {
  isNumericColumn,
  sanitizeConfigForType,
  xDimSummary,
  xDimsOf,
  withXDims,
} from "../../utils/chartData";
import { placeOverlay, type OverlayPlacement } from "../../utils/overlay";
import type { ChartType, ChartXDim } from "../../types/api";
import styles from "./ChartConfigPanel.module.css";

/** 图表类型：散点图已于 2026-10-30（第 14 轮）按用户要求下线，别再放回来。 */
const CHART_TYPES: { value: ChartType; label: string }[] = [
  { value: "line", label: "折线" },
  { value: "bar", label: "柱状" },
  { value: "pie", label: "饼图" },
];

/** 浮层宽度（与 CSS 里的 .cascade 宽度保持一致，用于视口夹取）。 */
const PICKER_WIDTH = 452;
/** 二级取值列表一次最多渲染多少项（真实数据 23 万行时一列可能有几十万个取值）。 */
const VALUE_LIMIT = 120;

/**
 * 原型 #chart-panel 的三行控件：图表类型 / X 轴 / Y 指标。
 *
 * X 轴（2026-10-28 需求 6）：可以叠加多个维度，各维度取值做组合，
 * 刻度 = 各维度取值用「 · 」连接，顺序 = 勾选维度的顺序；不勾取值 = 该维度全部值。
 *
 * 弹层用 portal 挂到 body 上（固定定位 + 视口夹取）：分析页右侧是 `overflow: auto`
 * 的滚动容器，放在里面会被裁掉、还会撑出横向滚动条把图表画布挤变形（真机反馈：点不开/卡住）。
 */
function ChartConfigPanel() {
  const result = useAnalysisStore((state) => state.result);
  const setToast = useAnalysisStore((state) => state.setToast);
  const config = useChartStore((state) => state.config);
  const updateConfig = useChartStore((state) => state.updateConfig);

  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const [anchor, setAnchor] = useState<OverlayPlacement | null>(null);
  const [activeField, setActiveField] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const open = anchor !== null;

  const { xCandidates, yCandidates } = useMemo(() => {
    if (result === null) return { xCandidates: [] as string[], yCandidates: [] as string[] };
    return {
      xCandidates: result.columns.filter((column) => !isNumericColumn(result, column)),
      yCandidates: result.columns.filter((column) => isNumericColumn(result, column)),
    };
  }, [result]);

  /* 已叠加的维度（顺序 = 组合标签顺序）；老的单字段配置在这里自动变成 1 个维度 */
  const dims = useMemo(() => xDimsOf(config), [config]);

  /* 二级面板看哪个维度的取值：用户点过的优先，否则第一个维度 */
  const activeDim = useMemo(() => {
    if (activeField !== null) return activeField;
    if (dims.length > 0) return dims[0].field;
    return xCandidates[0] ?? null;
  }, [activeField, dims, xCandidates]);

  const activeValues = useMemo(
    () => dims.find((dim) => dim.field === activeDim)?.values,
    [dims, activeDim],
  );

  /* 二级：当前维度在结果表里的取值（照原型级联菜单） */
  const xValueOptions = useMemo(() => {
    if (result === null || activeDim === null) return [] as string[];
    const index = result.columns.indexOf(activeDim);
    if (index < 0) return [] as string[];
    const seen = new Set<string>();
    for (const row of result.rows) {
      const value = String(row[index] ?? "");
      if (value !== "") seen.add(value);
    }
    return [...seen];
  }, [result, activeDim]);

  /* 取值太多时只渲染前 VALUE_LIMIT 个（可按关键字筛），避免真机卡死 */
  const visibleValues = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (keyword === "") return xValueOptions.slice(0, VALUE_LIMIT);
    const matched: string[] = [];
    for (const value of xValueOptions) {
      if (value.toLowerCase().includes(keyword)) {
        matched.push(value);
        if (matched.length >= VALUE_LIMIT) break;
      }
    }
    return matched;
  }, [xValueOptions, query]);

  /* 该字段当前是否真的在 X 轴上：有勾选取值才算「上轴」（用户 2026-10-28 定稿：
   * 勾取值 = 加入 X 轴，全部取消 = 拿下来，一级菜单不再有复选框）。 */
  const activeOnAxis = activeDim !== null && dims.some((dim) => dim.field === activeDim);

  /* 勾选状态用 Set 查：真机上某一列可能有上万个取值，数组 includes 会拖慢每一帧。
   * values === undefined 只出现在老配置里（= 不筛），那时按「全勾上」显示。
   * 字段不在 X 轴上时一律不勾（用户反馈 A：原来这里也命中兜底，显示成「全勾 / 已勾 N 项」）。 */
  const allSelected = activeOnAxis && activeValues === undefined;
  const chosenSet = useMemo(() => new Set(activeValues ?? []), [activeValues]);
  const pickedCount = !activeOnAxis
    ? 0
    : allSelected
      ? xValueOptions.length
      : (activeValues ?? []).length;

  /* 点外面 / Esc / 滚动或缩放窗口 → 收起浮层（浮层是固定定位，滚动后会错位） */
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent): void {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (pickerRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      setAnchor(null);
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") setAnchor(null);
    }
    function onViewportChange(event: Event): void {
      // 浮层自己内部的列表滚动不要收起（用户反馈 2：滚轮/拖滚动条就关）
      const target = event.target;
      if (target instanceof Node && pickerRef.current?.contains(target)) return;
      setAnchor(null);
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
  }, [open]);

  if (result === null) return null;

  const ySelected = config.show_fields.filter((field) => yCandidates.includes(field));

  function togglePicker(): void {
    if (open) {
      setAnchor(null);
      return;
    }
    if (xCandidates.length === 0) {
      setToast("先在「筛选条件」里加分组维度（文本字段 + 等于/不等于），图表才有 X 轴");
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect === undefined) return;
    // 视口夹取 + html { zoom } 换算统一走 placeOverlay（坑 62），不然开字号缩放时会跑出窗口
    setQuery("");
    setAnchor(
      placeOverlay({
        left: rect.left,
        belowY: rect.bottom + 6,
        aboveY: rect.top - 6,
        width: PICKER_WIDTH,
        designMax: 460,
        minBelow: 320,
        minHeight: 180,
      }),
    );
  }

  function commitDims(next: ChartXDim[]): void {
    updateConfig(withXDims(next));
  }

  /** 一级：点字段名只看它的取值 —— 不加轴、不移轴、不加按钮（用户 2026-10-28 定稿）。 */
  function selectDim(field: string): void {
    setActiveField(field);
    setQuery("");
  }

  function setDimValues(field: string, values: string[] | undefined): void {
    commitDims(dims.map((dim) => (dim.field === field ? { ...dim, values } : dim)));
  }

  /** 写一个维度的取值：勾空了 = 该字段不再是 X 轴维度（拿下来的唯一方式，不另加按钮）；
   *  字段本来不在轴上就按顺序追加成新维度（全选一个未上轴的字段 = 把它加进来）。 */
  function applyValues(field: string, values: string[]): void {
    if (values.length === 0) {
      commitDims(dims.filter((dim) => dim.field !== field));
      return;
    }
    if (!dims.some((dim) => dim.field === field)) {
      commitDims([...dims, { field, values }]);
      return;
    }
    setDimValues(field, values);
  }

  /** 勾/去勾一个取值：没上轴的字段勾一下就上轴（只取这一项）；全部取消 = 下轴。 */
  function toggleValue(value: string): void {
    if (activeDim === null) return;
    if (!activeOnAxis) {
      commitDims([...dims, { field: activeDim, values: [value] }]);
      return;
    }
    const current = allSelected ? xValueOptions : (activeValues ?? []);
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];
    applyValues(activeDim, next);
  }

  function handleTypeChange(type: ChartType): void {
    if (result === null) return;
    const sanitized = sanitizeConfigForType(config, type);
    updateConfig(sanitized.config);
  }

  function toggleY(field: string): void {
    const next = ySelected.includes(field)
      ? ySelected.filter((item) => item !== field)
      : [...ySelected, field];
    updateConfig({ show_fields: next, y_axis: next.length > 0 ? next[0] : null });
  }

  const picker =
    open && anchor !== null
      ? createPortal(
          <div
            ref={pickerRef}
            className={`${styles.portal} ${styles.cascade}`}
            style={{ left: anchor.left, top: anchor.top, maxHeight: anchor.maxHeight }}
            role="dialog"
            aria-label="X 轴维度与取值"
          >
            <div className={styles.cascadeLeft}>
              <div className={styles.cascadeHint}>一级：点字段名看取值（勾取值 = 加入 X 轴）</div>
              {xCandidates.map((column) => {
                const order = dims.findIndex((dim) => dim.field === column);
                const on = order >= 0;
                const values = on ? dims[order].values : undefined;
                return (
                  <div
                    key={column}
                    className={`${styles.dimRow} ${on ? styles.dimRowOn : ""} ${
                      column === activeDim ? styles.dimRowActive : ""
                    }`}
                    role="button"
                    tabIndex={0}
                    aria-pressed={on}
                    title={
                      on
                        ? `X 轴第 ${order + 1} 个维度，点这里改取值`
                        : "点这里看这个字段的取值（勾取值即加入 X 轴）"
                    }
                    onClick={() => selectDim(column)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      selectDim(column);
                    }}
                  >
                    <span className={styles.dimName}>{column}</span>
                    {on && <span className={styles.dimOrder}>{order + 1}</span>}
                    {on && (
                      <span className={styles.dimMeta}>
                        {values === undefined ? "全部" : `${values.length}项`}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className={styles.cascadeRight}>
              <div className={styles.cascadeHint}>
                二级：{activeDim ?? "字段"} 的取值（勾几项 = 只取这些，全取消 = 不上 X 轴 ｜ 已勾{" "}
                {pickedCount} 项）
              </div>
              {xValueOptions.length > VALUE_LIMIT && (
                <input
                  className={styles.search}
                  value={query}
                  placeholder={`共 ${xValueOptions.length} 项，输入关键字筛选`}
                  aria-label="筛选取值"
                  onChange={(event) => setQuery(event.target.value)}
                />
              )}
              <div className={styles.cascadeList}>
                {visibleValues.map((value) => (
                  <label key={value} className={styles.cascadeItem}>
                    <input
                      type="checkbox"
                      // 默认全不勾（不勾 = 全部）；只有明确勾过的取值才显示勾选
                      checked={allSelected || chosenSet.has(value)}
                      onChange={() => toggleValue(value)}
                    />
                    <span>{value}</span>
                  </label>
                ))}
                {activeDim !== null && xValueOptions.length === 0 && (
                  <div className={styles.cascadeEmpty}>该字段没有可选值</div>
                )}
                {activeDim !== null &&
                  xValueOptions.length > 0 &&
                  visibleValues.length === 0 && (
                    <div className={styles.cascadeEmpty}>没有匹配的取值</div>
                  )}
                {activeDim === null && (
                  <div className={styles.cascadeEmpty}>先在左边点一个字段</div>
                )}
              </div>
              <div className={styles.cascadeFoot}>
                <button
                  type="button"
                  className={styles.linkBtn}
                  onClick={() => {
                    if (activeDim === null || xValueOptions.length === 0) return;
                    applyValues(activeDim, [...xValueOptions]);
                  }}
                  title="该字段所有取值全部勾选"
                >
                  全选
                </button>
                <button
                  type="button"
                  className={styles.linkBtn}
                  onClick={() => {
                    if (activeDim === null) return;
                    // 全部取消 = 这个字段不再作为 X 轴维度（勾取值才算上轴）
                    applyValues(activeDim, []);
                  }}
                  title="全部取消勾选 = 这个字段不再作为 X 轴维度"
                >
                  取消全选
                </button>
                <span className={styles.spacer} />
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setAnchor(null)}
                >
                  完成
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className={styles.controls}>
      <div className={styles.row}>
        <span className={styles.label}>图表类型</span>
        <div className="segmented">
          {CHART_TYPES.map((type) => (
            <button
              key={type.value}
              type="button"
              className={config.chart_type === type.value ? "on" : ""}
              onClick={() => handleTypeChange(type.value)}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.row}>
        <span className={styles.label}>X 轴</span>
        <div className={styles.xWrap}>
          <button
            ref={buttonRef}
            type="button"
            className={`btn btn-secondary ${styles.xButton}`}
            title={xDimSummary(config)}
            aria-expanded={open}
            onClick={togglePicker}
          >
            <span className={styles.xLabel}>{xDimSummary(config)}</span>
            <span className={styles.caret}>▾</span>
          </button>
        </div>
      </div>

      <div className={styles.row}>
        <span className={styles.label}>Y 指标</span>
        <div className={styles.chips}>
          {yCandidates.length === 0 && <span className="tiny">结果表还没有数值列</span>}
          {yCandidates.map((column) => (
            <button
              key={column}
              type="button"
              className={`${styles.chip} ${ySelected.includes(column) ? styles.chipOn : ""}`}
              onClick={() => toggleY(column)}
            >
              {column}
            </button>
          ))}
        </div>
      </div>

      {picker}
    </div>
  );
}

export default ChartConfigPanel;
