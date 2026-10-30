/**
 * 一键算「汇总 / 货物流向」的占比口径（第 13 轮）。
 *
 * 用户 2026-10-29 反馈「导出的表格有部分数值不一致」：界面上的占比是
 * **该单元格 ÷ 全表累计货量**（191 → 0.1%），而导出的长表原来用的是 **÷ 该行货量**
 * （191 → 0.1567），同一个格子差出几十倍。
 *
 * 现在只留这一个入口：界面与导出都调它，分母固定为全表合计，输出 1 位小数的百分数，
 * 与界面 ``pct()`` 的 ``0.1%`` 逐字对得上（导出单元格写 ``0.1``，列名标「占比（%）」）。
 */
import type { BoardResult } from "../types/api";

/** 一次计算里「全表累计货量」，供占比共用（0 / 非法值时返回 0，调用方按「无数据」处理）。 */
export function boardTotalVolume(board: Pick<BoardResult, "sum_vol"> | null): number {
  const total = board?.sum_vol ?? 0;
  return Number.isFinite(total) && total > 0 ? total : 0;
}

/**
 * 单元格占全表累计货量的百分比（1 位小数）；货量为 0 或合计为 0 时返回 `null`（显示「—」）。
 *
 * @param volume 该单元格的结算重量（kg）
 * @param total 全表累计货量（`boardTotalVolume(board)`）
 */
export function boardSharePct(volume: number, total: number): number | null {
  if (!Number.isFinite(volume) || volume <= 0) return null;
  if (!Number.isFinite(total) || total <= 0) return null;
  return Number(((volume / total) * 100).toFixed(1));
}
