import { describe, expect, it } from "vitest";

import { formatChartValue, formatCount, formatNumber } from "./numberFormat";

describe("formatNumber（用户 2026-10-29 定稿：千以上用 1,000，不用「万」）", () => {
  it("一万写成 10,000，不再出现「万」", () => {
    expect(formatNumber(10000)).toBe("10,000");
    expect(formatNumber(10000)).not.toContain("万");
    expect(formatNumber(1234567)).toBe("1,234,567");
  });

  it("千以下原样保留，比率不丢精度", () => {
    expect(formatNumber(999)).toBe("999");
    expect(formatNumber(0.6442)).toBe("0.6442");
    expect(formatNumber(-0.5)).toBe("-0.5");
    expect(formatNumber(0)).toBe("0");
  });

  it("带小数的货量：千分位 + 保留小数", () => {
    expect(formatNumber(4558.82)).toBe("4,558.82");
    expect(formatNumber(-12345.678, 2)).toBe("-12,345.68");
  });

  it("非有限值显示破折号", () => {
    expect(formatNumber(Number.NaN)).toBe("—");
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe("—");
    expect(formatCount(Number.NaN)).toBe("—");
  });
});

describe("formatCount", () => {
  it("计数不显示小数", () => {
    expect(formatCount(100000)).toBe("100,000");
    expect(formatCount(8558.6)).toBe("8,559");
  });
});

describe("formatChartValue（ECharts 轴刻度 / tooltip）", () => {
  it("数字加千分位，字符串数字同样处理", () => {
    expect(formatChartValue(10000)).toBe("10,000");
    expect(formatChartValue("12345")).toBe("12,345");
  });

  it("数组参数（多值 tooltip 的 [x, y]）逐项格式化", () => {
    expect(formatChartValue([12345, 6789])).toBe("12,345 / 6,789");
  });

  it("分类轴刻度（非数字）原样返回，不会被弄乱", () => {
    expect(formatChartValue("0-60")).toBe("0-60");
    expect(formatChartValue("上海市")).toBe("上海市");
    expect(formatChartValue("")).toBe("");
  });

  it("空值显示破折号", () => {
    expect(formatChartValue(null)).toBe("—");
    expect(formatChartValue(undefined)).toBe("—");
  });
});
