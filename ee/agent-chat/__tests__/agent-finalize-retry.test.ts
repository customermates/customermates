import { describe, expect, it, vi } from "vitest";

import { retryAgentFinalization } from "../agent-finalize-retry";

describe("agent finalization retry", () => {
  it("retries a transaction lock timeout and commits once", async () => {
    const lockTimeout = Object.assign(new Error("canceling statement due to lock timeout"), {
      meta: { driverAdapterError: { cause: { originalCode: "55P03" } } },
    });
    const commit = vi.fn().mockRejectedValueOnce(lockTimeout).mockResolvedValue({ id: "reply-1" });
    await expect(retryAgentFinalization(commit)).resolves.toEqual({
      id: "reply-1",
    });
    expect(commit).toHaveBeenCalledTimes(2);
  });

  it("does not retry a non-lock error", async () => {
    const commit = vi.fn().mockRejectedValue(new Error("invalid turn"));
    await expect(retryAgentFinalization(commit)).rejects.toThrow("invalid turn");
    expect(commit).toHaveBeenCalledTimes(1);
  });
});
