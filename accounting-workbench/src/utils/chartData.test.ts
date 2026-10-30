import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  applyChartDisplay,
  bucketDate,
  fitAxisLabels,
  isNumericColumn,
  labelFootprint,
  normalizeChartConfig,
  prepareChartData,
  reconcileChartConfig,
  sanitizeConfigForType,
  validateChartConfig,
  xDimSummary,
  xDimsOf,
} from "./chartData";
import type { ChartConfig, ChartXDim, ComputeResult } from "../types/api";

function makeResult(columns: string[], rows: unknown[][]): ComputeResult {
  return { columns, rows, row_count: rows.length, meta: {} };
}

function makeConfig(patch: Partial<ChartConfig> = {}): ChartConfig {
  return {
    chart_type: "bar",
    x_axis: "账单时间",
    y_axis: "货量",
    series: null,
    show_fields: [],
    sort_by: "x",
    sort_order: "asc",
    top_n: null,
    palette: "default",
    title: "",
    show_legend: true,
    show_data_labels: false,
    time_granularity: null,
    aggregation: "sum",
    ...patch,
  };
}

describe("prepareChartData", () => {
  it("基础柱状图：单系列，类别与数值对齐", () => {
    const result = makeResult(
      ["账单时间", "货量"],
      [["2026-10-01", 10], ["2026-10-02", 20], ["2026-10-03", 15]],
    );
    const data = prepareChartData(result, makeConfig());
    expect(data.categories).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(data.series).toEqual([{ name: "货量", data: [10, 20, 15] }]);
  });

  it("系列拆分：按系列字段生成多个系列", () => {
    const result = makeResult(
      ["账单时间", "公斤段", "货量"],
      [
        ["2026-10-01", "0-1kg", 10],
        ["2026-10-01", "1-2kg", 20],
        ["2026-10-02", "0-1kg", 15],
      ],
    );
    const data = prepareChartData(result, makeConfig({ series: "公斤段" }));
    expect(data.categories).toEqual(["2026-10-01", "2026-10-02"]);
    expect(data.series).toEqual([
      { name: "0-1kg", data: [10, 15] },
      { name: "1-2kg", data: [20, null] },
    ]);
  });

  it("Y 指标勾多个时按多系列画（原型 Y 指标 chips）", () => {
    const result = makeResult(
      ["公斤段", "货量", "现价合计"],
      [
        ["0-1kg", 10, 100],
        ["1-2kg", 20, 260],
      ],
    );
    const data = prepareChartData(
      result,
      makeConfig({ x_axis: "公斤段", y_axis: "货量", show_fields: ["货量", "现价合计"] }),
    );
    expect(data.categories).toEqual(["0-1kg", "1-2kg"]);
    expect(data.series).toEqual([
      { name: "货量", data: [10, 20] },
      { name: "现价合计", data: [100, 260] },
    ]);
  });

  it("多系列 + TopN 按行合计排序截断", () => {
    const result = makeResult(
      ["公斤段", "货量", "现价合计"],
      [
        ["0-1kg", 10, 1],
        ["1-2kg", 20, 2],
        ["2-3kg", 5, 1],
      ],
    );
    const data = prepareChartData(
      result,
      makeConfig({
        x_axis: "公斤段",
        show_fields: ["货量", "现价合计"],
        sort_by: "y",
        sort_order: "desc",
        top_n: 2,
      }),
    );
    expect(data.categories).toEqual(["1-2kg", "0-1kg"]);
    expect(data.series.map((series) => series.data)).toEqual([
      [20, 10],
      [2, 1],
    ]);
  });

  it("多系列按月重汇总", () => {
    const result = makeResult(
      ["账单时间", "货量", "现价合计"],
      [
        ["2026-01-05", 10, 1],
        ["2026-01-20", 20, 2],
        ["2026-02-10", 5, 3],
      ],
    );
    const data = prepareChartData(
      result,
      makeConfig({
        x_axis: "账单时间",
        show_fields: ["货量", "现价合计"],
        time_granularity: "month",
      }),
    );
    expect(data.categories).toEqual(["2026-01", "2026-02"]);
    expect(data.series.map((series) => series.data)).toEqual([
      [30, 5],
      [3, 3],
    ]);
  });

  it("时间粒度重汇总（按月 sum）", () => {
    const result = makeResult(
      ["账单时间", "货量"],
      [["2026-01-05", 10], ["2026-01-20", 20], ["2026-02-10", 15]],
    );
    const data = prepareChartData(
      result,
      makeConfig({ time_granularity: "month", aggregation: "sum" }),
    );
    expect(data.categories).toEqual(["2026-01", "2026-02"]);
    expect(data.series).toEqual([{ name: "货量", data: [30, 15] }]);
  });

  it("全局 TopN：按 Y 降序取前 N 个 X", () => {
    const result = makeResult(
      ["账单时间", "货量"],
      [["a", 10], ["b", 30], ["c", 20]],
    );
    const data = prepareChartData(
      result,
      makeConfig({ sort_by: "y", sort_order: "desc", top_n: 2 }),
    );
    expect(data.categories).toEqual(["b", "c"]);
    expect(data.series).toEqual([{ name: "货量", data: [30, 20] }]);
  });

  it("饼图过滤负数与零值", () => {
    const result = makeResult(
      ["公斤段", "货量"],
      [["0-1kg", 10], ["1-2kg", -5], ["2-3kg", 0], ["3-4kg", 20]],
    );
    const data = prepareChartData(
      result,
      makeConfig({ chart_type: "pie", x_axis: "公斤段" }),
    );
    expect(data.categories).toEqual(["0-1kg", "3-4kg"]);
    expect(data.series).toEqual([{ name: "货量", data: [10, 20] }]);
  });
});

