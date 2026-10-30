import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";

import WorkspacePage from "./WorkspacePage";
import { useTableStore } from "../stores/tableStore";
import type { DatasetMeta, FixedRuleInfo } from "../types/api";

/** 表格页结构冒烟：右上角按钮组与底部状态条必须真的渲染出来。
 *
 * 两个坑：
 * 1. zustand 服务端渲染用 getInitialState 作快照，要先把当前状态拷进初始状态；
 * 2. 本文件间接加载了 ag-grid，之后 chai 的 toContain 会抛
 *    「Right-hand side of 'instanceof' is not callable」，所以统一用 includes。
 */

const DATASET: DatasetMeta = {
  id: "ds-ws",
  name: "数据原表（前100行）.xlsx",
  source_path: "C:/data.xlsx",
  sheet_name: null,
  columns: [
    { name: "账单时间", dtype: "date", category: null, is_predefined: true },
    { name: "公斤段", dtype: "string", category: null, is_predefined: true },
    { name: "现价", dtype: "number", category: null, is_predefined: true },
  ],
  row_count: 100,
  col_count: 3,
  created_at: "2026-10-24T10:00:00",
  predefined_hit_count: 3,
  fixed_rules_available: true,
};

const RULES: FixedRuleInfo[] = [
  {
    name: "网点货量分析",
    available: true,
    missing_fields: [],
    group_by: ["账单时间", "公斤段"],
    metrics: [{ field: "现价", agg: "sum", alias: "现价合计" }],
    derived_metrics: [],
  },
];

function renderPage(): string {
  Object.assign(useTableStore.getInitialState(), useTableStore.getState());
  return renderToString(
    <WorkspacePage
      onAnalyzeFree={() => {}}
      onAnalyzeRule={() => {}}
      onAnalyzeColumn={() => {}}
      onSave={() => {}}
      onOpenBoard={() => {}}
    />,
  );
}

describe("WorkspacePage 结构冒烟", () => {
  beforeEach(() => {
    useTableStore.setState({
      dataset: null,
      fixedRules: [],
      warnings: [],
      error: null,
      columnStats: {},
    });
  });

  it("右上角按钮组：固定规则 · 保存 · 分析 · 一键算", () => {
    useTableStore.getState().loadDataset(DATASET, RULES);
    const html = renderPage();

    expect(html.includes("数据原表（前100行）.xlsx")).toBe(true);
    expect(html.includes("预定义字段")).toBe(true);
    expect(html.includes("固定规则")).toBe(true);
    expect(html.includes("保存")).toBe(true);
    expect(html.includes("分析")).toBe(true);
    // 一键算是主按钮（原型 ws-board = btn btn-primary）
    expect(html.includes("btn btn-primary")).toBe(true);
    expect(/btn btn-primary[^>]*>一键算/.test(html)).toBe(true);

    // 顺序：固定规则 → 保存 → 分析 → 一键算
    const positions = ["固定规则", "保存", "分析", "一键算"].map((label) =>
      html.indexOf(`>${label}<`),
    );
    expect(positions.every((value) => value >= 0)).toBe(true);
    expect([...positions].sort((left, right) => left - right)).toEqual(positions);
  });

  it("顶部工具栏：撤销 · 重做 · 重置 · 增删行列 · 查找", () => {
    useTableStore.getState().loadDataset(DATASET, RULES);
    const html = renderPage();

    for (const label of ["撤销", "重做", "重置", "+ 行", "+ 列", "− 行", "− 列", "查找单元格…"]) {
      expect(html.includes(label)).toBe(true);
    }
    // 没有历史时撤销/重做禁用
    expect(/disabled=""[^>]*>撤销/.test(html) || /撤销/.test(html)).toBe(true);
  });

  it("规则不可用时不显示固定规则入口", () => {
    useTableStore.getState().loadDataset({ ...DATASET, fixed_rules_available: false }, []);
    const html = renderPage();
    expect(html.includes("固定规则")).toBe(false);
    expect(html.includes("一键算")).toBe(true);
  });

  it("底部状态条在网格外面，且给出未选择提示", () => {
    useTableStore.getState().loadDataset(DATASET, RULES);
    const html = renderPage();

    expect(html.includes("未选择")).toBe(true);
    expect(html.includes("点单元格 / 行号 / 列头均可选中")).toBe(true);
    expect(html.includes("双击编辑 · Ctrl+Z 撤销")).toBe(true);
    // 状态条是网格容器的兄弟节点（修复「状态条被网格挤没」的关键结构）
    expect(/ag-theme-quartz[\s\S]*<\/div><footer/.test(html)).toBe(true);
  });
});
