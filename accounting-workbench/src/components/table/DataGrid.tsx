import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import type {
  CellClickedEvent,
  CellContextMenuEvent,
  CellEditingStoppedEvent,
  ColDef,
  ColumnHeaderClickedEvent,
  ColumnHeaderContextMenuEvent,
  IDatasource,
  IGetRowsParams,
} from "ag-grid-community";
import type { DatasetMeta, PreviewPage } from "../../types/api";
import { useTableStore } from "../../stores/tableStore";
import { buildSetCellsPayload, cellKey } from "../../utils/clipboard";
import { fromTsv } from "../../utils/gridClipboard";
import {
  highlightCols,
  highlightRows,
  isAdditive,
  selectCell,
  selectColumn,
  selectRow,
  selectionNumericFields,
  selectionPrimary,
  type ColumnRef,
} from "../../utils/gridSelection";
import ContextMenu, { type ContextMenuItem } from "./ContextMenu";
import styles from "./DataGrid.module.css";

interface DataGridProps {
  dataset: DatasetMeta;
  fetchRows: (offset: number, limit: number) => Promise<PreviewPage>;
  /** 右键「以此列分析」：把该列带进分析页。 */
  onAnalyzeColumn: (field: string) => void;
}

const CELL_CLASS_SELECTED = "aw-sel-cell";
const CELL_CLASS_COL = "aw-sel-col";
const CELL_CLASS_ROW = "aw-sel-row";
const CELL_CLASS_HIT = "aw-hit";
const HEADER_CLASS_SELECTED = "aw-sel-header";

function formatNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return formatNumber(value);
  return String(value);
}

function isEditTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}

type CtxMode = "cell" | "row" | "col";

