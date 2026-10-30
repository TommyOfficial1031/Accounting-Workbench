import { describe, expect, it } from "vitest";
import { isMac } from "./platform";
import { isModPressed } from "./shortcuts";

describe("shortcuts", () => {
  it("isMac returns a boolean", () => {
    expect(typeof isMac()).toBe("boolean");
  });

  it("isModPressed uses ctrlKey on non-mac (jsdom default)", () => {
    // jsdom 的 navigator.platform 为空串，非 mac，走 ctrlKey 分支
    expect(isModPressed({ ctrlKey: true, metaKey: false } as KeyboardEvent)).toBe(true);
    expect(isModPressed({ ctrlKey: false, metaKey: false } as KeyboardEvent)).toBe(false);
  });
});
