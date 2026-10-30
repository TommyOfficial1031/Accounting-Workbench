import { describe, expect, it } from "vitest";
import { useDirtyStore } from "./dirtyStore";

describe("dirtyStore", () => {
  it("starts clean, marks dirty, then clears", () => {
    useDirtyStore.setState({ dirty: false });
    expect(useDirtyStore.getState().dirty).toBe(false);

    useDirtyStore.getState().markDirty();
    expect(useDirtyStore.getState().dirty).toBe(true);

    useDirtyStore.getState().clearDirty();
    expect(useDirtyStore.getState().dirty).toBe(false);
  });
});
