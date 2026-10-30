import { describe, expect, it } from "vitest";

import type { ColumnMeta, FixedRuleInfo } from "../types/api";
import {
  appendMetricSlot,
  applyOpChoice,
  boxExpression,
  boxesFromLegacyRows,
  buildAnalysisConfig,
  conditionsOf,
  defaultMetricBox,
  derivedLabels,
  derivedMetricsOf,
  dimFieldsOf,
  isComputedBox,
  metricLabel,
  metricsOf,
  presetRange,
  removeMetricSlot,
  resultColumnsOf,
  rowsFromConfig,
  rowsFromRule,
  type AnalysisFilterRow,
  type MetricBox,
  type MetricOpSymbol,
  type MetricToken,
} from "./analysisRows";

function column(name: string, dtype: ColumnMeta["dtype"]): ColumnMeta {
  return { name, dtype, category: null, is_predefined: true };
}

const COLUMNS: ColumnMeta[] = [
  column("账单时间", "date"),
  column("寄件所属一级网点", "string"),
  column("目的所属省份", "string"),
  column("公斤段", "string"),
  column("物品来源", "string"),
  column("是否剔除", "string"),
  column("现价", "number"),
  column("原价", "number"),
  column("结算重量", "number"),
];

function filterRow(patch: Partial<AnalysisFilterRow>): AnalysisFilterRow {
  return {
    id: "f1",
    field: "寄件所属一级网点",
    op: "eq",
    values: [],
    value: "",
    value2: "",
    ...patch,
  };
}

/** 造一个指标框：字段 + 间隔运算符（末尾自动补运算符位）。 */
function makeBox(
  fields: string[],
  ops: MetricOpSymbol[] = [],
  patch: Partial<MetricBox> = {},
): MetricBox {
  const tokens: MetricToken[] = [];
  fields.forEach((field, index) => {
    if (index > 0) {
      tokens.push({ kind: "op", id: `op${index}`, value: ops[index - 1] ?? "＋" });
    }
    tokens.push({ kind: "slot", slot: { id: `s${index}`, field, agg: "sum" } });
  });
  tokens.push({ kind: "op", id: "opEnd", value: "＋" });
  return { id: "b1", tokens, ...patch };
}

const PRICE_RULE: FixedRuleInfo = {
  name: "网点单公斤价格分析",
  available: true,
  missing_fields: [],
  group_by: [
    "账单时间",
    "寄件所属一级网点",
    "目的所属省份",
    "公斤段",
    "物品来源",
    "是否剔除",
  ],
  metrics: [
    { field: "现价", agg: "sum", alias: "现价合计" },
    { field: "结算重量", agg: "sum", alias: "货量" },
  ],
  derived_metrics: [{ expression: "现价合计 / 货量", alias: "单公斤价格" }],
};

const DISCOUNT_RULE: FixedRuleInfo = {
  name: "网点折扣分析",
  available: true,
  missing_fields: [],
  group_by: ["账单时间", "寄件所属一级网点"],
  metrics: [
    { field: "现价", agg: "sum", alias: "现价合计" },
    { field: "原价", agg: "sum", alias: "原价合计" },
  ],
  derived_metrics: [{ expression: "现价合计 / 原价合计", alias: "折扣" }],
};

