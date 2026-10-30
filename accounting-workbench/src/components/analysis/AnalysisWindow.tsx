import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import type { ExportFormat } from "../../api/export";
import type { AggFunc } from "../../types/api";
import {
  useAnalysisStore,
  MAX_FILTER_ROWS,
  MAX_METRIC_BOXES,
  MAX_METRIC_SLOTS,
} from "../../stores/analysisStore";
import { useProjectStore } from "../../stores/projectStore";
import {
  AGGS,
  METRIC_OPS,
  boxExpression,
  boxLabel,
  computedBoxes,
  isTextField,
  opsFor,
  parenDepths,
  resultColumnsOf,
  type AnalysisFilterRow,
  type MetricBox,
  type MetricOpChoice,
  type MetricToken,
} from "../../utils/analysisRows";
import ChartConfigPanel from "../chart/ChartConfigPanel";
import ChartPreview from "../chart/ChartPreview";
import Modal from "../common/Modal";
import Picker, { type PickerItem } from "./Picker";
import pageStyles from "../../pages/AnalysisPage.module.css";

interface AnalysisWindowProps {
  onClose: () => void;
  onOpenRegression?: () => void;
}

type ResultTab = "table" | "chart";

/** 弹出选择器四态：新指标 / 指标内的字段槽 / 条件字段 / 条件取值。 */
type PickerState =
  | { type: "metric-box"; left: number; top: number }
  | { type: "metric-slot"; boxId: string; slotId?: string; left: number; top: number }
  | { type: "filter-field"; rowId?: string; left: number; top: number }
  | { type: "filter-value"; rowId: string; left: number; top: number };

/** 原型 fmtNum：数字千分位、最多 3 位小数；非数字显示破折号。 */
function fmtNum(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toLocaleString("zh-CN", { maximumFractionDigits: 3 });
  }
  return "—";
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function pickerPosition(anchor: Element | null): { left: number; top: number } {
  if (anchor === null) return { left: 24, top: 120 };
  const rect = anchor.getBoundingClientRect();
  // 这里只给「视觉坐标」的期望位置：越界 / 翻上去 / html { zoom } 换算全交给 Picker 的
  // placeOverlay()（坑 62：原来这里用 window.innerHeight 夹取，和 rect 不是一个坐标空间）
  return { left: rect.left, top: rect.bottom + 4 };
}

