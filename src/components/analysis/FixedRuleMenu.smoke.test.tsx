import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import FixedRuleMenu from "./FixedRuleMenu";
import type { FixedRuleInfo } from "../../types/api";

const RULES: FixedRuleInfo[] = [
  {
    name: "网点货量分析",
    available: true,
    missing_fields: [],
    group_by: ["账单时间", "寄件所属一级网点", "公斤段"],
    metrics: [{ field: "结算重量", agg: "sum", alias: "货量" }],
    derived_metrics: [],
  },
  {
    name: "网点单公斤价格分析",
    available: true,
    missing_fields: [],
    group_by: ["账单时间", "寄件所属一级网点"],
    metrics: [
      { field: "现价", agg: "sum", alias: "现价合计" },
      { field: "结算重量", agg: "sum", alias: "货量" },
    ],
    derived_metrics: [{ expression: "现价合计 / 货量", alias: "单公斤价格" }],
  },
  {
    name: "网点折扣分析",
    available: false,
    missing_fields: ["现价", "原价"],
    group_by: ["账单时间"],
    metrics: [{ field: "现价", agg: "sum", alias: "现价合计" }],
    derived_metrics: [],
  },
];

describe("FixedRuleMenu 二级菜单", () => {
  it("左列列出口径与可用状态，右列默认展开第一条可用规则", () => {
    const html = renderToString(<FixedRuleMenu rules={RULES} onAnalyze={vi.fn()} />);

    expect(html).toContain("网点货量分析");
    expect(html).toContain("网点单公斤价格分析");
    expect(html).toContain("网点折扣分析");
    expect(html).toContain("可用");
    expect(html).toContain("缺 2 字段");
    // 右列详情：分组 / 指标 / 派生 + 开始分析
    expect(html).toContain("分组");
    expect(html).toContain("货量 = 求和(结算重量)");
    expect(html).toContain("开始分析");
    expect(html).toContain("选中后进入分析页并预填");
  });

  it("只有缺字段的规则时不展开右列", () => {
    const html = renderToString(
      <FixedRuleMenu rules={[RULES[2]]} onAnalyze={vi.fn()} />,
    );
    expect(html).toContain("缺 2 字段");
    expect(html).not.toContain("开始分析");
  });
});
