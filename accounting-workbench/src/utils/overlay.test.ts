import { describe, expect, it } from "vitest";

import { placeOverlay } from "./overlay";

/** 没有 DOM 时 layoutViewport() 返回 1200×800、effectiveZoom() 返回 1 —— 数学部分可以直接测。 */
describe("placeOverlay（浮层夹取 + html zoom 换算）", () => {
  it("锚点靠窗口底部 → 往上翻，底边不越界", () => {
    const placement = placeOverlay({
      left: 100,
      belowY: 760,
      aboveY: 730,
      width: 274,
      designMax: 380,
    });
    // 下面只剩 800 - 760 - 12 = 28 → 翻到上面，底边 = 730（aboveY），所以 top = 730 - maxHeight
    expect(placement.top).toBeLessThan(760);
    expect(placement.top + placement.maxHeight).toBeLessThanOrEqual(800 - 12 + 0.001);
  });

  it("锚点在中间 → 放下面，且不超过设计上限", () => {
    const placement = placeOverlay({
      left: 100,
      belowY: 200,
      aboveY: 170,
      width: 274,
      designMax: 380,
    });
    expect(placement.top).toBe(200);
    expect(placement.maxHeight).toBe(380);
  });

  it("锚点靠右 → 左边界夹回窗口内", () => {
    const placement = placeOverlay({
      left: 1180,
      belowY: 100,
      aboveY: 70,
      width: 274,
      designMax: 380,
    });
    expect(placement.left).toBe(1200 - 274 - 12);
  });

  it("上下都窄时按整窗高度收，不会算出负高度", () => {
    // 视口 800：belowY 400 → 下方 388；aboveY 380 → 上方 368 → 选下方 388（< designMax? 不）
    const placement = placeOverlay({
      left: 10,
      belowY: 400,
      aboveY: 380,
      width: 274,
      designMax: 600,
    });
    expect(placement.maxHeight).toBeGreaterThan(0);
    expect(placement.maxHeight).toBeLessThanOrEqual(600);
    expect(placement.top + placement.maxHeight).toBeLessThanOrEqual(800 - 12 + 0.001);
  });
});
