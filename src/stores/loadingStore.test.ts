import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api/import", () => ({
  importFile: vi.fn(),
  fetchPreviewPage: vi.fn(),
  fetchTimeRange: vi.fn(),
}));

import { importFile as apiImportFile } from "../api/import";
import type { ImportResponse } from "../types/api";
import {
  CHART_WAITING_MESSAGE,
  IMPORT_WAITING_MESSAGE,
  currentLoadingMessage,
  useLoadingStore,
} from "./loadingStore";
import { useTableStore } from "./tableStore";

const RESPONSE: ImportResponse = {
  dataset: {
    id: "ds-1",
    name: "x.xlsx",
    source_path: "x.xlsx",
    sheet_name: null,
    columns: [],
    row_count: 0,
    col_count: 0,
    created_at: "2026-10-30T00:00:00",
    predefined_hit_count: 0,
    fixed_rules_available: false,
  },
  preview: { columns: [], rows: [], offset: 0, total_rows: 0 },
  warnings: [],
  fixed_rules: [],
};

const mockedImport = vi.mocked(apiImportFile);

describe("导入表格时的等待提示（第 16 轮）", () => {
  beforeEach(() => {
    useLoadingStore.getState().clear();
    mockedImport.mockReset();
    useTableStore.setState({ dataset: null, preview: null, error: null });
  });

  it("导入期间显示提示，成功后自动收掉", async () => {
    let resolveImport!: (value: ImportResponse) => void;
    mockedImport.mockReturnValue(
      new Promise<ImportResponse>((resolve) => {
        resolveImport = resolve;
      }),
    );

    const pending = useTableStore.getState().importFile("x.xlsx");
    expect(useLoadingStore.getState().tasks.import).toBe(IMPORT_WAITING_MESSAGE);

    resolveImport(RESPONSE);
    await pending;
    expect(useLoadingStore.getState().tasks.import).toBeUndefined();
    expect(useTableStore.getState().dataset?.id).toBe("ds-1");
  });

  it("导入失败也会把提示收掉，并留下错误信息", async () => {
    mockedImport.mockRejectedValue(new Error("导入失败"));
    await useTableStore.getState().importFile("x.xlsx");
    expect(useLoadingStore.getState().tasks.import).toBeUndefined();
    expect(useTableStore.getState().error).toBe("导入失败");
  });

  it("导入与图表两个任务互不干扰：先结束的不会关掉另一个的提示", () => {
    useLoadingStore.getState().start("import", IMPORT_WAITING_MESSAGE);
    useLoadingStore.getState().start("board-compare", CHART_WAITING_MESSAGE);
    expect(currentLoadingMessage(useLoadingStore.getState().tasks)).toBe(CHART_WAITING_MESSAGE);

    useLoadingStore.getState().finish("import");
    expect(useLoadingStore.getState().tasks.import).toBeUndefined();
    expect(useLoadingStore.getState().tasks["board-compare"]).toBe(CHART_WAITING_MESSAGE);

    useLoadingStore.getState().finish("board-compare");
    expect(currentLoadingMessage(useLoadingStore.getState().tasks)).toBeNull();
  });

  it("finish 未开始的 key 不会改动状态", () => {
    useLoadingStore.getState().start("import", IMPORT_WAITING_MESSAGE);
    useLoadingStore.getState().finish("not-started");
    expect(useLoadingStore.getState().tasks.import).toBe(IMPORT_WAITING_MESSAGE);
  });
});
