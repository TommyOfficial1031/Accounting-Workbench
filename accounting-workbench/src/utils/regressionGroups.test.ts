import { describe, expect, it } from "vitest";

import type { RegressionGroup, RegressionTableResult } from "../types/api";
import {
  EMPTY_POLICY_DRAFT,
  applyCostToLabels,
  commonPolicyValue,
  provinceGroups,
  provinceOf,
  visibleGroups,
} from "./regressionGroups";

function group(label: string, province: string | null, band = "0-60"): RegressionGroup {
  return {
    key: label,
    label,
    parts:
      province === null
        ? undefined
        : { 寄件所属一级网点: label.split(" · ")[0] ?? "", 目的所属省份: province, 公斤段: band },
    row_count: 1,
    z: 100,
    price: 80,
    orig: 100,
    p0: 1,
    p: 0.8,
    d: 0.8,
    c_line: 0,
    op_cost: 0.08,
    c: 0.08,
    d_plan: null,
    z_plan: null,
    p_plan: null,
    profit_now: 0,
    profit_plan: null,
    rate_now: null,
    rate_plan: null,
    filled: false,
  };
}

function table(groups: RegressionGroup[]): RegressionTableResult {
  return {
    groups,
    empty_combos: 0,
    filled_count: 0,
    z: 0,
    z_plan: null,
    price: 0,
    orig: 0,
    p0: null,
    p: null,
    d: null,
    d_plan: null,
    revenue_now: 0,
    revenue_plan: null,
    profit_now: 0,
    profit_plan: null,
    rate_now: null,
    rate_plan: null,
    one_pct: null,
    advice: "",
  };
}

describe("visibleGroups（卡片数 = 图表数，第 11 轮 A③）", () => {
  it("13 张卡片全部可见（原来卡片截 8、图表截 6）", () => {
    const groups = Array.from({ length: 13 }, (_, index) =>
      group(`${index} · 安徽省 · 0-60`, "安徽省"),
    );
    expect(visibleGroups(table(groups))).toHaveLength(13);
  });

  it("没有结果时返回空数组", () => {
    expect(visibleGroups(null)).toEqual([]);
  });
});

describe("provinceOf", () => {
  it("读 parts 里的省份；没有 parts（老数据）返回 null", () => {
    expect(provinceOf(group("上饶德兴 · 安徽省 · 0-60", "安徽省"))).toBe("安徽省");
    expect(provinceOf(group("上饶德兴 · 0-60", null))).toBeNull();
  });
});

describe("provinceGroups（按省份统一写成本的归组）", () => {
  it("同省的多张卡片归到一起，顺序按后端返回顺序", () => {
    const groups = [
      group("上饶德兴 · 安徽省 · 0-60", "安徽省"),
      group("上饶德兴 · 安徽省 · 60-150", "安徽省"),
      group("上饶德兴 · 浙江省 · 0-60", "浙江省"),
      group("东阳一部 · 安徽省 · 0-60", "安徽省"),
    ];
    expect(provinceGroups(groups)).toEqual([
      {
        province: "安徽省",
        labels: ["上饶德兴 · 安徽省 · 0-60", "上饶德兴 · 安徽省 · 60-150", "东阳一部 · 安徽省 · 0-60"],
      },
      { province: "浙江省", labels: ["上饶德兴 · 浙江省 · 0-60"] },
    ]);
  });

  it("没有省份维度的分组不参与（返回空）", () => {
    expect(provinceGroups([group("全部", null)])).toEqual([]);
  });
});

describe("applyCostToLabels / commonPolicyValue（统一区写入 = 覆盖该省全部卡片）", () => {
  const labels = ["上饶德兴 · 安徽省 · 0-60", "上饶德兴 · 安徽省 · 60-150"];

  it("填 0.2 → 该省全部卡片都是 0.2", () => {
    const policies = applyCostToLabels({}, labels, "c_line", "0.2");
    expect(policies[labels[0]].c_line).toBe("0.2");
    expect(policies[labels[1]].c_line).toBe("0.2");
    expect(commonPolicyValue(policies, labels, "c_line")).toBe("0.2");
  });

  it("单卡再改 0.3 → 只有那张是 0.3，统一区显示「多个值」", () => {
    let policies = applyCostToLabels({}, labels, "c_line", "0.2");
    policies = {
      ...policies,
      [labels[0]]: { ...policies[labels[0]], c_line: "0.3" },
    };
    expect(policies[labels[0]].c_line).toBe("0.3");
    expect(policies[labels[1]].c_line).toBe("0.2");
    expect(commonPolicyValue(policies, labels, "c_line")).toBeNull();
  });

  it("写成本不动计划折扣 / 计划货量", () => {
    const policies = applyCostToLabels(
      { [labels[0]]: { ...EMPTY_POLICY_DRAFT, d_plan: "0.7", z_plan: "500" } },
      labels,
      "op_cost",
      "0.1",
    );
    expect(policies[labels[0]]).toEqual({ ...EMPTY_POLICY_DRAFT, d_plan: "0.7", z_plan: "500", op_cost: "0.1" });
    // 没填过的卡片只补这一个字段（其余留空）
    expect(policies[labels[1]]).toEqual({ ...EMPTY_POLICY_DRAFT, op_cost: "0.1" });
  });

  it("都没填过 → 共同值是空串；没有卡片 → null", () => {
    expect(commonPolicyValue({}, labels, "c_line")).toBe("");
    expect(commonPolicyValue({}, [], "c_line")).toBeNull();
  });
});