describe("dimFieldsOf / conditionsOf", () => {
  it("文本 + 等于 = 分组维度，取值空表示不限制", () => {
    const rows = [
      filterRow({ id: "f1", field: "寄件所属一级网点", values: [] }),
      filterRow({ id: "f2", field: "公斤段", values: ["0-60"] }),
    ];
    expect(dimFieldsOf(rows, COLUMNS)).toEqual(["寄件所属一级网点", "公斤段"]);

    const conditions = conditionsOf(rows, COLUMNS);
    expect(conditions).toEqual([{ field: "公斤段", op: "in", value: ["0-60"] }]);
  });

  it("不等于 → not_in；同字段重复出现只做一次维度", () => {
    const rows = [
      filterRow({ id: "f1", op: "ne", values: ["金东三部"] }),
      filterRow({ id: "f2", field: "寄件所属一级网点", values: [] }),
    ];
    expect(dimFieldsOf(rows, COLUMNS)).toEqual(["寄件所属一级网点"]);
    expect(conditionsOf(rows, COLUMNS)).toEqual([
      { field: "寄件所属一级网点", op: "not_in", value: ["金东三部"] },
    ]);
  });

  it("数值列条件不算维度；空值条件不发送", () => {
    const rows = [
      filterRow({ id: "f1", field: "现价", op: "gt", value: "" }),
      filterRow({ id: "f2", field: "现价", op: "gt", value: "12.5" }),
    ];
    expect(dimFieldsOf(rows, COLUMNS)).toEqual([]);
    expect(conditionsOf(rows, COLUMNS)).toEqual([
      { field: "现价", op: "gt", value: 12.5 },
    ]);
  });

  it("介于需要两个边界，缺一个就不发条件", () => {
    const half = [
      filterRow({ id: "f1", field: "现价", op: "between", value: "10", value2: "" }),
    ];
    expect(conditionsOf(half, COLUMNS)).toEqual([]);

    const full = [
      filterRow({ id: "f1", field: "现价", op: "between", value: "10", value2: "20" }),
    ];
    expect(conditionsOf(full, COLUMNS)).toEqual([
      { field: "现价", op: "between", value: [10, 20] },
    ]);
  });

  it("高于平均值无需填值", () => {
    const rows = [filterRow({ id: "f1", field: "现价", op: "aboveAvg", value: "" })];
    expect(conditionsOf(rows, COLUMNS)).toEqual([
      { field: "现价", op: "aboveAvg", value: null },
    ]);
  });
});

