/**
 * 饼图标签布局（预览与导出同一套几何，2026-10-30 第 15 轮）。
 *
 * 用户反馈：「线条全挤在一起了，搞散开来清楚一点」——
 * ECharts 自带的 `avoidLabelOverlap` 只把互相压住的标签挪开一点点，小扇区的标签仍然挤在饼边，
 * 辅助线也全部聚在顶部。这里改成「左右两列 + 同列按行高错开」：
 *
 * - 按扇形中点角度分左右两列，标签列固定离饼边 `labelPad + LABEL_STUB`；
 * - 同一列从上到下按标签真实行高排开（间距 `gap`，放不下时按比例压缩）；
 * - 每个标签的辅助线是「扇形边缘 → 文字列前 stub 处的折点 → 文字内侧」三点折线，
 *   与导出端 `chart/builder.py::_draw_pie_labels` 同一形状。
 *
 * 纯函数，不碰 DOM / ECharts 实例，便于单测；ECharts 里用 `labelLayout` 回调按 dataIndex 取结果。
 */
import { wrapCategoryLabel } from "./chartData";

/** 标签最多折几行（饼图列宽有限，超过用 … 收尾）。 */
const PIE_LABEL_MAX_LINES = 2;
/** 同列相邻标签的最小间距（px）。 */
const DEFAULT_GAP = 10;
/** 文字列离辅助线折点的水平留白（px）。 */
const DEFAULT_PAD = 10;
/** 辅助线从文字内侧往回折的长度（px）。 */
const LABEL_STUB = 12;
/** 辅助线末端与文字之间的空隙（px）。 */
const LABEL_TAIL = 3;
/** 标签列离画布上下边缘的最小留白（px）。 */
const CANVAS_MARGIN = 6;
/** 每行最少/最多几个字（列太窄时别折成单字，太宽时别让标签横跨半张画布）。 */
const MIN_CHARS = 6;
const MAX_CHARS = 20;

export interface PieLabelLayoutInput {
  /** 分类名（原始，未折行） */
  categories: string[];
  /** 与 categories 对齐的数值（非正数/非数字不画标签） */
  values: Array<number | null>;
  /** 画布宽（px） */
  width: number;
  /** 画布高（px） */
  height: number;
  fontSize: number;
  lineHeight: number;
  /** 饼半径占「画布短边一半」的比例（与 ECharts 的 radius 百分比同一口径） */
  radiusPct: number;
  /** 圆心位置（画布宽高的 0~1 比例） */
  center: [number, number];
  gap?: number;
  labelPad?: number;
}

export interface PieLabelPlacement {
  /** 文字锚点 x（左列右对齐、右列左对齐） */
  x: number;
  /** 文字锚点 y（垂直居中） */
  y: number;
  align: "left" | "right";
  /** 辅助线三点：扇形边缘 → 折点 → 文字内侧 */
  points: number[][];
}

export interface PieLabelLayoutResult {
  /** 与 values 对齐的标签文字（组合名折行 + 百分比）；无值时是「—」 */
  texts: string[];
  /** 与 values 对齐的落点；无值时是 null */
  placements: Array<PieLabelPlacement | null>;
}

