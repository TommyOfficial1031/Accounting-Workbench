import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";

import ExportManagerPage from "./ExportManagerPage";
import { useExportStore } from "../stores/exportStore";

/** zustand v5 服务端渲染读 getInitialState，所以要把当前状态灌回去再渲染。 */
function seed(): void {
  Object.assign(useExportStore.getInitialState(), useExportStore.getState());
}

describe("ExportManagerPage", () => {
  it("空态渲染：标题 + 引导文案", () => {
    useExportStore.setState({ records: [] });
    seed();

    const html = renderToString(<ExportManagerPage />);
    expect(html.includes("导出文件")).toBe(true);
    expect(html.includes("还没有导出记录")).toBe(true);
    expect(html.includes("在分析页或盈亏平衡页导出文件后")).toBe(true);
  });

  it("有记录时渲染六列表头与操作", () => {
    useExportStore.setState({
      records: [
        {
          id: "r1",
          name: "网点货量分析_20261025.xlsx",
          kind: "file",
          path: "C:\\out\\网点货量分析_20261025.xlsx",
          project_id: "p1",
          project_name: "10月账单",
          creator: "张三",
          exported_at: "2026-10-25 10:10:10",
          created_at: "2026-10-25 10:10:10",
        },
        {
          id: "r2",
          name: "盈亏平衡 - 浙北（5 个文件）",
          kind: "folder",
          path: "C:\\out\\盈亏平衡 - 浙北",
          project_id: "p1",
          project_name: "10月账单",
          creator: "张三",
          exported_at: "2026-10-25 09:00:00",
          created_at: "2026-10-25 09:00:00",
        },
      ],
    });
    seed();

    const html = renderToString(<ExportManagerPage />);
    for (const label of ["文件名称", "导出时间", "归属项目", "创建人", "文件路径", "操作"]) {
      expect(html.includes(label)).toBe(true);
    }
    expect(html.includes("打开文件")).toBe(true);
    expect(html.includes("打开路径")).toBe(true);
    expect(html.includes("10月账单")).toBe(true);
    expect(html.includes("张三")).toBe(true);
    expect(html.includes("盈亏平衡 - 浙北（5 个文件）")).toBe(true);
    expect(html.includes("网点货量分析_20261025.xlsx")).toBe(true);

    useExportStore.setState({ records: [] });
    seed();
  });
});
