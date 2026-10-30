import { describe, expect, it } from "vitest";

import { createDropDedupe, fileNameOf, firstTableFile } from "./droppedFile";

describe("fileNameOf", () => {
  it("Windows 反斜杠 / 正斜杠都能取到文件名", () => {
    expect(fileNameOf("C:\\Users\\a\\数据原表（前100行）.xlsx")).toBe("数据原表（前100行）.xlsx");
    expect(fileNameOf("/Users/a/data.csv")).toBe("data.csv");
    expect(fileNameOf("plain.xlsx")).toBe("plain.xlsx");
  });
});

describe("firstTableFile", () => {
  it("挑第一个表格文件（多个一起拖也行）", () => {
    expect(firstTableFile(["C:\\a\\表.xlsx", "C:\\a\\说明.txt"])).toBe("C:\\a\\表.xlsx");
    expect(firstTableFile(["C:\\a\\README.md", "C:\\a\\表.CSV"])).toBe("C:\\a\\表.CSV");
  });

  it("没有表格文件时返回 null（调用方给提示）", () => {
    expect(firstTableFile(["C:\\a\\图片.png"])).toBeNull();
    expect(firstTableFile([])).toBeNull();
  });
});

describe("createDropDedupe", () => {
  it("同一条路径在窗口期内只放行一次（两条通道各来一次）", () => {
    let now = 1000;
    const dedupe = createDropDedupe(1500, () => now);
    expect(dedupe("C:\\a\\表.xlsx")).toBe(true);
    now = 1200;
    expect(dedupe("C:\\a\\表.xlsx")).toBe(false);
    now = 2600;
    expect(dedupe("C:\\a\\表.xlsx")).toBe(true);
  });

  it("不同路径互不影响", () => {
    const dedupe = createDropDedupe(1500, () => 1000);
    expect(dedupe("a.xlsx")).toBe(true);
    expect(dedupe("b.xlsx")).toBe(true);
  });
});
