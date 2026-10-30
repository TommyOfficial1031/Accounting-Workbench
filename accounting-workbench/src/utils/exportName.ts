/**
 * 导出文件名工具（一键算看板，用户 2026-10-28 定稿）。
 *
 * 文件名主体 = ``功能 · 网点 · 分组维度 · 指标``，后面接 ``_YYYY-MM-DD HH：MM``
 * 例：``网点对比图表 · 上饶德兴 · 网点 × 省份 · 公斤段折扣_2026-10-28 11：07.xlsx``
 */

/** Windows 文件名不允许的半角字符。 */
const ILLEGAL_CHARS = /[\\/:*?"<>|]/g;

/** 把半角非法字符换成「·」，连续空白压成一个空格（文件名不能有半角冒号，坑 4）。 */
export function safeFileName(text: string): string {
  return text.replace(ILLEGAL_CHARS, "·").replace(/\s+/g, " ").trim();
}

/** 导出用的时间戳：YYYY-MM-DD HH：MM（全角冒号，Windows 合法）。 */
export function stampMinute(date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}：${pad(date.getMinutes())}`;
}

/** 一键算的一个功能块：界面显示名 + 它对应的指标名（拼文件名用）。 */
export interface BoardFeatureName {
  label: string;
  metric: string;
}

export interface BoardExportNameInput {
  /** current = 当前勾选的功能块；all = 全部功能 */
  scope: "current" | "all";
  /** 这次导出的功能块（顺序由调用方排好；scope = "all" 时只用来取指标名） */
  features: BoardFeatureName[];
  /** 当前勾选的网点（空 = 全部网点） */
  nets: string[];
  /** 分组维度，如「网点 × 省份」 */
  dimLabel: string;
}

/**
 * 一键算导出文件名主体（不含时间戳与扩展名）。
 *
 * - 功能：`current` 用勾选的功能名（多个用「、」连），`all` 固定「全部功能」；
 * - 网点：一个都没勾 = 「全部网点」；超过 3 个收敛成「N 个网点」，免得文件名爆长；
 * - 指标：各功能对应的指标名（对比图表 = 勾选的对比指标）。
 */
export function boardExportBaseName(input: BoardExportNameInput): string {
  const featurePart =
    input.scope === "all"
      ? "全部功能"
      : input.features.map((item) => item.label).join("、");
  const metricPart = input.features
    .map((item) => item.metric)
    .filter((text) => text.trim() !== "")
    .join("、");

  return joinParts([featurePart, netPartOf(input.nets), input.dimLabel, metricPart]);
}

/** 网点那一段：空 = 全部网点，超过 3 个收敛成「N 个网点」。 */
export function netPartOf(nets: string[]): string {
  if (nets.length === 0) return "全部网点";
  if (nets.length > 3) return `${nets.length} 个网点`;
  return nets.join("、");
}

export interface BoardSplitNameInput {
  /** 功能名，图表导出固定「网点对比图表」 */
  feature: string;
  /** 顶部勾选的网点（空 = 全部网点） */
  nets: string[];
  /** 该分组行拆出来的取值（row.label 的最后一段，如「上海市」） */
  splitValue: string;
  /** 勾选的对比指标名（多个用「、」连） */
  metric: string;
}

/**
 * 拆分小图的文件名主体（不含时间戳与扩展名）：
 *
 * ``功能 · 当前所选网点 · 拆分出的分组维度取值 · 指标``
 * 例：``网点对比图表 · 上饶德兴 · 上海市 · 公斤段折扣``
 */
export function boardSplitBaseName(input: BoardSplitNameInput): string {
  return joinParts([input.feature, netPartOf(input.nets), input.splitValue, input.metric]);
}

/** 用「 · 」拼文件名，逐段做非法字符兜底并丢掉空段。 */
function joinParts(parts: string[]): string {
  return parts
    .map((part) => safeFileName(part))
    .filter((part) => part !== "")
    .join(" · ");
}
