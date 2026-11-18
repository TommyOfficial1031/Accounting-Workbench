import { describe, expect, it } from "vitest";

import { layoutPieLabels, piePercentText } from "./pieLabelLayout";

const ANALYSIS = [
  ["金华婺城 · 陕西省", 0.27],
  ["希音义乌揽 · 广东省", 0.89],
  ["金华婺城 · 浙江省", 3.01],
  ["希音义乌揽 · 浙江省", 3.11],
  ["金华婺城 · 广东省", 0.5],
  ["义乌三部 · 广东省", 3.5],
  ["义乌三部 · 浙江省", 16.63],
  ["义乌三部 · 陕西省", 13.78],
  ["义乌北苑工业区 · 广东省", 26.26],
  ["义乌北苑工业区 · 浙江省", 0.55],
  ["义乌北苑工业区 · 陕西省", 8.2],
  ["义乌九部 · 广东省", 13.23],
  ["义乌九部 · 浙江省", 7.88],
  ["义乌九部 · 陕西省", 2.19],
] as const;

function analysisLayout(width = 900, height = 600) {
  return layoutPieLabels({
    categories: ANALYSIS.map(([name]) => name),
    values: ANALYSIS.map(([, value]) => value),
    width,
    height,
    fontSize: 10,
    lineHeight: 13,
    radiusPct: 0.58,
    center: [0.5, 0.52],
  });
}

describe("piePercentText", () => {
  it("与 ECharts 的 {d}% 同格式（最多两位、不留尾零）", () => {
    expect(piePercentText(0.028)).toBe("2.8%");
    expect(piePercentText(0.0004)).toBe("0.04%");
    expect(piePercentText(0.0622)).toBe("6.22%");
    expect(piePercentText(1)).toBe("100%");
    expect(piePercentText(Number.NaN)).toBe("—");
  });
});

describe("layoutPieLabels", () => {
  it("每个扇区都有文字与落点，文字带百分比", () => {
    const layout = analysisLayout();
    expect(layout.texts).toHaveLength(ANALYSIS.length);
    expect(layout.placements).toHaveLength(ANALYSIS.length);
    for (const [index, [name]] of ANALYSIS.entries()) {
      expect(layout.texts[index]).toContain("%");
      expect(layout.texts[index]).toContain(name.slice(0, 2));
      expect(layout.placements[index]).not.toBeNull();
    }
  });

  it("同一列的标签按行高错开、不重叠", () => {
    const layout = analysisLayout();
    const lineHeight = 13;
    const columns = new Map<string, Array<{ y: number; height: number }>>();
    layout.placements.forEach((placement, index) => {
      if (placement === null) return;
      const lines = (layout.texts[index] ?? "").split("\n").length;
      const list = columns.get(placement.align) ?? [];
      list.push({ y: placement.y, height: lines * lineHeight });
      columns.set(placement.align, list);
    });
    expect(columns.size).toBe(2);
    for (const list of columns.values()) {
      list.sort((left, right) => left.y - right.y);
      for (let index = 1; index < list.length; index += 1) {
        const upper = list[index - 1];
        const lower = list[index];
        const gap = lower.y - upper.y - (upper.height + lower.height) / 2;
        expect(gap).toBeGreaterThan(0);
      }
    }
  });

  it("标签落点不跑出画布", () => {
    const layout = analysisLayout();
    for (const placement of layout.placements) {
      if (placement === null) continue;
      expect(placement.y).toBeGreaterThan(0);
      expect(placement.y).toBeLessThan(600);
    }
  });

  it("辅助线是三点折线：从扇形边缘出来、到文字内侧", () => {
    const layout = analysisLayout();
    const placement = layout.placements[0];
    expect(placement).not.toBeNull();
    if (placement === null) return;
    expect(placement.points).toHaveLength(3);
    const [edge, elbow, tail] = placement.points;
    // 折点与文字保持同一高度，末端更靠近文字
    expect(elbow[1]).toBeCloseTo(tail[1], 6);
    expect(Math.abs(elbow[0] - tail[0])).toBeLessThanOrEqual(12);
    // 边缘点在饼半径上（半径 = 0.58 × 600 / 2 = 174）
    const distance = Math.hypot(edge[0] - 450, edge[1] - 312);
    expect(distance).toBeCloseTo(174, 3);
  });

  it("画布宽高为 0（还没量到尺寸）时全部为 null", () => {
    const layout = analysisLayout(0, 0);
    expect(layout.placements.every((item) => item === null)).toBe(true);
  });

  it("非正数/非数字不画标签", () => {
    const layout = layoutPieLabels({
      categories: ["A", "B", "C"],
      values: [10, 0, null],
      width: 600,
      height: 400,
      fontSize: 10,
      lineHeight: 13,
      radiusPct: 0.58,
      center: [0.5, 0.52],
    });
    expect(layout.placements[0]).not.toBeNull();
    expect(layout.placements[1]).toBeNull();
    expect(layout.placements[2]).toBeNull();
  });

  it("窄画布把长分类名折成两行（不无限撑宽）", () => {
    const layout = layoutPieLabels({
      categories: ["义乌北苑工业区 · 广东省 · 150-300"],
      values: [10],
      width: 480,
      height: 360,
      fontSize: 10,
      lineHeight: 13,
      radiusPct: 0.58,
      center: [0.5, 0.52],
    });
    const lines = (layout.texts[0] ?? "").split("\n");
    expect(lines.length).toBeLessThanOrEqual(3); // 最多 2 行组合名 + 1 行百分比
  });
});