describe("validateChartConfig", () => {
  it("合法配置 valid=true", () => {
    const result = makeResult(["账单时间", "货量"], [["2026-10-01", 10]]);
    expect(validateChartConfig(makeConfig(), result).valid).toBe(true);
  });

  it("缺少 X/Y 报错", () => {
    const result = makeResult(["账单时间", "货量"], [["2026-10-01", 10]]);
    const v = validateChartConfig(makeConfig({ x_axis: null, y_axis: null }), result);
    expect(v.valid).toBe(false);
    expect(v.errors).toContain("请选择 X 轴字段");
    expect(v.errors).toContain("请选择 Y 轴字段");
  });

  it("饼图带系列字段报错", () => {
    const result = makeResult(["公斤段", "货量"], [["0-1kg", 10]]);
    const v = validateChartConfig(
      makeConfig({ chart_type: "pie", x_axis: "公斤段", series: "公斤段" }),
      result,
    );
    expect(v.valid).toBe(false);
    expect(v.errors).toContain("饼图不支持系列字段");
  });

  it("饼图负数给 warning（非 error）", () => {
    const result = makeResult(["公斤段", "货量"], [["0-1kg", 10], ["1-2kg", -5]]);
    const v = validateChartConfig(
      makeConfig({ chart_type: "pie", x_axis: "公斤段" }),
      result,
    );
    expect(v.valid).toBe(true);
    expect(v.warnings).toContain("饼图已过滤 1 条负数/零值数据");
  });

  it("时间粒度作用于派生列报错", () => {
    const result = makeResult(["账单时间", "单公斤价格"], [["2026-10-01", 3.5]]);
    const v = validateChartConfig(
      makeConfig({ y_axis: "单公斤价格", time_granularity: "month" }),
      result,
      ["单公斤价格"],
    );
    expect(v.valid).toBe(false);
    expect(v.errors.some((e) => e.includes("时间粒度重汇总仅支持原始聚合指标"))).toBe(true);
  });

  it("柱状图类别数超过 50 报错", () => {
    const rows = Array.from({ length: 51 }, (_, i) => [`c${i}`, i]);
    const v = validateChartConfig(
      makeConfig({ chart_type: "bar", x_axis: "类别" }),
      makeResult(["类别", "货量"], rows),
    );
    expect(v.valid).toBe(false);
    expect(v.errors).toContain("柱状图类别数不能超过 50");
  });
});