function AnalysisWindow({ onClose, onOpenRegression }: AnalysisWindowProps) {
  const dataset = useAnalysisStore((state) => state.dataset);
  const ruleName = useAnalysisStore((state) => state.ruleName);
  const timePreset = useAnalysisStore((state) => state.timePreset);
  const timeRange = useAnalysisStore((state) => state.timeRange);
  const filterRows = useAnalysisStore((state) => state.filterRows);
  const metricBoxes = useAnalysisStore((state) => state.metricBoxes);
  const valueOptions = useAnalysisStore((state) => state.valueOptions);
  const result = useAnalysisStore((state) => state.result);
  const loading = useAnalysisStore((state) => state.loading);
  const error = useAnalysisStore((state) => state.error);
  const setTimePreset = useAnalysisStore((state) => state.setTimePreset);
  const setTimeRange = useAnalysisStore((state) => state.setTimeRange);
  const addFilterRows = useAnalysisStore((state) => state.addFilterRows);
  const updateFilterRow = useAnalysisStore((state) => state.updateFilterRow);
  const removeFilterRow = useAnalysisStore((state) => state.removeFilterRow);
  const moveFilterRow = useAnalysisStore((state) => state.moveFilterRow);
  const moveFilterRowTo = useAnalysisStore((state) => state.moveFilterRowTo);
  const addMetricBoxes = useAnalysisStore((state) => state.addMetricBoxes);
  const addMetricSlots = useAnalysisStore((state) => state.addMetricSlots);
  const updateMetricSlot = useAnalysisStore((state) => state.updateMetricSlot);
  const removeMetricSlot = useAnalysisStore((state) => state.removeMetricSlot);
  const removeMetricBox = useAnalysisStore((state) => state.removeMetricBox);
  const moveMetricBox = useAnalysisStore((state) => state.moveMetricBox);
  const moveMetricBoxTo = useAnalysisStore((state) => state.moveMetricBoxTo);
  const setMetricOp = useAnalysisStore((state) => state.setMetricOp);
  const removeMetricParenToken = useAnalysisStore((state) => state.removeMetricParenToken);
  const toggleMetricCollapse = useAnalysisStore((state) => state.toggleMetricCollapse);
  const loadValues = useAnalysisStore((state) => state.loadValues);
  const renameResultColumn = useAnalysisStore((state) => state.renameResultColumn);
  const editResultCell = useAnalysisStore((state) => state.editResultCell);
  const setToast = useAnalysisStore((state) => state.setToast);
  const compute = useAnalysisStore((state) => state.compute);
  const exportTable = useAnalysisStore((state) => state.exportTable);
  const exportChart = useAnalysisStore((state) => state.exportChart);
  const projectName = useProjectStore(
    (state) => state.currentProject?.name ?? null,
  );

  const [tab, setTab] = useState<ResultTab>("table");
  const [exportOpen, setExportOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [dragRow, setDragRow] = useState<string | null>(null);
  const [dropRow, setDropRow] = useState<string | null>(null);
  const exportRef = useRef<HTMLDivElement | null>(null);

  /* 导出下拉：点页面其他地方自动收起（用户反馈 2026-10-28） */
  useEffect(() => {
    if (!exportOpen) return;
    function onPointerDown(event: MouseEvent): void {
      const target = event.target;
      if (target instanceof Node && exportRef.current?.contains(target)) return;
      setExportOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [exportOpen]);

  const timeStart = timeRange?.start ?? "";
  const timeEnd = timeRange?.end ?? "";
  const timeField = timeRange?.field ?? "";
  const datasetId = dataset?.id ?? "";
  const columns = dataset?.columns ?? [];

  /* 字段可用性 / 取值候选跟着「时间范围」刷新（同一签名只请求一次）。 */
  const usedFields = [
    ...filterRows.map((row) => row.field),
    ...metricBoxes.flatMap((box) => tokenSlots(box).map((slot) => slot.field)),
  ].join("|");
  useEffect(() => {
    if (datasetId === "") return;
    void loadValues();
  }, [datasetId, timeStart, timeEnd, timeField, usedFields, loadValues]);

  const closePicker = useCallback(() => setPicker(null), []);

  const dimFields = useMemo(
    () =>
      filterRows
        .filter((row) => isTextField(columns, row.field) && (row.op === "eq" || row.op === "ne"))
        .map((row) => row.field)
        .filter((field, index, list) => list.indexOf(field) === index),
    [filterRows, columns],
  );
  const resultColumns = useMemo(() => (result === null ? [] : result.columns), [result]);
  const numericColumns = useMemo(() => {
    if (result === null) return [] as boolean[];
    return result.columns.map((_, index) =>
      result.rows.some((row) => typeof row[index] === "number"),
    );
  }, [result]);
  const previewColumns = useMemo(
    () => resultColumnsOf(filterRows, metricBoxes, columns),
    [filterRows, metricBoxes, columns],
  );

  if (dataset === null) return null;

  const totals = (result?.meta.totals ?? {}) as Record<string, unknown>;
  const groupCounts = Array.isArray(result?.meta.group_counts)
    ? (result?.meta.group_counts as number[])
    : [];
  const scanned = typeof result?.meta.scanned === "number" ? result.meta.scanned : 0;
  const ranged = typeof result?.meta.ranged === "number" ? result.meta.ranged : 0;
  const filtered = typeof result?.meta.filtered === "number" ? result.meta.filtered : 0;
  const unknownCount =
    typeof result?.meta.unknown_date_count === "number"
      ? (result.meta.unknown_date_count as number)
      : 0;
  const slotCount = metricBoxes.reduce((count, box) => count + tokenSlots(box).length, 0);

  const subTitle =
    ruleName !== null
      ? `${projectName ?? dataset.name} · 固定规则：${ruleName}`
      : `${projectName ?? dataset.name} · 自由分析`;

  function fieldItems(): PickerItem[] {
    return columns.map((column) => {
      const values = valueOptions[column.name];
      const available = values === undefined || values.length > 0;
      return {
        value: column.name,
        label: column.name,
        meta: `${column.dtype === "number" ? "数值" : "文本"}${available ? "" : " · 无数据"}`,
        disabled: !available,
      };
    });
  }

  function openPicker(next: PickerState, anchor: Element | null): void {
    setPicker({ ...next, ...pickerPosition(anchor) });
  }

  function handleFieldConfirm(values: string[]): void {
    const current = picker;
    setPicker(null);
    if (current === null) return;

    if (current.type === "filter-field") {
      if (current.rowId !== undefined) {
        const [first, ...rest] = values;
        if (first === undefined) return;
        updateFilterRow(current.rowId, {
          field: first,
          op: isTextField(columns, first) ? "eq" : "gt",
          values: [],
          value: "",
          value2: "",
        });
        if (rest.length > 0) addFilterRows(rest);
        setToast(`已替换为「${first}」`);
        return;
      }
      addFilterRows(values);
      setToast(`已添加 ${values.length} 个条件`);
      return;
    }

    if (current.type === "metric-box") {
      addMetricBoxes(values);
      return;
    }
    if (current.type !== "metric-slot") return;

    const [first, ...rest] = values;
    if (current.slotId !== undefined) {
      if (first === undefined) return;
      updateMetricSlot(current.boxId, current.slotId, { field: first });
      if (rest.length > 0) addMetricSlots(current.boxId, rest);
      setToast(`已替换为「${first}」`);
      return;
    }
    addMetricSlots(current.boxId, values);
  }

  function handleValueConfirm(values: string[]): void {
    const current = picker;
    setPicker(null);
    if (current === null || current.type !== "filter-value") return;
    updateFilterRow(current.rowId, { values });
  }

  const dropRef = useRef<string | null>(null);

  function markDrop(value: string | null): void {
    dropRef.current = value;
    setDropRow(value);
  }

  /**
   * 拖动排序改用指针事件：WebView2 里 HTML5 drag 常被行内按钮/输入框吃掉，
   * 指针方式在桌面壳和浏览器里行为一致（用户反馈第 1 条）。
   */
  function startDrag(
    event: ReactPointerEvent<HTMLElement>,
    kind: "filter" | "metric",
    id: string,
  ): void {
    event.preventDefault();
    setDragRow(id);
    markDrop(null);

    const onMove = (moveEvent: PointerEvent): void => {
      const element = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
      const rowElement = element?.closest("[data-drag-row]") as HTMLElement | null;
      const targetId = rowElement?.dataset.dragRow ?? null;
      markDrop(targetId === null || targetId === id ? null : `${kind}:${targetId}`);
    };
    const onUp = (): void => {
      window.removeEventListener("pointermove", onMove);
      const target = dropRef.current;
      if (target !== null) {
        const targetId = target.slice(target.indexOf(":") + 1);
        if (kind === "filter") moveFilterRowTo(id, targetId);
        else moveMetricBoxTo(id, targetId);
      }
      setDragRow(null);
      markDrop(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }

  type ResultEdit =
    | { kind: "header"; row: number; column: number; value: string }
    | { kind: "cell"; row: number; column: number; value: string };
  const [editingResult, setEditingResult] = useState<ResultEdit | null>(null);

  const VISIBLE_ROWS = 600;

  function beginResultEdit(
    kind: "header" | "cell",
    row: number,
    column: number,
    value: string,
  ): void {
    setEditingResult({ kind, row, column, value });
  }

  function commitResultEdit(): void {
    const editing = editingResult;
    setEditingResult(null);
    if (editing === null) return;
    if (editing.kind === "header") {
      renameResultColumn(editing.column, editing.value.trim());
      return;
    }
    editResultCell(editing.row, editing.column, editing.value);
  }
  function valueCell(row: AnalysisFilterRow) {
    if (row.op === "aboveAvg" || row.op === "belowAvg") {
      return <div className={pageStyles.noValue}>无需填值</div>;
    }
    if (row.op === "between") {
      return (
        <div className={pageStyles.twoInput}>
          <input
            className="input"
            value={row.value}
            placeholder="下限"
            onChange={(event) => updateFilterRow(row.id, { value: event.target.value })}
          />
          <span className="tiny">~</span>
          <input
            className="input"
            value={row.value2}
            placeholder="上限"
            onChange={(event) => updateFilterRow(row.id, { value2: event.target.value })}
          />
        </div>
      );
    }
    if (isTextField(columns, row.field) && (row.op === "eq" || row.op === "ne")) {
      const label =
        row.values.length === 0 ? "全部（按此字段展开）" : `已选 ${row.values.length} 项`;
      return (
        <button
          type="button"
          className={pageStyles.valueButton}
          onClick={(event) =>
            openPicker(
              { type: "filter-value", rowId: row.id, left: 0, top: 0 },
              event.currentTarget,
            )
          }
        >
          {label}
        </button>
      );
    }
    return (
      <input
        className="input"
        value={row.value}
        placeholder={isTextField(columns, row.field) ? "文本" : "数值"}
        onChange={(event) => updateFilterRow(row.id, { value: event.target.value })}
      />
    );
  }

  async function handleExportTable(format: ExportFormat): Promise<void> {
    setExportOpen(false);
    if (result === null) return;
    try {
      setToast(await exportTable(format));
    } catch (err) {
      setToast(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleExportChart(format: "pdf" | "jpeg"): Promise<void> {
    setExportOpen(false);
    if (result === null) return;
    try {
      setToast(await exportChart(format));
    } catch (err) {
      setToast(err instanceof Error ? err.message : String(err));
    }
  }

  const computed = computedBoxes(metricBoxes);

  /** 一个指标框里的记号 → 界面控件（字段槽 / 运算符 / 括号）。 */
  function renderToken(
    box: MetricBox,
    token: MetricToken,
    index: number,
    depths: number[],
    trailing: boolean,
  ) {
    if (token.kind === "slot") {
      const slot = token.slot;
      return (
        <span
          key={slot.id}
          className={pageStyles.fieldSlot}
          data-nested={depths[index] > 0 ? "1" : undefined}
        >
          <button
            type="button"
            className={pageStyles.fieldButton}
            title="换字段"
            onClick={(event) =>
              openPicker(
                {
                  type: "metric-slot",
                  boxId: box.id,
                  slotId: slot.id,
                  left: 0,
                  top: 0,
                },
                event.currentTarget,
              )
            }
          >
            {slot.field === "" ? "选择字段…" : slot.field}
          </button>
          <select
            className={pageStyles.aggSelect}
            value={slot.agg}
            aria-label="计算方式"
            onChange={(event) =>
              updateMetricSlot(box.id, slot.id, { agg: event.target.value as AggFunc })
            }
          >
            {AGGS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={pageStyles.slotRemove}
            title="删除这个字段"
            onClick={() => removeMetricSlot(box.id, slot.id)}
          >
            ✕
          </button>
        </span>
      );
    }
    if (token.kind === "op") {
      return (
        <select
          key={token.id}
          className={`${pageStyles.opSelect} ${trailing ? pageStyles.opSelectNext : ""}`}
          value={token.value}
          aria-label="运算符"
          title={
            trailing
              ? "下一个运算符：选 ＋ － × ÷ 会自动新增一个计算字段；选 ) 会把前面的字段整体括起来"
              : "＋ － × ÷ ( )：括号允许嵌套，选 ) 会把前面的字段整体括起来"
          }
          onChange={(event) => {
            const choice = event.target.value as MetricOpChoice;
            setMetricOp(box.id, token.id, choice);
            // 末尾运算符位选四则运算 = 要接下一个字段，顺手把字段选择器弹出来
            if (trailing && choice !== "(" && choice !== ")") {
              openPicker(
                { type: "metric-slot", boxId: box.id, left: 0, top: 0 },
                event.currentTarget,
              );
            }
          }}
        >
          {METRIC_OPS.map((option: MetricOpChoice) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    }
    return (
      <button
        key={token.id}
        type="button"
        className={pageStyles.parenChip}
        title="点掉这个括号"
        onClick={() => removeMetricParenToken(box.id, token.id)}
      >
        {token.value}
      </button>
    );
  }

  return (
    <section className={pageStyles.page}>
      <header className={pageStyles.head}>
        <div className={pageStyles.headMain}>
          <div className={pageStyles.title}>分析</div>
          <div className={pageStyles.sub}>{subTitle}</div>
        </div>
        <div className={pageStyles.actions}>
          <button type="button" className="btn btn-ghost" onClick={() => setHelpOpen(true)}>
            帮助
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            title="边界盈亏：折扣与承诺货量"
            onClick={() => onOpenRegression?.()}
          >
            盈亏平衡分析
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            返回表格
          </button>
        </div>
      </header>

      <div className={pageStyles.split}>
        <div className={pageStyles.left}>
          <div className={pageStyles.config}>
            <section className={`${pageStyles.section} ${pageStyles.sectionTime}`}>
              <div className={pageStyles.sectionHead}>
                <span className={pageStyles.sectionTitle}>时间范围</span>
                <span className={pageStyles.spacer} />
                <div className="segmented">
                  {(["本月", "上月", "自定义"] as const).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className={timePreset === preset ? "on" : ""}
                      onClick={() => setTimePreset(preset)}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
              <div className={pageStyles.sectionBody}>
                <div className={pageStyles.dateRow}>
                  <input
                    type="date"
                    className={`input ${pageStyles.dateInput}`}
                    value={timeStart}
                    disabled={timePreset !== "自定义"}
                    onChange={(event) => setTimeRange(event.target.value, timeEnd)}
                  />
                  <span className="muted">至</span>
                  <input
                    type="date"
                    className={`input ${pageStyles.dateInput}`}
                    value={timeEnd}
                    disabled={timePreset !== "自定义"}
                    onChange={(event) => setTimeRange(timeStart, event.target.value)}
                  />
                </div>
              </div>
            </section>

            <section className={`${pageStyles.section} ${pageStyles.sectionFilter}`}>
              <div className={pageStyles.sectionHead}>
                <span className={pageStyles.zoneBadge}>分组</span>
                <span className={pageStyles.sectionTitle}>筛选条件</span>
                <span className={pageStyles.sectionHint}>值选「全部」即按该字段展开</span>
                <span className={pageStyles.spacer} />
                <button
                  type="button"
                  className="btn btn-ghost btn-icon"
                  title={`添加条件（最多 ${MAX_FILTER_ROWS} 条）`}
                  onClick={(event) =>
                    openPicker(
                      { type: "filter-field", left: 0, top: 0 },
                      event.currentTarget,
                    )
                  }
                >
                  +
                </button>
              </div>
              <div className={pageStyles.sectionBody}>
                {filterRows.length === 0 && (
                  <div className={pageStyles.emptyHint}>没有条件：结果只有一行全表合计</div>
                )}
                {filterRows.map((row, index) => (
                  <div
                    key={row.id}
                    className={`${pageStyles.filterRow} ${
                      dragRow === row.id ? pageStyles.dragging : ""
                    } ${dropRow === `filter:${row.id}` ? pageStyles.dropTarget : ""}`}
                    data-drag-row={row.id}
                  >
                    <div className={pageStyles.order}>
                      <span
                        className={pageStyles.dragHandle}
                        title="按住拖动排序"
                        onPointerDown={(event) => startDrag(event, "filter", row.id)}
                      >
                        ⋮⋮
                      </span>
                      <button
                        type="button"
                        title="上移"
                        disabled={index === 0}
                        onClick={() => moveFilterRow(row.id, -1)}
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        title="下移"
                        disabled={index === filterRows.length - 1}
                        onClick={() => moveFilterRow(row.id, 1)}
                      >
                        ▼
                      </button>
                    </div>
                    <button
                      type="button"
                      className={pageStyles.fieldButton}
                      onClick={(event) =>
                        openPicker(
                          { type: "filter-field", rowId: row.id, left: 0, top: 0 },
                          event.currentTarget,
                        )
                      }
                    >
                      {row.field}
                    </button>
                    <select
                      className="input"
                      value={row.op}
                      aria-label="筛选运算符"
                      onChange={(event) =>
                        updateFilterRow(row.id, {
                          op: event.target.value as AnalysisFilterRow["op"],
                        })
                      }
                    >
                      {opsFor(columns, row.field).map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {valueCell(row)}
                    <button
                      type="button"
                      className={pageStyles.removeButton}
                      title="删除条件"
                      onClick={() => removeFilterRow(row.id)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className={`${pageStyles.section} ${pageStyles.sectionMetric}`}>
              <div className={pageStyles.sectionHead}>
                <span className={`${pageStyles.zoneBadge} ${pageStyles.zoneBadgeMetric}`}>
                  计算
                </span>
                <span className={pageStyles.sectionTitle}>指标</span>
                <span className={pageStyles.sectionHint}>
                  点击右侧 + 新增指标，点击指标框内 + 新增计算字段
                </span>
                <span className={pageStyles.spacer} />
                <button
                  type="button"
                  className="btn btn-ghost btn-icon"
                  title={`新增指标（最多 ${MAX_METRIC_BOXES} 个）`}
                  onClick={(event) =>
                    openPicker(
                      { type: "metric-box", left: 0, top: 0 },
                      event.currentTarget,
                    )
                  }
                >
                  +
                </button>
              </div>
              <div className={`${pageStyles.sectionBody} ${pageStyles.metricBody}`}>
                {metricBoxes.length === 0 && (
                  <div className={pageStyles.emptyHint}>还没有指标：至少添加一个</div>
                )}
                {metricBoxes.map((box, index) => {
                  const expression = boxExpression(box);
                  const computedIndex = computed.findIndex((item) => item.id === box.id);
                  const resultName =
                    computedIndex < 0
                      ? ""
                      : boxLabel(box, computedIndex + 1, computed.length);
                  const depths = parenDepths(box.tokens);
                  const nested = depths.some((depth) => depth > 0);
                  const boxSlotCount = box.tokens.filter((token) => token.kind === "slot").length;
                  return (
                    <div
                      key={box.id}
                      className={`${pageStyles.metricBox} ${
                        dragRow === box.id ? pageStyles.dragging : ""
                      } ${dropRow === `metric:${box.id}` ? pageStyles.dropTarget : ""}`}
                      data-drag-row={box.id}
                    >
                      <div className={pageStyles.metricBoxHead}>
                        <span
                          className={pageStyles.dragHandle}
                          title="按住拖动排序"
                          onPointerDown={(event) => startDrag(event, "metric", box.id)}
                        >
                          ⋮⋮
                        </span>
                        <span className={pageStyles.metricIndex}>指标{index + 1}</span>
                        {resultName !== "" && (
                          <span className={pageStyles.metricResultName}>
                            ＝ {resultName}
                          </span>
                        )}
                        <span className={pageStyles.spacer} />
                        <button
                          type="button"
                          className={pageStyles.chainAction}
                          title="上移"
                          disabled={index === 0}
                          onClick={() => moveMetricBox(box.id, -1)}
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          className={pageStyles.chainAction}
                          title="下移"
                          disabled={index === metricBoxes.length - 1}
                          onClick={() => moveMetricBox(box.id, 1)}
                        >
                          ▼
                        </button>
                        <button
                          type="button"
                          className={pageStyles.chainAction}
                          title={box.collapsed ? "展开这个指标" : "把这个指标合并成一行"}
                          onClick={() => toggleMetricCollapse(box.id)}
                        >
                          {box.collapsed ? "展开" : "合并"}
                        </button>
                        <button
                          type="button"
                          className={pageStyles.removeButton}
                          title="删除指标"
                          onClick={() => removeMetricBox(box.id)}
                        >
                          ✕
                        </button>
                      </div>

                      {box.collapsed ? (
                        <div className={pageStyles.metricSummary} title={expression}>
                          {expression === "" ? "（空指标）" : expression}
                        </div>
                      ) : (
                        <div
                          className={pageStyles.exprRow}
                          data-nested={nested ? "1" : undefined}
                          data-single={boxSlotCount <= 1 ? "1" : undefined}
                        >
                          {box.tokens.map((token, tokenIndex) =>
                            renderToken(
                              box,
                              token,
                              tokenIndex,
                              depths,
                              tokenIndex === box.tokens.length - 1,
                            ),
                          )}
                          <button
                            type="button"
                            className={pageStyles.addSlot}
                            title={`往这个指标追加计算字段（最多 ${MAX_METRIC_SLOTS} 个）`}
                            onClick={(event) =>
                              openPicker(
                                {
                                  type: "metric-slot",
                                  boxId: box.id,
                                  left: 0,
                                  top: 0,
                                },
                                event.currentTarget,
                              )
                            }
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className={pageStyles.zoneDerived}>
                {metricBoxes.length === 0 ? (
                  "还没有指标：至少添加一个"
                ) : (
                  <>
                    结果表列：<b>{previewColumns.join(" | ")}</b>
                  </>
                )}
              </div>
            </section>
          </div>

          <div className={pageStyles.configFoot}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                if (tab === "chart") setTab("table");
                void compute();
              }}
              disabled={loading}
            >
              {loading ? "计算中…" : "开始计算"}
            </button>
            <span className="tiny">
              {loading
                ? "正在按当前条件汇总…"
                : `条件 ${filterRows.length} 条 · 指标 ${metricBoxes.length} 个（${slotCount} 个字段） · 时间范围 ${timeStart} ~ ${timeEnd}`}
            </span>
          </div>
        </div>

        <div className={pageStyles.right}>
          <div className={pageStyles.resultHead}>
            <div className={pageStyles.tabs}>
              <button
                type="button"
                className={tab === "table" ? "on" : ""}
                onClick={() => setTab("table")}
              >
                表格
              </button>
              <button
                type="button"
                className={tab === "chart" ? "on" : ""}
                onClick={() => setTab("chart")}
              >
                图表
              </button>
            </div>
            <span className={pageStyles.spacer} />
            <div className={pageStyles.exportWrap} ref={exportRef}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={result === null}
                onClick={() => setExportOpen((prev) => !prev)}
              >
                导出
              </button>
              {exportOpen && (
                <div className={`flyout ${pageStyles.exportMenu}`}>
                  <button type="button" onClick={() => void handleExportTable("xlsx")}>
                    导出为 xlsx
                  </button>
                  <button
                    type="button"
                    disabled={
                      result !== null &&
                      (result.row_count > 65536 || result.columns.length > 256)
                    }
                    title={
                      result !== null &&
                      (result.row_count > 65536 || result.columns.length > 256)
                        ? "xls 最多 65536 行 / 256 列，请改用 xlsx"
                        : undefined
                    }
                    onClick={() => void handleExportTable("xls")}
                  >
                    导出为 xls
                  </button>
                  <button type="button" onClick={() => void handleExportTable("csv")}>
                    导出为 CSV
                  </button>
                  <div className="sep" />
                  <button type="button" onClick={() => void handleExportChart("pdf")}>
                    图表导出 PDF
                  </button>
                  <button type="button" onClick={() => void handleExportChart("jpeg")}>
                    图表导出 JPEG
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className={pageStyles.resultBody}>
            {result === null ? (
              <div className={pageStyles.resultEmpty}>
                <div>
                  <div className={pageStyles.resultEmptyTitle}>尚未计算</div>
                  <div className="tiny" style={{ marginTop: 4 }}>
                    左侧配置条件与指标后点击「开始计算」
                  </div>
                </div>
              </div>
            ) : tab === "table" ? (
              <>
                <div className={pageStyles.tableWrap}>
                  <table className={`table ${pageStyles.resultTable}`}>
                    <thead>
                      <tr>
                        {resultColumns.map((column, columnIndex) => (
                          <th
                            key={column}
                            onDoubleClick={() => beginResultEdit("header", 0, columnIndex, column)}
                            title="双击改字段名（导出用改后的名字）"
                          >
                            {editingResult !== null &&
                            editingResult.kind === "header" &&
                            editingResult.column === columnIndex ? (
                              <input
                                autoFocus
                                className={pageStyles.cellInput}
                                value={editingResult.value}
                                onChange={(event) =>
                                  setEditingResult({ ...editingResult, value: event.target.value })
                                }
                                onBlur={() => commitResultEdit()}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") commitResultEdit();
                                  if (event.key === "Escape") setEditingResult(null);
                                }}
                              />
                            ) : (
                              column
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.slice(0, VISIBLE_ROWS).map((row, rowIndex) => (
                        <tr key={rowIndex}>
                          {row.map((cell, cellIndex) => (
                            <td
                              key={cellIndex}
                              className={numericColumns[cellIndex] ? "num" : undefined}
                              onDoubleClick={() => beginResultEdit("cell", rowIndex, cellIndex, String(cell ?? ""))}
                              title="双击改单元格（导出用改后的值）"
                            >
                              {editingResult !== null &&
                              editingResult.kind === "cell" &&
                              editingResult.row === rowIndex &&
                              editingResult.column === cellIndex ? (
                                <input
                                  autoFocus
                                  className={pageStyles.cellInput}
                                  value={editingResult.value}
                                  onChange={(event) =>
                                    setEditingResult({ ...editingResult, value: event.target.value })
                                  }
                                  onBlur={() => commitResultEdit()}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") commitResultEdit();
                                    if (event.key === "Escape") setEditingResult(null);
                                  }}
                                />
                              ) : numericColumns[cellIndex] ? (
                                fmtNum(cell)
                              ) : (
                                cellText(cell)
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                      {result.row_count > VISIBLE_ROWS && (
                        <tr>
                          <td colSpan={resultColumns.length} className={pageStyles.rowCapHint}>
                            仅显示前 {VISIBLE_ROWS} 行（共 {result.row_count.toLocaleString("zh-CN")} 行）·
                            导出包含全部行
                          </td>
                        </tr>
                      )}
                      {/* 没有分组维度时结果表只有一行，这一行本身就是合计，不再重复合计行 */}
                      {dimFields.length > 0 && (
                        <tr className={pageStyles.totalRow}>
                          <td colSpan={dimFields.length}>合计</td>
                          {resultColumns.slice(dimFields.length).map((column) => (
                            <td key={column} className="num">
                              {fmtNum(totals[column])}
                            </td>
                          ))}
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className={pageStyles.caption}>
                  {result.row_count} 行 · 扫描 {scanned} 行 → 时间范围内 {ranged} 行 →
                  筛选后 {filtered} 行
                  {dimFields.length > 0 ? ` · 分组：${dimFields.join(" × ")}` : " · 未分组"}
                  <br />
                  各行命中行数：
                  {groupCounts.length > 12
                    ? `${groupCounts.slice(0, 12).join(" / ")} …（共 ${groupCounts.length} 组）`
                    : groupCounts.join(" / ")}
                  （提示用，不进入导出表格）
                  {unknownCount > 0 && (
                    <>
                      <br />
                      有 {unknownCount} 行日期无法解析，已归入「未知日期」组
                    </>
                  )}
                </div>
              </>
            ) : (
              <div className={pageStyles.chartPanel}>
                <ChartConfigPanel />
                <div className={pageStyles.chartBox}>
                  <ChartPreview />
                </div>
              </div>
            )}
          </div>

          {error !== null && <p className={pageStyles.error}>{error}</p>}
        </div>
      </div>

      {picker !== null && (picker.type === "metric-box" || picker.type === "metric-slot") && (
        <Picker
          left={picker.left}
          top={picker.top}
          title={
            picker.type === "metric-box"
              ? "选择字段（每个字段 = 一个指标框）"
              : "选择计算字段（可多选，追加到当前指标）"
          }
          items={fieldItems()}
          confirmLabel={
            picker.type === "metric-box" ||
            (picker.type === "metric-slot" && picker.slotId === undefined)
              ? "添加"
              : "替换"
          }
          onConfirm={handleFieldConfirm}
          onCancel={closePicker}
          onDisabledPick={(item) =>
            setToast(
              `「${item.value}」在 ${timeStart} ~ ${timeEnd} 内没有数据，请调整时间范围`,
            )
          }
        />
      )}

      {picker !== null && picker.type === "filter-field" && (
        <Picker
          left={picker.left}
          top={picker.top}
          title="选择字段（条件即可作为分组维度）"
          items={fieldItems()}
          confirmLabel={picker.rowId === undefined ? "添加" : "替换"}
          onConfirm={handleFieldConfirm}
          onCancel={closePicker}
          onDisabledPick={(item) =>
            setToast(
              `「${item.value}」在 ${timeStart} ~ ${timeEnd} 内没有数据，请调整时间范围`,
            )
          }
        />
      )}

      {picker !== null && picker.type === "filter-value" && (
        <Picker
          left={picker.left}
          top={picker.top}
          title={`${filterRows.find((row) => row.id === picker.rowId)?.field ?? ""} · 可多选`}
          items={(valueOptions[
            filterRows.find((row) => row.id === picker.rowId)?.field ?? ""
          ] ?? []).map((value) => ({ value, label: value }))}
          initialSelected={
            filterRows.find((row) => row.id === picker.rowId)?.values ?? []
          }
          confirmLabel="确定"
          showClear
          onConfirm={handleValueConfirm}
          onCancel={closePicker}
        />
      )}

      {helpOpen && (
        <Modal title="分析帮助" onClose={() => setHelpOpen(false)}>
          <div className={pageStyles.help}>
            <h3>快速上手</h3>
            <ol>
              <li>
                选择时间范围：默认「自定义」并已按数据里识别出的时间字段预填（进页面时自动取一次）；
                「本月 / 上月」为快捷方式，识别不出时间字段时不预填（保持全量范围）。
              </li>
              <li>在「筛选条件」里加字段：文本字段选等于/不等于即成为分组维度，取值为「全部」时按该字段展开。</li>
              <li>
                点指标区右上角 <b>+</b> 新增一个指标（指标1…N，各自独立成框）；点指标框内右侧 <b>+</b>
                往这个指标追加计算字段。
              </li>
              <li>
                指标框里是一行表达式：字段(计算方式) 运算符 字段(计算方式) …，运算符只有 ＋ － × ÷ 与括号，
                括号可嵌套；选 <b>(</b> 会自动补一个 <b>)</b>，选 <b>)</b> 会把前面的字段整体括起来。
              </li>
              <li>点「开始计算」，右侧查看表格或图表，确认后导出。</li>
            </ol>
            <h3>固定规则口径</h3>
            <p>网点货量分析：货量 = sum(结算重量)；网点单公斤价格分析：sum(现价) ÷ sum(结算重量)；网点折扣分析：sum(现价) ÷ sum(原价)。分母为 0 时留空，不输出 inf / NaN。</p>
            <p className="tiny">
              各行命中行数只是提示文字，不进入导出表格；指标最多 {MAX_METRIC_BOXES} 个、每个指标最多{" "}
              {MAX_METRIC_SLOTS} 个字段、条件最多 {MAX_FILTER_ROWS} 条。
            </p>
          </div>
        </Modal>
      )}
    </section>
  );
}

/** 指标框里的字段槽列表（局部工具，避免再引一层 import）。 */
function tokenSlots(box: MetricBox) {
  return box.tokens.flatMap((token) => (token.kind === "slot" ? [token.slot] : []));
}

export default AnalysisWindow;
