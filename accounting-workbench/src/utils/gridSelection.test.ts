import { describe, expect, it } from "vitest";

import {
  EMPTY_SELECTION,
  columnLetter,
  highlightCols,
  highlightRows,
  isAdditive,
  selectCell,
  selectColumn,
  selectRow,
  selectionNumericFields,
  selectionPrimary,
  selectedColumnIndices,
  type ColumnRef,
} from "./gridSelection";

const COLUMNS: ColumnRef[] = [
  { name: "账单时间", numeric: false },
  { name: "寄件所属一级网点", numeric: false },
  { name: "现价", numeric: true },
  { name: "结算重量", numeric: true },
];

describe("columnLetter", () => {
  it("A / Z / AA / AB", () => {
    expect(columnLetter(0)).toBe("A");
    expect(columnLetter(25)).toBe("Z");
    expect(columnLetter(26)).toBe("AA");
    expect(columnLetter(27)).toBe("AB");
    expect(columnLetter(701)).toBe("ZZ");
    expect(columnLetter(-1)).toBe("");
  });
});

describe("选中模式切换", () => {
  it("点单元格：只高亮那个单元格，行列都清空", () => {
    const selection = selectCell(4, 2);
    expect(selection).toEqual({ mode: "cell", cell: { row: 4, col: 2 }, rows: [], cols: [] });
    expect(highlightRows(selection).size).toBe(0);
    expect(highlightCols(selection).size).toBe(0);
  });

  it("点行号：整行高亮；Ctrl 累加 / 再点取消", () => {
    let selection = selectRow(EMPTY_SELECTION, 3, false);
    expect(selection.mode).toBe("row");
    expect([...highlightRows(selection)]).toEqual([3]);

    selection = selectRow(selection, 7, true);
    expect(selection.rows).toEqual([3, 7]);

    selection = selectRow(selection, 3, true);
    expect(selection.rows).toEqual([7]);

    selection = selectRow(selection, 9, false);
    expect(selection.rows).toEqual([9]);
  });

  it("点列头：整列高亮；Ctrl 累加；取消到空回到未选择", () => {
    let selection = selectColumn(EMPTY_SELECTION, 2, false);
    expect(selection.mode).toBe("col");
    expect([...highlightCols(selection)]).toEqual([2]);

    selection = selectColumn(selection, 3, true);
    expect(selection.cols).toEqual([2, 3]);

    selection = selectColumn(selection, 2, true);
    selection = selectColumn(selection, 3, true);
    expect(selection.mode).toBe("none");
    expect(selection.cols).toEqual([]);
  });

  it("三种模式互斥：从行切到列会清掉行", () => {
    const rows = selectRow(EMPTY_SELECTION, 1, false);
    const cols = selectColumn(rows, 3, true);
    expect(cols.rows).toEqual([]);
    expect(cols.cols).toEqual([3]);
  });

  it("修饰键判定", () => {
    expect(isAdditive({ ctrlKey: true })).toBe(true);
    expect(isAdditive({ metaKey: true })).toBe(true);
    expect(isAdditive({ shiftKey: true })).toBe(true);
    expect(isAdditive({})).toBe(false);
  });
});

describe("状态条文案", () => {
  it("未选择 / 单元格 / 行 / 列", () => {
    expect(selectionPrimary(EMPTY_SELECTION, COLUMNS)).toBe("未选择");
    expect(selectionPrimary(selectCell(4, 2), COLUMNS)).toBe("C5 · 现价");
    expect(selectionPrimary(selectRow(EMPTY_SELECTION, 0, false), COLUMNS)).toBe("已选 1 行");
    expect(selectionPrimary(selectColumn(EMPTY_SELECTION, 2, false), COLUMNS)).toBe(
      "已选 1 列：现价",
    );
  });

  it("多列：名字用顿号连接（P0 投诉里的那句）", () => {
    let selection = selectColumn(EMPTY_SELECTION, 1, false);
    selection = selectColumn(selection, 2, true);
    selection = selectColumn(selection, 3, true);
    expect(selectionPrimary(selection, COLUMNS)).toBe(
      "已选 3 列：寄件所属一级网点、现价、结算重量",
    );
  });
});

describe("列汇总字段", () => {
  it("全是数值列才汇总", () => {
    expect(
      selectionNumericFields(selectColumn(EMPTY_SELECTION, 2, false), COLUMNS),
    ).toEqual(["现价"]);
  });

  it("含文本列时不做数值汇总", () => {
    let selection = selectColumn(EMPTY_SELECTION, 2, false);
    selection = selectColumn(selection, 0, true);
    expect(selectionNumericFields(selection, COLUMNS)).toEqual([]);
  });

  it("超过 4 列不汇总（避免一次请求太多指标）", () => {
    const wide: ColumnRef[] = Array.from({ length: 6 }, (_, index) => ({
      name: `列${index}`,
      numeric: true,
    }));
    let selection = EMPTY_SELECTION;
    for (let col = 0; col < 5; col += 1) {
      selection = selectColumn(selection, col, true);
    }
    expect(selectionNumericFields(selection, wide)).toEqual([]);
  });

  it("非列模式不汇总", () => {
    expect(selectionNumericFields(selectCell(0, 2), COLUMNS)).toEqual([]);
    expect(selectionNumericFields(selectRow(EMPTY_SELECTION, 0, false), COLUMNS)).toEqual([]);
  });
});

describe("分析按钮带哪些列", () => {
  it("整列选中带全部列，且按列号排序", () => {
    let selection = EMPTY_SELECTION;
    selection = selectColumn(selection, 3, false);
    selection = selectColumn(selection, 1, true);
    expect(selectedColumnIndices(selection)).toEqual([1, 3]);
  });

  it("单元格选中带该列", () => {
    expect(selectedColumnIndices(selectCell(2, 2))).toEqual([2]);
  });

  it("行选中与空选不带列（走自由分析）", () => {
    expect(selectedColumnIndices(selectRow(EMPTY_SELECTION, 0, false))).toEqual([]);
    expect(selectedColumnIndices(EMPTY_SELECTION)).toEqual([]);
  });
});