describe("指标框：字段槽与表达式", () => {
  it("一个字段槽 = 一个指标列，不出计算结果", () => {
    const box = defaultMetricBox("现价");
    expect(isComputedBox(box)).toBe(false);
    expect(metricsOf([box])).toEqual([
      { id: "m1", field: "现价", agg: "sum", alias: "现价合计" },
    ]);
    expect(derivedMetricsOf([box])).toEqual([]);
    expect(boxExpression(box)).toBe("现价合计");
  });

  it("框内 + 追加字段槽：用 ＋ 连接，并重新补一个运算符位", () => {
    const box = appendMetricSlot(defaultMetricBox("现价"), "原价");
    const kinds = box.tokens.map((token) => token.kind);
    expect(kinds).toEqual(["slot", "op", "slot", "op"]);
    expect(boxExpression(box)).toBe("现价合计 ＋ 原价合计");
    expect(isComputedBox(box)).toBe(true);
  });

  it("删字段槽时把它前面的运算符一起删掉", () => {
    const box = appendMetricSlot(defaultMetricBox("现价"), "原价");
    const slotId = box.tokens[2].kind === "slot" ? box.tokens[2].slot.id : "";
    const trimmed = removeMetricSlot(box, slotId);
    expect(trimmed.tokens.map((token) => token.kind)).toEqual(["slot", "op"]);
    expect(boxExpression(trimmed)).toBe("现价合计");
  });

  it("选 ( 自动补一个 ) 占位", () => {
    const box = makeBox(["现价", "原价"], ["＋"]);
    const wrapped = applyOpChoice(box, "op1", "(");
    // 左括号插在运算符后面，末尾自动补右括号
    expect(wrapped.tokens.map((token) => token.kind)).toEqual([
      "slot",
      "op",
      "paren",
      "slot",
      "op",
      "paren",
    ]);
    expect(boxExpression(wrapped)).toBe("现价合计 ＋ (原价合计)");
  });

  it("选 ) 把前面的字段整体括起来，后面的运算符位还在", () => {
    const box = makeBox(["原价", "现价", "原价"], ["－", "÷"]);
    const wrapped = applyOpChoice(box, "op2", ")");
    expect(boxExpression(wrapped)).toBe("(原价合计 － 现价合计) ÷ 原价合计");
    // 括号前面的运算符保留：结果是 (m1 - m2) / m3
    expect(derivedMetricsOf([wrapped])).toEqual([
      { id: "d1", expression: "(m1 - m2) / m3", alias: "计算结果" },
    ]);
  });

  it("嵌套括号：先 ( 再 ) 能配平", () => {
    const box = makeBox(["现价", "原价", "结算重量"], ["－", "×"]);
    // 在「－」上选 ( = 这个运算符后面整体括起来
    const inner = applyOpChoice(box, "op1", "(");
    expect(boxExpression(inner)).toBe("现价合计 － (原价合计 × 结算重量合计)");
    expect(derivedMetricsOf([inner])[0].expression).toBe("m1 - (m2 * m3)");
  });

  it("空字段槽 / 悬空运算符不会进表达式", () => {
    const box = makeBox(["现价", ""], ["×"]);
    expect(boxExpression(box)).toBe("现价合计");
    expect(derivedMetricsOf([box])).toEqual([]);
  });

  it("多个指标框：单字段各成一列，多字段才出计算结果", () => {
    const boxes = [
      makeBox(["现价"]),
      { ...makeBox(["原价", "结算重量"], ["÷"]), id: "b2" },
    ];
    expect(metricsOf(boxes).map((metric) => metric.alias)).toEqual([
      "现价合计",
      "原价合计",
      "结算重量合计",
    ]);
    expect(derivedMetricsOf(boxes)).toEqual([
      { id: "d1", expression: "m2 / m3", alias: "计算结果" },
    ]);
    expect(derivedLabels(boxes)).toEqual(["计算结果"]);
  });

  it("多条计算结果依次编号；固定规则给的名字优先", () => {
    const boxes = [
      { ...makeBox(["现价", "结算重量"], ["÷"]), id: "b1" },
      { ...makeBox(["现价", "原价"], ["÷"]), id: "b2" },
    ];
    expect(derivedLabels(boxes)).toEqual(["计算结果1", "计算结果2"]);

    const named = [
      { ...makeBox(["现价", "结算重量"], ["÷"]), id: "b1", alias: "单公斤价格" },
    ];
    expect(derivedLabels(named)).toEqual(["单公斤价格"]);
  });

  it("列名用「字段 + 聚合简称」，同名自动加序号", () => {
    expect(metricLabel({ field: "现价", agg: "sum" })).toBe("现价合计");
    expect(metricLabel({ field: "原价", agg: "avg" })).toBe("原价均值");
    expect(metricLabel({ field: "现价", agg: "sum", alias: "货量" })).toBe("货量");
    const boxes = [makeBox(["现价"]), { ...makeBox(["现价"]), id: "b2" }];
    expect(metricsOf(boxes).map((metric) => metric.alias)).toEqual([
      "现价合计",
      "现价合计_2",
    ]);
  });
});

