/**
 * 分析 store 的「时间范围自动识别并预填」（第 13 轮）。
 *
 * 用户 2026-10-29 反馈：盈亏平衡页识别并填上了时间范围，一键算页日期是空的、
 * 分析页给的是 1970/01/01 ~ 2999/12/31（全量兜底）。
 * 根因：`ensureDetectedRange` 命中缓存就直接 return，后进的两个页面永远等不到预填。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api/import", () => ({
  fetchTimeRange: vi.fn(),
}));

import { fetchTimeRange } from "../api/import";
import { useAnalysisStore } from "./analysisStore";

const mocked = vi.mocked(fetchTimeRange);

const UNBOUNDED = { start: "1970-01-01", end: "2999-12-31", field: "账单时间" };
const DETECTED = { field: "账单时间", start: "2026-09-14", end: "2026-09-20" };

function seed(state: Partial<ReturnType<typeof useAnalysisStore.getState>>): void {
  useAnalysisStore.setState(state);
}

beforeEach(() => {
  mocked.mockReset();
  seed({
    timeRange: { ...UNBOUNDED },
    timePreset: "自定义",
    detectedRange: null,
    detectedFor: null,
  });
});

describe("ensureDetectedRange", () => {
  it("首次识别成功 → 直接预填（全量兜底 → 识别出的范围）", async () => {
    mocked.mockResolvedValue({
      field: "账单时间",
      start: DETECTED.start,
      end: DETECTED.end,
      rows: 100,
    });

    await useAnalysisStore.getState().ensureDetectedRange("ds-1");

    expect(mocked).toHaveBeenCalledTimes(1);
    expect(useAnalysisStore.getState().timeRange).toEqual(DETECTED);
    expect(useAnalysisStore.getState().detectedFor).toBe("ds-1");
  });

  it("缓存命中后再进别的页面仍然要预填（第 13 轮修复点）", async () => {
    mocked.mockResolvedValue({
      field: "账单时间",
      start: DETECTED.start,
      end: DETECTED.end,
      rows: 100,
    });

    // ① 先进盈亏平衡页：识别成功并预填
    await useAnalysisStore.getState().ensureDetectedRange("ds-1");
    expect(useAnalysisStore.getState().timeRange).toEqual(DETECTED);

    // ② 再进一键算 / 分析页：这几个页面的初始范围又回到全量兜底（openFree / 页面重挂）
    seed({ timeRange: { ...UNBOUNDED }, timePreset: "自定义" });

    // ③ 第二次调用命中缓存 —— 必须把缓存里的范围再填一次，且不再打接口
    await useAnalysisStore.getState().ensureDetectedRange("ds-1");

    expect(mocked).toHaveBeenCalledTimes(1);
    expect(useAnalysisStore.getState().timeRange).toEqual(DETECTED);
  });

  it("用户已经改过日期 → 不覆盖", async () => {
    const chosen = { start: "2026-09-01", end: "2026-09-02", field: "账单时间" };
    seed({
      timeRange: { ...chosen },
      timePreset: "自定义",
      detectedRange: DETECTED,
      detectedFor: "ds-1",
    });

    await useAnalysisStore.getState().ensureDetectedRange("ds-1");

    expect(mocked).not.toHaveBeenCalled();
    expect(useAnalysisStore.getState().timeRange).toEqual(chosen);
  });

  it("识别不出时间列 → 保持全量兜底，不再重复打接口", async () => {
    mocked.mockResolvedValue({ field: null, start: null, end: null, rows: 0 });

    await useAnalysisStore.getState().ensureDetectedRange("ds-2");
    await useAnalysisStore.getState().ensureDetectedRange("ds-2");

    expect(mocked).toHaveBeenCalledTimes(1);
    expect(useAnalysisStore.getState().timeRange).toEqual(UNBOUNDED);
    expect(useAnalysisStore.getState().detectedRange).toBeNull();
  });
});
