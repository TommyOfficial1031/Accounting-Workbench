import { describe, expect, it } from "vitest";
import { buildSetCellsPayload, parseTsv, serializeTsv } from "./clipboard";

describe("clipboard TSV", () => {
  it("serializes and parses plain cells round-trip", () => {
    const rows = [
      ["账单时间", "货量"],
      ["2026-10-01", 10],
    ];
    expect(parseTsv(serializeTsv(rows))).toEqual([
      ["账单时间", "货量"],
      ["2026-10-01", "10"],
    ]);
  });

  it("escapes quotes and tabs inside cells", () => {
    const rows = [['a"b', "c\td", "e\nf"]];
    expect(parseTsv(serializeTsv(rows))).toEqual([["a\"b", "c\td", "e\nf"]]);
  });
});

describe("buildSetCellsPayload", () => {
  it("merges edits into one payload", () => {
    const edits = new Map<string, unknown>([
      ["0:1", 99],
      ["2:3", "x"],
    ]);
    const payload = buildSetCellsPayload(edits);
    expect(payload.cells).toHaveLength(2);
    expect(payload.cells).toContainEqual({ row: 0, col: 1, value: 99 });
    expect(payload.cells).toContainEqual({ row: 2, col: 3, value: "x" });
  });
});
