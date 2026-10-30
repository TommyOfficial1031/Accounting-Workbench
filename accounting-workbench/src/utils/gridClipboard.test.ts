import { describe, expect, it } from "vitest";

import {
  MAX_PASTE_CELLS,
  copyRangeOf,
  fromTsv,
  pasteAnchor,
  planPaste,
  toTsv,
} from "./gridClipboard";
import { EMPTY_SELECTION, selectAll, selectCell, selectColumn, selectRow } from "./gridSelection";

describe("TSV 往返", () => {
  it("序列化用制表符、换行", () => {
    expect(toTsv([["a", "b"], ["c", "d"]])).toBe("a\tb\nc\td");
  });

  it("解析：去掉末尾空行，补齐短行", () => {
    expect(fromTsv("a\tb\nc\n\n")).toEqual([
      ["a", "b"],
      ["c", ""],
    ]);
  });

  it("兼容 CRLF 与纯文本（无制表符时按单列）", () => {
    expect(fromTsv("1\r\n2\r\n")).toEqual([["1"], ["2"]]);
  });

  it("空内容返回 null", () => {
    expect(fromTsv("   \n\n ")).toBeNull();
  });
});

describe("复制范围", () => {
  it("单元格 = 1×1", () => {
    expect(copyRangeOf(selectCell(2, 3), 100, 10)).toEqual({ rows: [2], cols: [3] });
  });

  it("行模式 = 选中行 × 全部列", () => {
    let selection = selectRow(EMPTY_SELECTION, 4, false);
    selection = selectRow(selection, 1, true);
    expect(copyRangeOf(selection, 100, 3)).toEqual({ rows: [1, 4], cols: [0, 1, 2] });
  });

  it("列模式 = 全部行 × 选中列", () => {
    let selection = selectColumn(EMPTY_SELECTION, 2, false);
    selection = selectColumn(selection, 0, true);
    expect(copyRangeOf(selection, 3, 5)).toEqual({
      rows: [0, 1, 2],
      cols: [0, 2],
    });
  });

  it("全选 / 未选择", () => {
    expect(copyRangeOf(selectAll(), 4, 2)).toEqual({ rows: [0, 1, 2, 3], cols: [0, 1] });
    expect(copyRangeOf(EMPTY_SELECTION, 4, 2)).toBeNull();
  });
});

describe("粘贴落点", () => {
  it("锚点：单元格 / 行 / 列 / 未选择", () => {
    expect(pasteAnchor(selectCell(7, 2))).toEqual({ row: 7, col: 2 });
    expect(pasteAnchor(selectRow(EMPTY_SELECTION, 5, false))).toEqual({ row: 5, col: 0 });
    expect(pasteAnchor(selectColumn(EMPTY_SELECTION, 3, false))).toEqual({ row: 0, col: 3 });
    expect(pasteAnchor(EMPTY_SELECTION)).toEqual({ row: 0, col: 0 });
  });

  it("按锚点平移写入，返回 set_cells 三方组", () => {
    const plan = planPaste(
      [
        ["x", "y"],
        ["z", "w"],
      ],
      { row: 2, col: 1 },
      100,
      10,
    );
    expect(plan).toMatchObject({ row: 2, col: 1, rows: 2, cols: 2, droppedRows: 0 });
    expect(plan.cells).toEqual([
      { row: 2, col: 1, value: "x" },
      { row: 2, col: 2, value: "y" },
      { row: 3, col: 1, value: "z" },
      { row: 3, col: 2, value: "w" },
    ]);
  });

  it("贴到边界时裁掉越界部分", () => {
    const plan = planPaste([["a", "b"], ["c", "d"]], { row: 9, col: 1 }, 10, 2);
    expect(plan.rows).toBe(1);
    expect(plan.cols).toBe(1);
    expect(plan.cells).toEqual([{ row: 9, col: 1, value: "a" }]);
  });

  it("超量粘贴只保留前若干行并报告丢弃行数", () => {
    const big = Array.from({ length: 9000 }, (_, index) => [`v${index}`]);
    const plan = planPaste(big, { row: 0, col: 0 }, 100000, 10);
    expect(plan.rows).toBe(MAX_PASTE_CELLS);
    expect(plan.droppedRows).toBe(9000 - MAX_PASTE_CELLS);
  });
});