describe("固定规则 → 指标框", () => {
  it("单公斤价格：一个指标框 = 现价 ÷ 货量", () => {
    const { filterRows, metricBoxes } = rowsFromRule(PRICE_RULE, COLUMNS);
    expect(filterRows.map((row) => row.field)).toEqual(PRICE_RULE.group_by);
    expect(metricBoxes).toHaveLength(1);
    expect(isComputedBox(metricBoxes[0])).toBe(true);
    expect(boxExpression(metricBoxes[0])).toBe("现价合计 ÷ 货量");
    expect(derivedLabels(metricBoxes)).toEqual(["单公斤价格"]);
  });

  it("配置可回到后端：group_by 6 个、派生 = m1 / m2", () => {
    const { filterRows, metricBoxes } = rowsFromRule(PRICE_RULE, COLUMNS);
    const config = buildAnalysisConfig(
      "ds1",
      { start: "2026-10-01", end: "2026-10-31", field: "账单时间" },
      filterRows,
      metricBoxes,
      COLUMNS,
    );
    expect(config).not.toBeNull();
    expect(config?.group_by.map((group) => group.field)).toEqual(PRICE_RULE.group_by);
    expect(config?.filters.conditions).toEqual([]);
    expect(config?.metrics).toEqual([
      { id: "m1", field: "现价", agg: "sum", alias: "现价合计" },
      { id: "m2", field: "结算重量", agg: "sum", alias: "货量" },
    ]);
    expect(config?.derived_metrics).toEqual([
      { id: "d1", expression: "m1 / m2", alias: "单公斤价格" },
    ]);
  });

  it("网点折扣分析：现价合计 / 原价合计", () => {
    const { metricBoxes } = rowsFromRule(DISCOUNT_RULE, COLUMNS);
    expect(boxExpression(metricBoxes[0])).toBe("现价合计 ÷ 原价合计");
    expect(derivedMetricsOf(metricBoxes)).toEqual([
      { id: "d1", expression: "m1 / m2", alias: "折扣" },
    ]);
  });

  it("没有指标时仍能生成配置（保存项目用）", () => {
    const config = buildAnalysisConfig(
      "ds1",
      { start: "2026-10-01", end: "2026-10-31", field: "账单时间" },
      [filterRow({ values: ["金东三部"] })],
      [],
      COLUMNS,
    );
    expect(config?.metrics).toEqual([]);
    expect(config?.derived_metrics).toEqual([]);
    expect(config?.filters.conditions).toHaveLength(1);
  });

  it("没有时间范围时不生成配置", () => {
    expect(buildAnalysisConfig("ds1", null, [], [], COLUMNS)).toBeNull();
  });
});

describe("rowsFromConfig 往返（保存 / 恢复 / 导出都靠它）", () => {
  it("括号表达式还原成同一个指标框，重新构建仍然一致", () => {
    const boxes = [
      { ...makeBox(["原价", "现价", "原价"], ["－", "÷"]), id: "b1" },
    ];
    const withParens = [applyOpChoice(boxes[0], "op2", ")")];
    const timeRange = { start: "2026-10-01", end: "2026-10-31", field: "账单时间" };
    const rows = [
      filterRow({ id: "f1", field: "寄件所属一级网点", values: ["金东三部"] }),
      filterRow({ id: "f2", field: "公斤段", op: "ne", values: ["150-300"] }),
    ];
    const config = buildAnalysisConfig("ds1", timeRange, rows, withParens, COLUMNS);
    expect(config?.derived_metrics[0].expression).toBe("(m1 - m2) / m3");

    const restored = rowsFromConfig(config, COLUMNS);
    expect(restored.metricBoxes).toHaveLength(1);
    // 同一个字段出现两次时别名会加序号（原价合计 / 原价合计_2），表达式照别名显示
    expect(boxExpression(restored.metricBoxes[0])).toBe(
      "(原价合计 － 现价合计) ÷ 原价合计_2",
    );
    expect(dimFieldsOf(restored.filterRows, COLUMNS)).toEqual([
      "寄件所属一级网点",
      "公斤段",
    ]);

    const rebuilt = buildAnalysisConfig(
      "ds1",
      timeRange,
      restored.filterRows,
      restored.metricBoxes,
      COLUMNS,
    );
    expect(rebuilt?.filters).toEqual(config?.filters);
    expect(rebuilt?.group_by).toEqual(config?.group_by);
    expect(rebuilt?.metrics).toEqual(config?.metrics);
    expect(rebuilt?.derived_metrics).toEqual(config?.derived_metrics);
  });

  it("固定规则带的名字（货量 / 单公斤价格）回到行模型还在", () => {
    const config = buildAnalysisConfig(
      "ds1",
      { start: "2026-10-01", end: "2026-10-31", field: "账单时间" },
      [],
      rowsFromRule(PRICE_RULE, COLUMNS).metricBoxes,
      COLUMNS,
    );
    const restored = rowsFromConfig(config, COLUMNS);
    expect(restored.metricBoxes[0].alias).toBe("单公斤价格");
    expect(derivedLabels(restored.metricBoxes)).toEqual(["单公斤价格"]);
    expect(metricsOf(restored.metricBoxes).map((metric) => metric.alias)).toEqual([
      "现价合计",
      "货量",
    ]);
  });

  it("group_by 里没有对应条件的维度补成「全部」条件行", () => {
    const { filterRows } = rowsFromConfig(
      {
        dataset_id: "ds1",
        time_range: { start: "2026-10-01", end: "2026-10-31", field: "账单时间" },
        filters: { logic: "AND", conditions: [] },
        group_by: [
          { field: "寄件所属一级网点", time_granularity: null },
          { field: "公斤段", time_granularity: null },
        ],
        metrics: [{ id: "m1", field: "现价", agg: "sum", alias: "现价合计" }],
        derived_metrics: [],
      },
      COLUMNS,
    );
    expect(filterRows.map((row) => row.field)).toEqual(["寄件所属一级网点", "公斤段"]);
    expect(filterRows.map((row) => row.values)).toEqual([[], []]);
  });

  it("解析不了的派生表达式原样保留，不丢列", () => {
    const boxes = rowsFromConfig(
      {
        dataset_id: "ds1",
        time_range: { start: "2026-10-01", end: "2026-10-31", field: "账单时间" },
        filters: { logic: "AND", conditions: [] },
        group_by: [],
        metrics: [{ id: "m1", field: "现价", agg: "sum", alias: "现价合计" }],
        derived_metrics: [{ id: "d1", expression: "m1 * 2", alias: "翻倍" }],
      },
      COLUMNS,
    ).metricBoxes;
    expect(derivedLabels(boxes)).toEqual(["翻倍"]);
    expect(derivedMetricsOf(boxes)).toEqual([
      { id: "d1", expression: "m1 * 2", alias: "翻倍" },
    ]);
  });
});

