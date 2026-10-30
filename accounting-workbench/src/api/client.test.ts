import { describe, expect, it, vi } from "vitest";
import { probeBackend } from "./client";

describe("probeBackend", () => {
  it("retries getBackendPort then requests health", async () => {
    let calls = 0;
    const getPort = vi.fn(async () => {
      calls += 1;
      if (calls < 3) throw new Error("Backend port is not available yet");
      return 63881;
    });
    const healthFn = vi.fn(async () => ({ status: "ok" }));

    const result = await probeBackend(getPort, healthFn, 10, 1);

    expect(getPort).toHaveBeenCalledTimes(3);
    expect(healthFn).toHaveBeenCalledTimes(1);
    expect(result.port).toBe(63881);
    expect(result.health).toEqual({ status: "ok" });
  });

  it("throws after exhausting retries and never calls health", async () => {
    const getPort = vi.fn(async () => {
      throw new Error("Backend port is not available yet");
    });
    const healthFn = vi.fn(async () => ({ status: "ok" }));

    await expect(probeBackend(getPort, healthFn, 3, 1)).rejects.toThrow(
      "Backend port is not available yet",
    );
    expect(getPort).toHaveBeenCalledTimes(3);
    expect(healthFn).not.toHaveBeenCalled();
  });
});