/** 百分比文本：最多两位小数、不留尾零（与 ECharts `{d}%` 一致）。 */
export function piePercentText(share: number): string {
  const value = share * 100;
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(2).replace(/\.?0+$/, "")}%`;
}

/** 数值是否参与饼图（与 prepareChartData 的饼图过滤一致：只留正数）。 */
function isPositive(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * 计算饼图每个扇区的标签文字与落点。
 *
 * 画布宽高为 0（还没量到尺寸）或没有正数值时返回全 null，调用方按 ECharts 默认布局兜底。
 */
export function layoutPieLabels(input: PieLabelLayoutInput): PieLabelLayoutResult {
  const count = input.values.length;
  const texts = new Array<string>(count).fill("—");
  const placements = new Array<PieLabelPlacement | null>(count).fill(null);
  if (count === 0 || input.width <= 0 || input.height <= 0 || input.fontSize <= 0) {
    return { texts, placements };
  }

  const values = input.values.map((value) => (isPositive(value) ? value : 0));
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return { texts, placements };

  const radius = (input.radiusPct * Math.min(input.width, input.height)) / 2;
  const cx = input.width * input.center[0];
  const cy = input.height * input.center[1];
  const gap = input.gap ?? DEFAULT_GAP;
  const labelPad = input.labelPad ?? DEFAULT_PAD;
  const lineHeight = Math.max(1, input.lineHeight);

  // 文字列可用宽度 → 每行几个字（CJK 按 1 em 估，保守取整）
  const available = input.width / 2 - radius - LABEL_STUB - labelPad - 6;
  const chars = Math.max(
    MIN_CHARS,
    Math.min(MAX_CHARS, Math.floor(available / input.fontSize)),
  );

  // 扇形中点角度（ECharts：12 点钟起顺时针）与每侧理想 y
  const mids: number[] = [];
  let cursor = 90;
  for (const value of values) {
    const sweep = (value / total) * 360;
    mids.push(cursor - sweep / 2);
    cursor -= sweep;
  }

  const sides = mids.map((mid) => (Math.cos((mid * Math.PI) / 180) >= 0 ? 1 : -1));
  const heights = values.map((value, index) => {
    const name = wrapCategoryLabel(input.categories[index] ?? "", chars, PIE_LABEL_MAX_LINES);
    texts[index] = `${name}\n${piePercentText(value / total)}`;
    return texts[index].split("\n").length * lineHeight;
  });
  const idealY = mids.map(
    (mid) => cy - Math.sin((mid * Math.PI) / 180) * radius * 1.06,
  );

  // 同一列从上到下错开；装不下时压缩间距（轻微重叠好过跑出画布）
  const positions = new Array<number>(count).fill(0);
  for (const side of [1, -1]) {
    const indexes = values
      .map((_, index) => index)
      .filter((index) => values[index] > 0 && sides[index] === side)
      .sort((left, right) => idealY[left] - idealY[right]);
    if (indexes.length === 0) continue;

    const heightsSum = indexes.reduce((sum, index) => sum + heights[index], 0);
    const span = input.height - CANVAS_MARGIN * 2;
    let slotGap = gap;
    if (indexes.length > 1 && heightsSum + slotGap * (indexes.length - 1) > span) {
      slotGap = (span - heightsSum) / (indexes.length - 1);
    }

    let previous = -1;
    for (const index of indexes) {
      let y = idealY[index];
      if (previous >= 0) {
        y = Math.max(
          y,
          positions[previous] + (heights[previous] + heights[index]) / 2 + slotGap,
        );
      }
      positions[index] = y;
      previous = index;
    }

    // 底部越界 → 整体上移；上移后顶部越界 → 再压回来
    const last = indexes[indexes.length - 1];
    const low = input.height - CANVAS_MARGIN - heights[last] / 2;
    if (positions[last] > low) {
      const shift = positions[last] - low;
      for (const index of indexes) positions[index] -= shift;
    }
    const first = indexes[0];
    const high = CANVAS_MARGIN + heights[first] / 2;
    if (positions[first] < high) {
      const shift = high - positions[first];
      for (const index of indexes) positions[index] += shift;
    }
  }

  for (let index = 0; index < count; index += 1) {
    if (values[index] <= 0) continue;
    const side = sides[index];
    const mid = (mids[index] * Math.PI) / 180;
    const cosine = Math.cos(mid);
    const sine = Math.sin(mid);
    const x = cx + side * (radius + LABEL_STUB + labelPad);
    const y = positions[index];
    placements[index] = {
      x,
      y,
      align: side > 0 ? "left" : "right",
      points: [
        [cx + cosine * radius, cy - sine * radius],
        [x - side * LABEL_STUB, y],
        [x - side * LABEL_TAIL, y],
      ],
    };
  }

  return { texts, placements };
}
