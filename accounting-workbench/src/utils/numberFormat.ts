/**
 * 数值显示格式（用户 2026-10-29 定稿）。
 *
 * **千以上的数值一律写成千分位形式（10,000），不再用「万」缩写**；
 * 千以下保持原样（比率 0.6442 还是 0.6442）。
 *
 * 统一入口，表格 / 图表刻度 / 图表提示 / 结果表都走这里，避免各处各写一套
 * （之前的 `cmpShort()` 会把 10000 写成「1.0万」）。
 */

/** 数值 → 千分位文本；`maxFractionDigits` 默认 6，够放下比率又不会截断大数。 */
export function formatNumber(value: number, maxFractionDigits = 6): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("zh-CN", { maximumFractionDigits: maxFractionDigits });
}

/** 计数类（行数、货量、票数）：千分位 + 不显示小数。 */
export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

/**
 * ECharts 的轴刻度 / tooltip 回调：只加千分位，不改精度。
 *
 * ECharts 会把回调参数递成 number / string / array（如多值 tooltip 的 [x, y]），
 * 这里一律按 `unknown` 收，非数字原样返回（分类轴刻度不能被动到）。
 */
export function formatChartValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => formatChartValue(item)).join(" / ");
  }
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    const parsed = Number(trimmed);
    if (trimmed !== "" && Number.isFinite(parsed)) return formatNumber(parsed);
    return value;
  }
  if (value === null || value === undefined) return "—";
  return String(value);
}