describe("bucketDate / isNumericColumn / sanitizeConfigForType", () => {
  it("bucketDate 分桶正确", () => {
    expect(bucketDate("2026-01-15", "day")).toBe("2026-01-15");
    expect(bucketDate("2026-01-15", "month")).toBe("2026-01");
    expect(bucketDate("2026-01-15", "quarter")).toBe("2026-Q1");
    expect(bucketDate("2026-01-15", "year")).toBe("2026");
    expect(bucketDate("未知日期", "month")).toBe(null);
  });

  it("isNumericColumn 正确判断", () => {
    const result = makeResult(["a", "b"], [[1, "x"]]);
    expect(isNumericColumn(result, "a")).toBe(true);
    expect(isNumericColumn(result, "b")).toBe(false);
  });

  it("切到 pie 清空 series", () => {
    const sanitized = sanitizeConfigForType(makeConfig({ series: "公斤段" }), "pie");
    expect(sanitized.config.series).toBe(null);
    expect(sanitized.cleared).toContain("series");
  });
});

/* ── 需求 6：X 轴跨字段取交集（多维度组合） ── */

const COMBO_LABELS = [
  "金华婺城 · 浙江省 · 0-60",
  "金华婺城 · 广东省 · 0-60",
  "义乌铁路口岸 · 浙江省 · 0-60",
  "义乌铁路口岸 · 广东省 · 0-60",
];

const COMBO_DIMS: ChartXDim[] = [
  { field: "寄件所属一级网点", values: ["金华婺城", "义乌铁路口岸"] },
  { field: "目的所属省份", values: ["浙江省", "广东省"] },
  { field: "公斤段", values: ["0-60"] },
];

function comboResult(): ComputeResult {
  return makeResult(
    ["寄件所属一级网点", "目的所属省份", "公斤段", "货量"],
    [
      ["金华婺城", "浙江省", "0-60", 10],
      ["金华婺城", "广东省", "0-60", 20],
      ["义乌铁路口岸", "浙江省", "0-60", 5],
      ["义乌铁路口岸", "广东省", "0-60", 7],
    ],
  );
}

