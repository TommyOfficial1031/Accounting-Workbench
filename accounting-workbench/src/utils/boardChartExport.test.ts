import { describe, expect, it } from "vitest";

import {
  BOARD_PALETTE,
  boardMetricValue,
  buildBoardChartJob,
  labelTailOf,
  planBoardChartExport,
  type BoardChartEntry,
  type BoardMetricSpec,
} from "./boardChartExport";

/** 与后端 schemas/board.py::BOARD_BANDS 一致（导出必须保持这个顺序）。 */
const BANDS = ["0-60", "60-150", "150-300", "300-500", "500-800", "800+"];

const DISCOUNT: BoardMetricSpec = { key: "discount", label: "公斤段折扣", kind: "pct" };
const VOLUME: BoardMetricSpec = { key: "volume", label: "货物流向数据", kind: "kg" };

function entry(label: string, volume: number): BoardChartEntry {
  return {
    label,
    volume,
    cells: BANDS.map((_, index) => ({
      vol: volume / BANDS.length,
      price: 100 + index,
      orig: 200 + index,
    })),
  };
}

describe("boardMetricValue（与预览同一套取数口径）", () => {
  it("货量 / 占比 / 单价 / 折扣各按定义算", () => {
    const cell = { vol: 50, price: 30, orig: 60 };
    expect(boardMetricValue(cell, 200, "volume")).toBe(50);
    expect(boardMetricValue(cell, 200, "flow")).toBeCloseTo(0.25, 10);
    expect(boardMetricValue(cell, 200, "price")).toBeCloseTo(0.6, 10);
    expect(boardMetricValue(cell, 200, "discount")).toBeCloseTo(0.5, 10);
  });

  it("分母为 0 时留空（不输出 Infinity / NaN）", () => {
    const cell = { vol: 0, price: 30, orig: 0 };
    expect(boardMetricValue(cell, 0, "flow")).toBeNull();
    expect(boardMetricValue(cell, 0, "price")).toBeNull();
    expect(boardMetricValue(cell, 0, "discount")).toBeNull();
  });
});

describe("buildBoardChartJob（导出与预览一致的三个关键设置）", () => {
  const job = buildBoardChartJob([entry("上饶德兴 · 上海市", 120)], BANDS, [DISCOUNT], "line");

  it("sort_by = custom：公斤段保持自然序，不让后端按字符串重排", () => {
    expect(job.chart.sort_by).toBe("custom");
    expect(job.result.rows.map((row) => row[0])).toEqual(BANDS);
    // 反证：字符串排序会变成 150-300 在 60-150 前面
    expect([...BANDS].sort()).not.toEqual(BANDS);
  });

  it("series_colors 传预览同一套颜色，y_axis 用人话轴标题", () => {
    expect(job.chart.series_colors).toEqual([BOARD_PALETTE[0]]);
    expect(job.chart.y_axis).toBe("比率 / 单价");
    expect(job.chart.x_axis).toBe("公斤段");
    expect(job.chart.title).toBe("网点对比图表");
  });

  it("系列名 = 行标签 · 指标名（与图例逐字一致），列名同构", () => {
    expect(job.result.columns).toEqual(["公斤段", "上饶德兴 · 上海市 · 公斤段折扣"]);
    expect(job.chart.show_fields).toEqual(["上饶德兴 · 上海市 · 公斤段折扣"]);
    expect(job.result.row_count).toBe(BANDS.length);
  });

  it("勾了绝对量指标时纵轴标题换成重量", () => {
    const withVolume = buildBoardChartJob([entry("A", 10)], BANDS, [VOLUME], "bar");
    expect(withVolume.chart.y_axis).toBe("结算重量（kg）");
    expect(withVolume.chart.chart_type).toBe("bar");
  });

  it("多行 × 多指标：每个组合一条线，颜色按 PALETTE 顺序", () => {
    const multi = buildBoardChartJob(
      [entry("A", 10), entry("B", 20)],
      BANDS,
      [DISCOUNT, VOLUME],
      "line",
    );
    expect(multi.chart.show_fields).toEqual([
      "A · 公斤段折扣",
      "A · 货物流向数据",
      "B · 公斤段折扣",
      "B · 货物流向数据",
    ]);
    expect(multi.chart.series_colors).toEqual(BOARD_PALETTE.slice(0, 4));
    expect(multi.result.rows[0]).toHaveLength(1 + 4);
  });
});

describe("labelTailOf", () => {
  it("取行标签最后一段；单段原样返回", () => {
    expect(labelTailOf("上饶德兴 · 上海市")).toBe("上海市");
    expect(labelTailOf("上海市")).toBe("上海市");
    expect(labelTailOf("")).toBe("");
  });
});

