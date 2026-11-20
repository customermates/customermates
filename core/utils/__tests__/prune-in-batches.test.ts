import { describe, expect, it, vi } from "vitest";

import { PRUNE_BATCH_LIMIT, PRUNE_MAX_BATCHES, pruneInBatches } from "../prune-in-batches";

describe("pruneInBatches", () => {
  it("stops after the first batch that is not full", async () => {
    const deleteBatch = vi.fn().mockResolvedValueOnce(PRUNE_BATCH_LIMIT).mockResolvedValueOnce(3);

    expect(await pruneInBatches(deleteBatch)).toBe(PRUNE_BATCH_LIMIT + 3);
    expect(deleteBatch).toHaveBeenCalledTimes(2);
    expect(deleteBatch).toHaveBeenCalledWith(PRUNE_BATCH_LIMIT);
  });

  it("deletes nothing and stops at once when there is nothing to delete", async () => {
    const deleteBatch = vi.fn().mockResolvedValue(0);

    expect(await pruneInBatches(deleteBatch)).toBe(0);
    expect(deleteBatch).toHaveBeenCalledOnce();
  });

  it("stops after a bounded number of full batches and leaves the rest to the next run", async () => {
    const deleteBatch = vi.fn().mockResolvedValue(PRUNE_BATCH_LIMIT);

    expect(await pruneInBatches(deleteBatch)).toBe(PRUNE_BATCH_LIMIT * PRUNE_MAX_BATCHES);
    expect(deleteBatch).toHaveBeenCalledTimes(PRUNE_MAX_BATCHES);
  });
});