describe("X 轴多维度组合", () => {
  it("组合标签 = 各维度取值用「 · 」连接，顺序 = 添加维度的顺序", () => {
    const data = prepareChartData(comboResult(), makeConfig({ x_dims: COMBO_DIMS }));
    expect(data.categories).toEqual(COMBO_LABELS);
    expect(data.series).toEqual([{ name: "货量", data: [10, 20, 5, 7] }]);
  });

  it("不勾取值 = 该维度全部值", () => {
    const dims: ChartXDim[] = [
      { field: "寄件所属一级网点" },
      { field: "目的所属省份", values: ["浙江省"] },
    ];
    const data = prepareChartData(comboResult(), makeConfig({ x_dims: dims }));
    expect(data.categories).toEqual(["金华婺城 · 浙江省", "义乌铁路口岸 · 浙江省"]);
    expect(data.series).toEqual([{ name: "货量", data: [10, 5] }]);
  });

  it("空数组 = 该维度一条都不留", () => {
    const dims: ChartXDim[] = [
      { field: "目的所属省份", values: [] },
      { field: "公斤段" },
    ];
    const data = prepareChartData(comboResult(), makeConfig({ x_dims: dims }));
    expect(data.categories).toEqual([]);
    expect(data.series).toEqual([{ name: "货量", data: [] }]);
  });

  it("排序 / Top N 在组合列上做", () => {
    const data = prepareChartData(
      comboResult(),
      makeConfig({ x_dims: COMBO_DIMS, sort_by: "y", sort_order: "desc", top_n: 2 }),
    );
    expect(data.categories).toEqual([
      "金华婺城 · 广东省 · 0-60",
      "金华婺城 · 浙江省 · 0-60",
    ]);
    expect(data.series).toEqual([{ name: "货量", data: [20, 10] }]);
  });

  it("多指标系列也走组合标签", () => {
    const result = makeResult(
      ["公斤段", "网点", "货量", "现价合计"],
      [
        ["0-60", "A", 10, 100],
        ["0-60", "B", 20, 260],
      ],
    );
    const data = prepareChartData(
      result,
      makeConfig({
        x_dims: [{ field: "公斤段" }, { field: "网点" }],
        show_fields: ["货量", "现价合计"],
      }),
    );
    expect(data.categories).toEqual(["0-60 · A", "0-60 · B"]);
    expect(data.series).toEqual([
      { name: "货量", data: [10, 20] },
      { name: "现价合计", data: [100, 260] },
    ]);
  });

  it("导出前把组合列真正烘焙成一列，后端按列名就能画", () => {
    const result = comboResult();
    const display = applyChartDisplay(result, makeConfig({ x_dims: COMBO_DIMS }));

    const name = "寄件所属一级网点·目的所属省份·公斤段";
    expect(display.result.columns).toEqual([...result.columns, name]);
    expect(display.result.rows.map((row) => row[result.columns.length])).toEqual(
      COMBO_LABELS,
    );
    expect(display.config.x_axis).toBe(name);
    expect(display.config.x_dims).toEqual([]);

    // 烘焙后的结果表 + 配置再走一遍（= 后端 matplotlib 看到的数据），刻度不变
    const baked = prepareChartData(display.result, display.config);
    expect(baked.categories).toEqual(COMBO_LABELS);
    expect(baked.series).toEqual([{ name: "货量", data: [10, 20, 5, 7] }]);
  });

  it("烘焙时按各维度取值筛行，图例改名照旧生效", () => {
    const dims: ChartXDim[] = [
      { field: "寄件所属一级网点" },
      { field: "目的所属省份", values: ["广东省"] },
    ];
    const display = applyChartDisplay(
      comboResult(),
      makeConfig({ x_dims: dims, label_aliases: { 货量: "货量(kg)" } }),
    );
    expect(display.result.row_count).toBe(2);
    expect(display.result.columns).toContain("寄件所属一级网点·目的所属省份");
    expect(display.config.y_axis).toBe("货量(kg)");
  });

  it("单维度不烘焙额外列（沿用原有导出行为）", () => {
    const result = comboResult();
    const display = applyChartDisplay(
      result,
      makeConfig({ x_axis: "寄件所属一级网点", x_values: ["金华婺城"] }),
    );
    expect(display.result.columns).toEqual(result.columns);
    expect(display.result.row_count).toBe(2);
    expect(display.config.x_axis).toBe("寄件所属一级网点");
  });

  it("柱状图类别数按组合去重计（单列都没超 50，组合超了）", () => {
    const rows = Array.from({ length: 60 }, (_, i) => [
      `网点${i % 10}`,
      `省${Math.floor(i / 10)}`,
      i,
    ]);
    const v = validateChartConfig(
      makeConfig({
        chart_type: "bar",
        x_axis: "网点",
        x_dims: [{ field: "网点" }, { field: "省份" }],
      }),
      makeResult(["网点", "省份", "货量"], rows),
    );
    expect(v.valid).toBe(false);
    expect(v.errors).toContain("柱状图类别数不能超过 50");
  });

  it("老的单字段配置平滑读回（没有 x_dims 也能用）", () => {
    const legacy = makeConfig({ x_axis: "公斤段", x_values: ["0-1kg"] });
    expect(xDimsOf(legacy)).toEqual([{ field: "公斤段", values: ["0-1kg"] }]);
    expect(xDimSummary(legacy)).toBe("公斤段 · 已选 1 项");

    const restored = normalizeChartConfig({
      chart_type: "bar",
      x_axis: "公斤段",
      x_values: ["0-1kg"],
      y_axis: "货量",
      title: 5,
      sort_by: "nonsense",
    });
    expect(restored.x_dims).toEqual([{ field: "公斤段", values: ["0-1kg"] }]);
    expect(restored.x_axis).toBe("公斤段");
    // 脏字段被丢掉：标题回空串、排序回默认值，不会把老项目读崩
    expect(restored.title).toBe("");
    expect(restored.sort_by).toBeUndefined();
  });

  it("老快照里的散点图回落到折线（散点已下线）", () => {
    const restored = normalizeChartConfig({
      chart_type: "scatter",
      x_axis: "货量",
      y_axis: "现价",
    });
    expect(restored.chart_type).toBe("line");
    expect(restored.x_axis).toBe("货量");
  });

  it("normalizeChartConfig 丢掉脏的 x_dims 与重复字段", () => {
    const restored = normalizeChartConfig({
      x_dims: [{ field: "A" }, { field: "A" }, { field: "  " }, { foo: 1 }, null],
      x_axis: "B",
      x_values: ["x"],
    });
    expect(restored.x_dims).toEqual([{ field: "A", values: undefined }]);
    expect(restored.x_axis).toBe("A");
  });
});

