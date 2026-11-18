import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";

import AnalysisWindow from "./AnalysisWindow";
import { useAnalysisStore } from "../../stores/analysisStore";
import type { DatasetMeta, FixedRuleInfo } from "../../types/api";

/** 分析页结构冒烟：真的把整页渲染出来，确认分区/文案/控件都在。
 *
 * zustand 在服务端渲染时用 getInitialState 作为快照，所以先把当前状态拷进
 * 初始状态，再 renderToString —— 这样不依赖 jsdom 也能验证渲染结果。
 */

const DATASET: DatasetMeta = {
  id: "ds-smoke",
  name: "数据原表（前100行）.xlsx",
  source_path: "C:/data.xlsx",
  sheet_name: null,
  columns: [
    { name: "账单时间", dtype: "date", category: null, is_predefined: true },
    {
      name: "寄件所属一级网点",
      dtype: "string",
      category: "寄件网点信息",
      is_predefined: true,
    },
    { name: "公斤段", dtype: "string", category: "运单基本信息", is_predefined: true },
    { name: "现价", dtype: "number", category: "运单基本信息", is_predefined: true },
    { name: "结算重量", dtype: "number", category: "运单基本信息", is_predefined: true },
  ],
  row_count: 100,
  col_count: 5,
  created_at: "2026-10-24T10:00:00",
  predefined_hit_count: 5,
  fixed_rules_available: false,
};

const RULE: FixedRuleInfo = {
  name: "网点单公斤价格分析",
  available: true,
  missing_fields: [],
  group_by: ["账单时间", "寄件所属一级网点", "公斤段"],
  metrics: [
    { field: "现价", agg: "sum", alias: "现价合计" },
    { field: "结算重量", agg: "sum", alias: "货量" },
  ],
  derived_metrics: [{ expression: "现价合计 / 货量", alias: "单公斤价格" }],
};

function renderPage(): string {
  Object.assign(useAnalysisStore.getInitialState(), useAnalysisStore.getState());
  return renderToString(<AnalysisWindow onClose={() => {}} />);
}

describe("AnalysisWindow 结构冒烟", () => {
  beforeEach(() => {
    useAnalysisStore.getState().reset();
  });

  it("自由分析：两区式布局 + 空态提示", () => {
    useAnalysisStore.getState().openFree(DATASET);
    const html = renderPage();

    expect(html).toContain("自由分析");
    expect(html).toContain("时间范围");
    expect(html).toContain("筛选条件");
    expect(html).toContain("指标");
    expect(html).toContain("开始计算");
    expect(html).toContain("尚未计算");
    expect(html).toContain("没有条件：结果只有一行全表合计");
    expect(html).toContain("还没有指标：至少添加一个");
    expect(html).toContain("点击右侧 + 新增指标，点击指标框内 + 新增计算字段");
    expect(html).toContain("帮助");
    expect(html).toContain("盈亏平衡分析");
    expect(html).toContain("返回表格");
  });

  it("固定规则：维度行 + 指标框（一框一行表达式 + 运算符下拉）", () => {
    useAnalysisStore.getState().openForRule(RULE, DATASET);
    const html = renderPage();

    expect(html).toContain("固定规则：网点单公斤价格分析");
    expect(html).toContain("寄件所属一级网点");
    expect(html).toContain("全部（按此字段展开）");
    expect(html).toContain("结果表列");
    // 指标框头部：指标N（React SSR 会在文字节点间插注释）
    expect(html).toMatch(/指标(<!-- -->)?1/);
    expect(html).toContain("合并");
    // 指标框的表达式：现价合计 ÷ 货量，结果列名「单公斤价格」
    expect(html).toContain("现价合计");
    expect(html).toContain("货量");
    expect(html).toContain("单公斤价格");
    // 运算符下拉 = 四则 + 括号（AND 已取消）
    expect(html).toMatch(/value="÷" selected/);
    expect(html).toMatch(/value="\("/);
    expect(html.includes("AND")).toBe(false);
    // 算式说明行已按需求删除，只保留结果表列预览
    expect(html.includes("单公斤价格 = 现价合计 ÷ 货量")).toBe(false);
    // 分析方法下拉 = 文本/数值两套运算符
    expect(html).toContain("开头是");
    expect(html).toContain("不包含");
  });
});
