import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import HelpPage from "./HelpPage";
import SettingsPage from "./SettingsPage";

describe("HelpPage", () => {
  it("五个分页 + 默认打开快速上手（占比说明已随功能砍掉）", () => {
    const html = renderToString(<HelpPage />);
    for (const label of ["快速上手", "导入须知", "固定规则口径", "快捷键", "常见问题"]) {
      expect(html.includes(label)).toBe(true);
    }
    expect(html.includes("占比说明")).toBe(false);
    expect(html.includes("新建项目")).toBe(true);
    expect(html.includes("所有计算与数据都保存在本机")).toBe(true);
  });
});

describe("SettingsPage", () => {
  it("外观设置：主题与字号分段控件", () => {
    const html = renderToString(<SettingsPage />);
    expect(html.includes("外观")).toBe(true);
    for (const label of ["浅色", "深色", "小", "标准", "大", "特大"]) {
      expect(html.includes(label)).toBe(true);
    }
    expect(html.includes("预览：账单时间")).toBe(true);
    expect(html.includes("算账工作台 v0.1.0")).toBe(true);
  });

  it("数据目录：显示当前位置 + 打开 / 更改目录（需求 11）", () => {
    const html = renderToString(<SettingsPage />);
    expect(html.includes("数据目录")).toBe(true);
    // 后端设置还没读到时显示默认位置
    expect(html.includes("~/.accounting-workbench")).toBe(true);
    expect(html.includes("更改目录")).toBe(true);
    expect(html.includes("旧目录保留一份")).toBe(true);
    expect(html.includes("数据不外传")).toBe(true);
  });
});