function DataGrid({ dataset, fetchRows, onAnalyzeColumn }: DataGridProps) {
  const gridRef = useRef<AgGridReact>(null);
  const editVersion = useTableStore((state) => state.editVersion);
  const applyEdit = useTableStore((state) => state.applyEdit);
  const undo = useTableStore((state) => state.undo);
  const redo = useTableStore((state) => state.redo);
  const summarizeColumns = useTableStore((state) => state.summarizeColumns);
  const columnStats = useTableStore((state) => state.columnStats);
  const selection = useTableStore((state) => state.selection);
  const setSelection = useTableStore((state) => state.setSelection);
  const selectAllCells = useTableStore((state) => state.selectAllCells);
  const find = useTableStore((state) => state.find);
  const clipboard = useTableStore((state) => state.clipboard);
  const cutSource = useTableStore((state) => state.cutSource);
  const copySelection = useTableStore((state) => state.copySelection);
  const cutSelection = useTableStore((state) => state.cutSelection);
  const pasteCells = useTableStore((state) => state.pasteCells);
  const insertRows = useTableStore((state) => state.insertRows);
  const insertCols = useTableStore((state) => state.insertCols);
  const deleteRows = useTableStore((state) => state.deleteRows);
  const deleteCols = useTableStore((state) => state.deleteCols);
  const setError = useTableStore((state) => state.setError);

  const pendingEdits = useRef<Map<string, unknown>>(new Map());
  const [cellValue, setCellValue] = useState<unknown>(null);
  const [rowValues, setRowValues] = useState<Record<string, unknown> | null>(null);
  const [ctx, setCtx] = useState<{ x: number; y: number; mode: CtxMode } | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modifiers = useRef({ ctrlKey: false, metaKey: false, shiftKey: false });
  /* 列头事件不带原生 MouseEvent：右键坐标在 mousedown/contextmenu 时先记下来 */
  const pointer = useRef({ x: 0, y: 0 });

  const columnRefs = useMemo<ColumnRef[]>(
    () =>
      dataset.columns.map((column) => ({
        name: column.name,
        numeric: column.dtype === "number",
      })),
    [dataset.columns],
  );

  const numericFields = useMemo(
    () => selectionNumericFields(selection, columnRefs),
    [selection, columnRefs],
  );

  /* 列选择且全是数值列时，向后端要整表口径的求和/计数 */
  useEffect(() => {
    if (numericFields.length === 0) return;
    void summarizeColumns(numericFields);
  }, [numericFields, summarizeColumns]);

  const columnDefs = useMemo<ColDef[]>(() => {
    const rows = highlightRows(selection);
    const cols = highlightCols(selection);
    const keyword = find.trim();
    const rowNumber: ColDef = {
      colId: "rownum",
      headerName: "",
      width: 40,
      minWidth: 40,
      maxWidth: 40,
      pinned: "left",
      editable: false,
      sortable: false,
      resizable: false,
      headerClass: "aw-rownum-header",
      cellClass: "aw-rownum",
      valueGetter: (params) => (params.node?.rowIndex ?? 0) + 1,
      // 行号 1000 以上也用千分位（用户 2026-10-29：千以上一律 1,000 形式）
      valueFormatter: (params) => cellText(params.value),
    };

    const dataColumns: ColDef[] = dataset.columns.map((column, index) => ({
      colId: `c${index}`,
      headerName: column.name,
      field: `c${index}`,
      sortable: false,
      // 显示层加千分位（1,000 / 10,000）；编辑时拿到的仍是原始数值，输入不受影响
      valueFormatter: (params) => cellText(params.value),
      headerClass: cols.has(index) ? HEADER_CLASS_SELECTED : undefined,
      cellClassRules: {
        [CELL_CLASS_SELECTED]: (params) =>
          selection.mode === "cell" &&
          selection.cell !== null &&
          selection.cell.row === (params.rowIndex ?? -1) &&
          selection.cell.col === index,
        [CELL_CLASS_COL]: () => cols.has(index),
        [CELL_CLASS_ROW]: (params) =>
          selection.mode === "all" || rows.has(params.rowIndex ?? -1),
        [CELL_CLASS_HIT]: (params) =>
          keyword !== "" && String(params.value ?? "").includes(keyword),
      },
    }));

    return [rowNumber, ...dataColumns];
  }, [dataset.columns, selection, find]);

  const datasource = useMemo<IDatasource>(
    () => ({
      getRows: (params: IGetRowsParams) => {
        const { startRow, endRow, successCallback, failCallback } = params;
        fetchRows(startRow, endRow - startRow)
          .then((page) => {
            const rows = page.rows.map((row) => {
              const record: Record<string, unknown> = {};
              dataset.columns.forEach((_, index) => {
                record[`c${index}`] = row[index];
              });
              return record;
            });
            const lastRow = page.total_rows > 0 ? page.total_rows - 1 : 0;
            successCallback(rows, lastRow);
          })
          .catch(() => {
            failCallback();
          });
      },
    }),
    [dataset.columns, fetchRows],
  );

  function flushEdits(): void {
    const edits = pendingEdits.current;
    if (edits.size === 0) return;
    pendingEdits.current = new Map();
    void applyEdit("set_cells", buildSetCellsPayload(edits));
  }

  const refreshHighlights = useCallback(() => {
    gridRef.current?.api?.refreshCells({ force: true });
    gridRef.current?.api?.refreshHeader();
  }, []);

  useEffect(() => {
    refreshHighlights();
  }, [selection, find, refreshHighlights]);

  useEffect(() => {
    function onDown(event: MouseEvent): void {
      modifiers.current = {
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
      };
      pointer.current = { x: event.clientX, y: event.clientY };
    }
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("click", onDown, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("click", onDown, true);
    };
  }, []);

  /* ── 剪贴板：只处理 AG Grid 里已加载的行 ── */
  const collectMatrix = useCallback((): { matrix: string[][]; note: string } | null => {
    const api = gridRef.current?.api;
    if (!api) return null;
    if (selection.mode === "cell" && selection.cell !== null) {
      const node = api.getDisplayedRowAtIndex(selection.cell.row);
      const data = node?.data as Record<string, unknown> | undefined;
      return {
        matrix: [[cellText(data?.[`c${selection.cell.col}`])]],
        note: "已复制 1 个单元格",
      };
    }

    const byIndex = new Map<number, Record<string, unknown>>();
    api.forEachNode((node) => {
      if (node.data && node.rowIndex !== undefined && node.rowIndex !== null) {
        byIndex.set(node.rowIndex, node.data as Record<string, unknown>);
      }
    });
    if (byIndex.size === 0) return null;

    const allCols = dataset.columns.map((_, index) => index);
    const sortedLoaded = [...byIndex.keys()].sort((left, right) => left - right);
    let rowList: number[];
    let colList: number[];
    if (selection.mode === "row" && selection.rows.length > 0) {
      rowList = [...selection.rows].sort((left, right) => left - right);
      colList = allCols;
    } else if (selection.mode === "col" && selection.cols.length > 0) {
      rowList = sortedLoaded;
      colList = [...selection.cols].sort((left, right) => left - right);
    } else if (selection.mode === "all") {
      rowList = sortedLoaded;
      colList = allCols;
    } else {
      return null;
    }

    const present = rowList.filter((index) => byIndex.has(index));
    if (present.length === 0) return null;
    return {
      matrix: present.map((rowIndex) => {
        const data = byIndex.get(rowIndex) ?? {};
        return colList.map((colIndex) => cellText(data[`c${colIndex}`]));
      }),
      note: `已复制 ${present.length} 行 × ${colList.length} 列（只含已加载行）`,
    };
  }, [dataset.columns, selection]);

  const runCopy = useCallback(
    (cut: boolean) => {
      const result = collectMatrix();
      if (result === null) {
        setError("先选中要复制的单元格、行或列");
        return;
      }
      if (cut) cutSelection(result.matrix);
      else copySelection(result.matrix);
    },
    [collectMatrix, copySelection, cutSelection, setError],
  );

  const runPaste = useCallback(async () => {
    let external: string[][] | null = null;
    try {
      const text = await navigator.clipboard?.readText();
      external = text === undefined ? null : fromTsv(text);
    } catch {
      external = null;
    }
    await pasteCells(external);
  }, [pasteCells]);

  function handleCellClicked(event: CellClickedEvent): void {
    if (event.column.getColId() === "rownum") {
      const rowIndex = event.rowIndex ?? 0;
      setSelection(selectRow(selection, rowIndex, isAdditive((event.event as MouseEvent) ?? {})));
      setRowValues((event.data as Record<string, unknown> | undefined) ?? null);
      return;
    }
    if (!event.column.getColId().startsWith("c")) return;
    const col = Number(event.column.getColId().slice(1));
    setSelection(selectCell(event.rowIndex ?? 0, col));
    setCellValue(event.value);
  }

  function handleColumnHeaderClicked(event: ColumnHeaderClickedEvent): void {
    const column = event.column;
    if (!("getColId" in column)) return;
    const colId = column.getColId();
    if (colId === "rownum") return;
    const col = Number(colId.slice(1));
    setSelection(selectColumn(selection, col, isAdditive(modifiers.current)));
  }

  function handleCellContextMenu(event: CellContextMenuEvent): void {
    const source = event.event as MouseEvent | undefined;
    source?.preventDefault();
    const colId = event.column.getColId();
    if (colId === "rownum") {
      setSelection(selectRow(selection, event.rowIndex ?? 0, false));
      setCtx({ x: source?.clientX ?? 0, y: source?.clientY ?? 0, mode: "row" });
      return;
    }
    const col = Number(colId.slice(1));
    setSelection(selectCell(event.rowIndex ?? 0, col));
    setCellValue(event.value);
    setCtx({ x: source?.clientX ?? 0, y: source?.clientY ?? 0, mode: "cell" });
  }

  function handleColumnHeaderContextMenu(event: ColumnHeaderContextMenuEvent): void {
    const column = event.column;
    if (!("getColId" in column)) return;
    const colId = column.getColId();
    if (colId === "rownum") return;
    const col = Number(colId.slice(1));
    setSelection(selectColumn(selection, col, false));
    setCtx({ x: pointer.current.x, y: pointer.current.y, mode: "col" });
  }

  function handleCellEditingStopped(event: CellEditingStoppedEvent): void {
    const row = event.rowIndex ?? 0;
    const col = Number(event.column.getColId().slice(1));
    pendingEdits.current.set(cellKey(row, col), event.value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(flushEdits, 300);
  }

  useEffect(() => {
    if (editVersion > 0) {
      gridRef.current?.api.refreshInfiniteCache();
    }
  }, [editVersion]);

  /* ── 键盘：撤销/重做、全选、剪切/复制/粘贴 ── */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (isEditTarget(event.target)) return;
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      const editing = (gridRef.current?.api?.getEditingCells()?.length ?? 0) > 0;
      if (mod && key === "z") {
        event.preventDefault();
        void (event.shiftKey ? redo() : undo());
      } else if (mod && key === "y") {
        event.preventDefault();
        void redo();
      } else if (mod && key === "a" && !editing) {
        event.preventDefault();
        selectAllCells();
      } else if (mod && key === "c" && !editing) {
        event.preventDefault();
        runCopy(false);
      } else if (mod && key === "x" && !editing) {
        event.preventDefault();
        runCopy(true);
      } else if (mod && key === "v" && !editing) {
        event.preventDefault();
        void runPaste();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo, selectAllCells, runCopy, runPaste]);

  /* ── 状态条 ── */
  const primary = selectionPrimary(selection, columnRefs);
  let detail =
    find.trim() !== ""
      ? `查找「${find.trim()}」：只高亮已加载行`
      : "点单元格 / 行号 / 列头均可选中，右键更多操作";
  if (selection.mode === "cell" && selection.cell !== null) {
    const numeric = columnRefs[selection.cell.col]?.numeric === true;
    detail = `值 ${cellText(cellValue) === "" ? "—" : cellText(cellValue)} · ${numeric ? "数值列" : "文本列"}`;
  } else if (selection.mode === "col" && selection.cols.length > 0) {
    const stats = numericFields.map((field) => columnStats[field]);
    if (numericFields.length === 0) {
      const allNumeric = selection.cols.every((col) => columnRefs[col]?.numeric === true);
      detail = allNumeric ? "列数超过 4 列，不做数值汇总" : "文本列不做数值汇总";
    } else if (stats.every((item) => item !== undefined)) {
      const sum = stats.reduce((acc, item) => acc + (item?.sum ?? 0), 0);
      const count = stats.reduce((acc, item) => acc + (item?.count ?? 0), 0);
      detail = `求和 ${formatNumber(sum)}${count > 0 ? ` · 平均 ${formatNumber(sum / count)}` : ""} · 整表口径`;
    } else {
      detail = "正在汇总…";
    }
  } else if (selection.mode === "row" && selection.rows.length > 0) {
    if (selection.rows.length === 1 && rowValues !== null) {
      const numbers = dataset.columns
        .map((column, index) => (column.dtype === "number" ? rowValues[`c${index}`] : null))
        .filter((value): value is number => typeof value === "number");
      if (numbers.length > 0) {
        const sum = numbers.reduce((acc, value) => acc + value, 0);
        detail = `数值求和 ${formatNumber(sum)} · 平均 ${formatNumber(sum / numbers.length)}`;
      } else {
        detail = "这一行没有数值列";
      }
    } else {
      detail = "整行已高亮（多行不做数值汇总）";
    }
  } else if (selection.mode === "all") {
    detail = `共 ${dataset.row_count.toLocaleString()} 行 × ${dataset.col_count} 列 · 复制只含已加载行`;
  }
  if (cutSource !== null) {
    detail = `已剪切 R${cutSource.rowStart + 1}:C${cutSource.colStart + 1}，粘贴后清空 · ${detail}`;
  }

  function contextItems(): ContextMenuItem[] {
    const items: ContextMenuItem[] = [
      { label: "剪切", hint: "Ctrl+X", onClick: () => runCopy(true) },
      { label: "复制", hint: "Ctrl+C", onClick: () => runCopy(false) },
      {
        label: "粘贴",
        hint: "Ctrl+V",
        disabled: clipboard === null,
        onClick: () => void runPaste(),
      },
      { label: "", separator: true },
    ];
    if (ctx?.mode === "col") {
      const col = selection.cols[0] ?? 0;
      items.push(
        { label: "在左侧插入列", onClick: () => void insertCols(1, col) },
        { label: "在右侧插入列", onClick: () => void insertCols(1, col + 1) },
        { label: "删除选中列", danger: true, onClick: () => void deleteCols() },
        { label: "", separator: true },
        {
          label: `以此列分析「${columnRefs[col]?.name ?? ""}」`,
          onClick: () => onAnalyzeColumn(columnRefs[col]?.name ?? ""),
        },
      );
      return items;
    }
    if (ctx?.mode === "row") {
      const row = selection.rows[0] ?? 0;
      items.push(
        { label: "在上方插入行", onClick: () => void insertRows(1, row) },
        { label: "在下方插入行", onClick: () => void insertRows(1, row + 1) },
        { label: "删除选中行", danger: true, onClick: () => void deleteRows() },
        { label: "", separator: true },
        {
          label: "分析所选数据",
          onClick: () => onAnalyzeColumn(columnRefs[0]?.name ?? ""),
        },
      );
      return items;
    }
    const row = selection.cell?.row ?? 0;
    const col = selection.cell?.col ?? 0;
    items.push(
      { label: "在上方插入行", onClick: () => void insertRows(1, row) },
      { label: "在左侧插入列", onClick: () => void insertCols(1, col) },
      { label: "删除此行", danger: true, onClick: () => void deleteRows() },
      { label: "", separator: true },
      {
        label: `以此列分析「${columnRefs[col]?.name ?? ""}」`,
        onClick: () => onAnalyzeColumn(columnRefs[col]?.name ?? ""),
      },
    );
    return items;
  }

  return (
    <div className={styles.wrap}>
      <div className={`ag-theme-quartz ${styles.grid}`}>
        <AgGridReact
          ref={gridRef}
          columnDefs={columnDefs}
          rowModelType="infinite"
          datasource={datasource}
          cacheBlockSize={100}
          blockLoadDebounceMillis={500}
          maxConcurrentDatasourceRequests={1}
          maxBlocksInCache={5}
          suppressCopyRowsToClipboard={true}
          stopEditingWhenCellsLoseFocus={true}
          onCellClicked={handleCellClicked}
          onColumnHeaderClicked={handleColumnHeaderClicked}
          onCellContextMenu={handleCellContextMenu}
          onColumnHeaderContextMenu={handleColumnHeaderContextMenu}
          onCellEditingStopped={handleCellEditingStopped}
          defaultColDef={{ resizable: true, minWidth: 80, editable: true }}
        />
      </div>
      <footer className={styles.statusbar}>
        <span className={styles.selected}>{primary}</span>
        <span className={styles.detail}>{detail}</span>
        <span className={styles.right}>
          <span>
            共 {dataset.row_count.toLocaleString()} 行 × {dataset.col_count} 列
          </span>
          <span>双击编辑 · Ctrl+Z 撤销 · Ctrl+Shift+Z 重做</span>
        </span>
      </footer>
      {ctx !== null && (
        <ContextMenu x={ctx.x} y={ctx.y} items={contextItems()} onClose={() => setCtx(null)} />
      )}
    </div>
  );
}

export default DataGrid;