describe("reconcileChartConfig（重算后对齐 X 轴）", () => {
  const result = makeResult(
    ["公斤段", "网点", "货量"],
    [
      ["0-60", "A", 10],
      ["0-60", "B", 20],
    ],
  );

  it("字段还在、取值都在 → 不变（返回 null，不白写 store）", () => {
    const patch = reconcileChartConfig(
      result,
      makeConfig({
        x_dims: [{ field: "网点", values: ["A", "B"] }],
        x_axis: "网点",
        x_values: ["A", "B"],
      }),
    );
    expect(patch).toBeNull();
  });

  it("取值在新结果里不存在 → 丢掉；全丢光 = 这个字段不再上 X 轴", () => {
    // 用户 2026-10-28 第六轮：界面上「勾取值才算上轴」，空取值列表会变成「看不见的空图」
    const patch = reconcileChartConfig(
      result,
      makeConfig({ x_dims: [{ field: "网点", values: ["C"] }], x_axis: "网点" }),
    );
    expect(patch?.x_dims).toEqual([]);
    expect(patch?.x_axis).toBeNull();
  });

  it("部分取值还在 → 只留还在的那些", () => {
    const patch = reconcileChartConfig(
      result,
      makeConfig({ x_dims: [{ field: "网点", values: ["A", "C"] }], x_axis: "网点" }),
    );
    expect(patch?.x_dims).toEqual([{ field: "网点", values: ["A"] }]);
  });

  it("维度字段整个不在结果表里 → 删掉这个维度", () => {
    const patch = reconcileChartConfig(
      result,
      makeConfig({
        x_dims: [{ field: "寄件所属一级网点", values: ["金华婺城"] }, { field: "公斤段" }],
        x_axis: "寄件所属一级网点",
      }),
    );
    expect(patch?.x_dims).toEqual([{ field: "公斤段", values: undefined }]);
    expect(patch?.x_axis).toBe("公斤段");
  });
});

describe("fitAxisLabels（刻度自适应，防重叠）", () => {
  const LONG = [
    "上饶德兴 · 云南省 · 150-300",
    "上饶德兴 · 上海市 · 300-500",
    "东阳一部 · 上海市 · 60-150",
  ];

  it("很宽 → 不旋转、单行、全显示", () => {
    const fit = fitAxisLabels(LONG, 400);
    expect(fit.rotate).toBe(0);
    expect(fit.interval).toBe(0);
    expect(fit.labels[0].includes("\n")).toBe(false);
  });

  it("中等宽度 → 折 3 行、平放，标签横向占位不超过刻度间距", () => {
    const fit = fitAxisLabels(LONG, 95);
    expect(fit.rotate).toBe(0);
    expect(fit.labels[0].split("\n").length).toBe(3);
    const widest = Math.max(...fit.labels.flatMap((label) => label.split("\n").length));
    expect(widest).toBeGreaterThan(0);
  });

  it("挤（斜排会压字）→ 改竖排，仍然全显示、横向占位 ≤ 刻度间距", () => {
    // 用户 2026-10-28 反馈：11 个组合刻度在 600 多 px 的面板里斜排会互相压住
    const fit = fitAxisLabels(LONG, 64);
    expect(fit.rotate).toBe(90);
    expect(fit.interval).toBe(0);
    const chars = Math.max(...fit.labels.flatMap((label) => label.split("\n")).map((row) => row.length));
    expect(labelFootprint(chars, 3, fit.fontSize, fit.rotate)).toBeLessThanOrEqual(64);
  });

  it("极挤 → 隔几个显示一个，外接盒仍塞得下", () => {
    const fit = fitAxisLabels(LONG, 12);
    expect(fit.interval).toBeGreaterThanOrEqual(1);
    const chars = Math.max(...fit.labels.flatMap((label) => label.split("\n")).map((row) => row.length));
    const footprint = labelFootprint(chars, 3, fit.fontSize, fit.rotate);
    expect(footprint).toBeLessThanOrEqual(12 * (fit.interval + 1));
  });
});

describe("契约（前后端共享 fixture）", () => {
  it("prepareChartData 输出与后端 fixture 一致", () => {
    const url = new URL(
      "../../backend/tests/fixtures/chart_contract.json",
      import.meta.url,
    );
    const fixture = JSON.parse(readFileSync(fileURLToPath(url), "utf-8")) as {
      result: ComputeResult;
      cases: { name: string; chart: ChartConfig; expected: unknown }[];
    };
    expect(fixture.cases.length).toBeGreaterThan(0);
    for (const item of fixture.cases) {
      expect(prepareChartData(fixture.result, item.chart)).toEqual(item.expected);
    }
  });
});