describe("planBoardChartExport（用户给的命名例子逐字对上）", () => {
  it("1 张合并大图 + 每个分组一张拆分小图", () => {
    const plan = planBoardChartExport({
      entries: [entry("上饶德兴 · 上海市", 120), entry("上饶德兴 · 浙江省", 80)],
      bands: BANDS,
      metrics: [DISCOUNT],
      chartType: "line",
      nets: ["上饶德兴"],
      dimLabel: "网点 × 省份",
      metricPart: "公斤段折扣",
    });

    expect(plan.folderBase).toBe("网点对比图表 · 上饶德兴 · 网点 × 省份 · 公斤段折扣");
    expect(plan.fileNames).toEqual([
      "网点对比图表 · 上饶德兴 · 网点 × 省份 · 公斤段折扣",
      "网点对比图表 · 上饶德兴 · 上海市 · 公斤段折扣",
      "网点对比图表 · 上饶德兴 · 浙江省 · 公斤段折扣",
    ]);
    expect(plan.splits).toHaveLength(2);
    // 每张小图只画自己这一行（1 条线）
    expect(plan.splits[0].chart.show_fields).toEqual(["上饶德兴 · 上海市 · 公斤段折扣"]);
    expect(plan.splits[1].chart.show_fields).toEqual(["上饶德兴 · 浙江省 · 公斤段折扣"]);
    // 大图 = 两行两条线
    expect(plan.merged.chart.show_fields).toHaveLength(2);
  });

  it("维度只有省份时第三段就是省份本身", () => {
    const plan = planBoardChartExport({
      entries: [entry("上海市", 120)],
      bands: BANDS,
      metrics: [DISCOUNT],
      chartType: "line",
      nets: ["上饶德兴"],
      dimLabel: "省份",
      metricPart: "公斤段折扣",
    });
    expect(plan.fileNames[1]).toBe("网点对比图表 · 上饶德兴 · 上海市 · 公斤段折扣");
  });

  it("拆出来的取值重名时整批退回完整行标签（不覆盖文件）", () => {
    const plan = planBoardChartExport({
      entries: [entry("上饶德兴 · 上海市", 120), entry("东阳一部 · 上海市", 80)],
      bands: BANDS,
      metrics: [DISCOUNT],
      chartType: "line",
      nets: ["上饶德兴", "东阳一部"],
      dimLabel: "网点 × 省份",
      metricPart: "公斤段折扣",
    });
    expect(plan.splitLabels).toEqual(["上饶德兴 · 上海市", "东阳一部 · 上海市"]);
    expect(new Set(plan.fileNames).size).toBe(plan.fileNames.length);
  });

  it("全部网点没勾时第二条是「全部网点」", () => {
    const plan = planBoardChartExport({
      entries: [entry("上海市", 120)],
      bands: BANDS,
      metrics: [DISCOUNT],
      chartType: "line",
      nets: [],
      dimLabel: "省份",
      metricPart: "公斤段折扣",
    });
    expect(plan.folderBase).toBe("网点对比图表 · 全部网点 · 省份 · 公斤段折扣");
  });

  it("29 组 → 1 张合并 + 29 张拆分 = 30 个文件名（第 11 轮 B③ 取消 6 组上限）", () => {
    const entries = Array.from({ length: 29 }, (_, index) =>
      entry(`上饶德兴 · 省${String(index + 1).padStart(2, "0")}`, 1_000 - index * 10),
    );
    const plan = planBoardChartExport({
      entries,
      bands: BANDS,
      metrics: [DISCOUNT],
      chartType: "line",
      nets: ["上饶德兴"],
      dimLabel: "网点 × 省份",
      metricPart: "公斤段折扣",
    });
    expect(plan.fileNames).toHaveLength(30);
    expect(plan.splits).toHaveLength(29);
    // 顺序 = picked 顺序（大图在前，小图按 entries 顺序）
    expect(plan.fileNames[0]).toBe(plan.folderBase);
    expect(plan.fileNames[1]).toBe("网点对比图表 · 上饶德兴 · 省01 · 公斤段折扣");
    expect(plan.fileNames[29]).toBe("网点对比图表 · 上饶德兴 · 省29 · 公斤段折扣");
    // 合并大图也画全部 29 条线（用户 2026-10-29 定稿：合并图不再只画前 6 条）
    expect(plan.merged.chart.show_fields).toHaveLength(29);
    expect(plan.merged.result.rows[0]).toHaveLength(30);
    expect(new Set(plan.fileNames).size).toBe(plan.fileNames.length);
  });
});
