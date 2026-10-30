/**
 * 占比口径的单测（第 13 轮）：界面与导出必须同一个分母。
 *
 * 用户 2026-10-29 给的实例：福建省 0-60 = 191 kg，全表累计 140,940 kg
 * → 界面 0.1%，导出原来写 0.1567（÷ 该行 1,218 kg）→ 判为「数值不一致」。
 */
import { describe, expect, it } from "vitest";

import { boardSharePct, boardTotalVolume } from "./boardSummary";

describe("boardSharePct", () => {
  it("按全表累计货量算，保留 1 位小数（与界面 0.1% 一致）", () => {
    const total = boardTotalVolume({ sum_vol: 140_940 });
    expect(total).toBe(140_940);
    expect(boardSharePct(191, total)).toBe(0.1);
    expect(boardSharePct(556, total)).toBe(0.4);
    expect(boardSharePct(471, total)).toBe(0.3);
  });

  it("不再是「÷ 该行货量」：191 ÷ 1218 = 15.7% 的老口径必须对不上", () => {
    const total = boardTotalVolume({ sum_vol: 140_940 });
    expect(boardSharePct(191, total)).not.toBe(Number(((191 / 1218) * 100).toFixed(6)));
    // 行内份额也还能单独算（只是不再用于「占比」列）
    expect(Number(((191 / 1218) * 100).toFixed(1))).toBe(15.7);
  });

  it("货量为 0 / 合计为 0 时返回 null（界面显示「—」）", () => {
    expect(boardSharePct(0, 140_940)).toBeNull();
    expect(boardSharePct(191, 0)).toBeNull();
    expect(boardSharePct(Number.NaN, 140_940)).toBeNull();
    expect(boardTotalVolume(null)).toBe(0);
    expect(boardTotalVolume({ sum_vol: 0 })).toBe(0);
  });
});
