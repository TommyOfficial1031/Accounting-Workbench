/**
 * 浮层（下拉弹层）定位工具：把「视觉坐标」换算成 inline style 的 CSS px，并夹进视口。
 *
 * 为什么需要它（用户 2026-10-28 反馈「指标区下拉底部按钮还是看不到」）：
 * 设置页的字号缩放是 `html { zoom }`，它会让三套坐标混在一起：
 * - `getBoundingClientRect()` 量到的是「视觉坐标」（已经乘过 zoom）；
 * - `position: fixed` 元素的 inline `top / left / max-height` 是「布局坐标」，渲染时再乘 zoom；
 * - `window.innerHeight` 在不同 Chromium 版本上既可能是布局坐标，也可能跟着 zoom 走。
 *
 * 直接把 rect 的数值塞进 `top`，弹层就会往下多跑 zoom 倍的距离 —— 越靠页面底部越明显，
 * 最后 footer 被窗口切掉。这里统一：输入一律是视觉坐标，内部量一次有效缩放，
 * 输出一律是「可以直接写进 style 的 CSS px」。
 */

/** 视口尺寸（视觉坐标）：插一块铺满视口的 fixed 探针来量，绕开 window.innerWidth/innerHeight。 */
export function layoutViewport(): { width: number; height: number } {
  if (typeof document === "undefined") return { width: 1200, height: 800 };
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;visibility:hidden";
  document.body.appendChild(probe);
  const rect = probe.getBoundingClientRect();
  probe.remove();
  return { width: rect.width, height: rect.height };
}

/** `html { zoom }` 的有效倍率（fixed 元素量 100px 得到多少视觉 px）。 */
export function effectiveZoom(): number {
  if (typeof document === "undefined") return 1;
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;left:0;top:0;width:100px;height:100px;pointer-events:none;visibility:hidden";
  document.body.appendChild(probe);
  const rect = probe.getBoundingClientRect();
  probe.remove();
  return rect.height > 0 ? rect.height / 100 : 1;
}

export interface OverlayPlacement {
  /** 可以直接写进 style 的 CSS px。 */
  left: number;
  top: number;
  maxHeight: number;
}

interface OverlayOptions {
  /** 锚点左边（视觉坐标） */
  left: number;
  /** 「放在锚点下方」时弹层的 top（视觉坐标，调用方自己加间距） */
  belowY: number;
  /** 「翻到上方」时弹层底边的位置（视觉坐标，一般是锚点 top 减间距） */
  aboveY: number;
  /** 弹层宽度（CSS px，取自样式表里的值） */
  width: number;
  /** 设计上限高度（视觉 px） */
  designMax: number;
  /** 下方少于这么多就考虑往上翻（视觉 px） */
  minBelow?: number;
  /** 最小高度（视觉 px），再挤也给这么多，内部列表自己滚 */
  minHeight?: number;
  /** 离窗口边缘的间距（视觉 px） */
  margin?: number;
}

/**
 * 算一个「不越界」的浮层位置。
 *
 * 返回的 `left / top / maxHeight` 已经除过 zoom，可以直接塞进 inline style；
 * 这样弹层在窗口里的视觉位置就等于调用方想要的视觉位置，footer 一定在视口内。
 */
export function placeOverlay(options: OverlayOptions): OverlayPlacement {
  const margin = options.margin ?? 12;
  const minBelow = options.minBelow ?? 240;
  const minHeight = options.minHeight ?? 120;
  const viewport = layoutViewport();
  const zoom = effectiveZoom() || 1;

  const spaceBelow = viewport.height - options.belowY - margin;
  const spaceAbove = options.aboveY - margin;
  const useAbove = spaceBelow < minBelow && spaceAbove > spaceBelow;
  const room = Math.max(0, useAbove ? spaceAbove : spaceBelow);
  // 上/下都放不下时，按整窗高度收（再小就内部滚）
  const maxHeight = Math.min(
    options.designMax,
    Math.max(room >= minHeight ? room : viewport.height - margin * 2, minHeight),
  );

  const widthVisual = options.width * zoom;
  const leftVisual = Math.min(
    Math.max(margin, options.left),
    Math.max(margin, viewport.width - widthVisual - margin),
  );
  const rawTop = useAbove ? options.aboveY - maxHeight : options.belowY;
  const topVisual = Math.min(
    Math.max(margin, rawTop),
    Math.max(margin, viewport.height - maxHeight - margin),
  );

  return {
    left: leftVisual / zoom,
    top: topVisual / zoom,
    maxHeight: maxHeight / zoom,
  };
}