describe("旧版指标行 → 指标框", () => {
  it("AND 切开成两个指标框，四则运算合成一个", () => {
    const boxes = boxesFromLegacyRows([
      { id: "m1", field: "现价", agg: "sum", op: "AND", alias: "现价合计" },
      { id: "m2", field: "原价", agg: "sum", op: "÷", alias: "原价合计", chainAlias: "单公斤价格" },
      { id: "m3", field: "结算重量", agg: "sum", op: "", alias: "货量" },
    ]);
    expect(boxes).toHaveLength(2);
    expect(boxExpression(boxes[0])).toBe("现价合计");
    expect(boxExpression(boxes[1])).toBe("原价合计 ÷ 货量");
    expect(derivedLabels(boxes)).toEqual(["单公斤价格"]);
  });
});

describe("resultColumnsOf", () => {
  it("维度 → 指标 → 计算结果", () => {
    const rows = [filterRow({ id: "f1", field: "公斤段", values: [] })];
    const boxes = [
      { ...makeBox(["现价"]), id: "b1" },
      { ...makeBox(["原价", "结算重量"], ["÷"]), id: "b2", alias: "单公斤价格" },
    ];
    expect(resultColumnsOf(rows, boxes, COLUMNS)).toEqual([
      "公斤段",
      "现价合计",
      "原价合计",
      "结算重量合计",
      "单公斤价格",
    ]);
  });
});

describe("presetRange", () => {
  it("本月 / 上月按自然月", () => {
    const today = new Date(2026, 9, 24); // 2026-10-24
    expect(presetRange("本月", today)).toEqual({
      start: "2026-10-01",
      end: "2026-10-31",
    });
    expect(presetRange("上月", today)).toEqual({
      start: "2026-09-01",
      end: "2026-09-30",
    });
    expect(presetRange("上月", new Date(2026, 0, 5))).toEqual({
      start: "2025-12-01",
      end: "2025-12-31",
    });
  });
});
