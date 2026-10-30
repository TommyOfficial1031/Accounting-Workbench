import { describe, expect, it } from "vitest";

import {
  boardExportBaseName,
  boardSplitBaseName,
  safeFileName,
  stampMinute,
} from "./exportName";

describe("stampMinute", () => {
  it("YYYY-MM-DD HH：MM，冒号用全角（Windows 文件名不能带半角冒号）", () => {
    expect(stampMinute(new Date(2026, 9, 28, 11, 7))).toBe("2026-10-28 11：07");
    expect(stampMinute(new Date(2026, 0, 5, 9, 3))).toBe("2026-01-05 09：03");
  });
});

describe("safeFileName", () => {
  it("半角非法字符换成「·」，空白压成一个空格", () => {
    expect(safeFileName("比率 / 单价")).toBe("比率 · 单价");
    expect(safeFileName("a:b*c?d")).toBe("a·b·c·d");
    expect(safeFileName("  多   空格  ")).toBe("多 空格");
  });
});

describe("boardExportBaseName（用户 2026-10-28 定稿的文件名格式）", () => {
  it("对比图表 + 单个网点：现场例子逐字对上", () => {
    const base = boardExportBaseName({
      scope: "current",
      features: [{ label: "网点对比图表", metric: "公斤段折扣" }],
      nets: ["上饶德兴"],
      dimLabel: "网点 × 省份",
    });
    expect(base).toBe("网点对比图表 · 上饶德兴 · 网点 × 省份 · 公斤段折扣");
    expect(`${base}_${stampMinute(new Date(2026, 9, 28, 11, 7))}`).toBe(
      "网点对比图表 · 上饶德兴 · 网点 × 省份 · 公斤段折扣_2026-10-28 11：07",
    );
  });

  it("多个功能块：功能与指标都用「、」连起来", () => {
    const base = boardExportBaseName({
      scope: "current",
      features: [
        { label: "货物流向", metric: "货量" },
        { label: "公斤段折扣", metric: "折扣" },
        { label: "公斤段单价", metric: "单价" },
      ],
      nets: [],
      dimLabel: "省份",
    });
    expect(base).toBe("货物流向、公斤段折扣、公斤段单价 · 全部网点 · 省份 · 货量、折扣、单价");
  });

  it("全部功能：功能位固定「全部功能」", () => {
    const base = boardExportBaseName({
      scope: "all",
      features: [
        { label: "货物流向", metric: "货量" },
        { label: "公斤段折扣", metric: "折扣" },
        { label: "公斤段单价", metric: "单价" },
        { label: "网点对比图表", metric: "公斤段折扣" },
      ],
      nets: ["上饶德兴", "东阳一部"],
      dimLabel: "网点 × 省份",
    });
    expect(base).toBe(
      "全部功能 · 上饶德兴、东阳一部 · 网点 × 省份 · 货量、折扣、单价、公斤段折扣",
    );
  });

  it("网点勾太多时收敛成「N 个网点」", () => {
    const base = boardExportBaseName({
      scope: "current",
      features: [{ label: "网点对比图表", metric: "公斤段折扣" }],
      nets: ["A", "B", "C", "D"],
      dimLabel: "网点",
    });
    expect(base).toBe("网点对比图表 · 4 个网点 · 网点 · 公斤段折扣");
  });

  it("指标为空时不留下多余的分隔符", () => {
    const base = boardExportBaseName({
      scope: "current",
      features: [{ label: "网点对比图表", metric: "" }],
      nets: [],
      dimLabel: "",
    });
    expect(base).toBe("网点对比图表 · 全部网点");
  });
});

describe("boardSplitBaseName（拆分小图命名，用户 2026-10-29 的例子）", () => {
  it("功能 · 网点 · 拆分取值 · 指标：例子逐字对上", () => {
    const base = boardSplitBaseName({
      feature: "网点对比图表",
      nets: ["上饶德兴"],
      splitValue: "上海市",
      metric: "公斤段折扣",
    });
    expect(base).toBe("网点对比图表 · 上饶德兴 · 上海市 · 公斤段折扣");
    expect(`${base}_${stampMinute(new Date(2026, 9, 28, 11, 7))}`).toBe(
      "网点对比图表 · 上饶德兴 · 上海市 · 公斤段折扣_2026-10-28 11：07",
    );
  });

  it("多个网点收敛成「N 个网点」，多指标用「、」连", () => {
    expect(
      boardSplitBaseName({
        feature: "网点对比图表",
        nets: ["A", "B", "C", "D"],
        splitValue: "浙江省",
        metric: "公斤段折扣、公斤段单价",
      }),
    ).toBe("网点对比图表 · 4 个网点 · 浙江省 · 公斤段折扣、公斤段单价");
  });
});
