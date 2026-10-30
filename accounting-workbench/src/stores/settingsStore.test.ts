import { beforeEach, describe, expect, it, vi } from "vitest";

import { FONT_SCALES, useSettingsStore } from "./settingsStore";

// 数据目录走 /api/settings：这里把 api 层换成假的，测 store 的成功 / 失败分支
const { updateDataDirMock, fetchSettingsMock } = vi.hoisted(() => ({
  updateDataDirMock: vi.fn(),
  fetchSettingsMock: vi.fn(),
}));

vi.mock("../api/settings", () => ({
  fetchSettings: fetchSettingsMock,
  updateDataDir: updateDataDirMock,
}));

describe("settingsStore 外观", () => {
  beforeEach(() => {
    useSettingsStore.setState({ theme: "light", scale: 1 });
  });

  it("主题切换", () => {
    expect(useSettingsStore.getState().theme).toBe("light");
    useSettingsStore.getState().setTheme("dark");
    expect(useSettingsStore.getState().theme).toBe("dark");
  });

  it("字号在 0.9–1.2 之间步进，不会越界", () => {
    useSettingsStore.getState().increaseFont();
    expect(useSettingsStore.getState().scale).toBe(1.1);
    useSettingsStore.getState().increaseFont();
    expect(useSettingsStore.getState().scale).toBe(1.2);
    useSettingsStore.getState().increaseFont();
    expect(useSettingsStore.getState().scale).toBe(1.2);

    useSettingsStore.getState().decreaseFont();
    expect(useSettingsStore.getState().scale).toBe(1.1);
    useSettingsStore.getState().decreaseFont();
    useSettingsStore.getState().decreaseFont();
    expect(useSettingsStore.getState().scale).toBe(0.9);
    useSettingsStore.getState().decreaseFont();
    expect(useSettingsStore.getState().scale).toBe(FONT_SCALES[0]);
  });

  it("重置回浅色 + 标准字号", () => {
    useSettingsStore.getState().setTheme("dark");
    useSettingsStore.getState().setScale(1.2);
    useSettingsStore.getState().resetAppearance();
    expect(useSettingsStore.getState().theme).toBe("light");
    expect(useSettingsStore.getState().scale).toBe(1);
  });
});

describe("settingsStore 数据目录（需求 11）", () => {
  beforeEach(() => {
    updateDataDirMock.mockReset();
    fetchSettingsMock.mockReset();
    useSettingsStore.setState({
      appSettings: null,
      dataDirBusy: false,
      lastMigration: null,
    });
  });

  it("迁移成功：设置与迁移结果都落下，提示里带新旧目录", async () => {
    updateDataDirMock.mockResolvedValue({
      settings: {
        data_dir: "D:\\算账数据",
        default_data_dir: "C:\\Users\\13774\\.accounting-workbench",
        is_default: false,
        project_count: 3,
      },
      migration: {
        data_dir: "D:\\算账数据",
        previous_dir: "C:\\Users\\13774\\.accounting-workbench",
        copied_files: 12,
        kept_previous: true,
      },
    });

    const result = await useSettingsStore.getState().changeDataDir("D:\\算账数据");

    expect(updateDataDirMock).toHaveBeenCalledWith("D:\\算账数据");
    expect(result.ok).toBe(true);
    expect(result.message.includes("12 个文件")).toBe(true);
    expect(result.message.includes("D:\\算账数据")).toBe(true);
    expect(result.message.includes("保留一份")).toBe(true);
    expect(useSettingsStore.getState().appSettings?.project_count).toBe(3);
    expect(useSettingsStore.getState().lastMigration?.kept_previous).toBe(true);
    expect(useSettingsStore.getState().dataDirBusy).toBe(false);
  });

  it("迁移失败：原样返回后端的错误文案，设置不变", async () => {
    updateDataDirMock.mockRejectedValue(new Error("目标目录已有工作台数据（projects.db），请换一个空目录"));

    const result = await useSettingsStore.getState().changeDataDir("E:\\旧目录");

    expect(result.ok).toBe(false);
    expect(result.message.includes("已有工作台数据")).toBe(true);
    expect(useSettingsStore.getState().appSettings).toBe(null);
    expect(useSettingsStore.getState().lastMigration).toBe(null);
    expect(useSettingsStore.getState().dataDirBusy).toBe(false);
  });

  it("空路径不发请求", async () => {
    const result = await useSettingsStore.getState().changeDataDir("   ");
    expect(result.ok).toBe(false);
    expect(updateDataDirMock).not.toHaveBeenCalled();
  });

  it("读设置失败不抛（后端没起来时界面照常显示默认目录）", async () => {
    fetchSettingsMock.mockRejectedValue(new Error("backend not ready"));
    await useSettingsStore.getState().loadAppSettings();
    expect(useSettingsStore.getState().appSettings).toBe(null);
  });
});
