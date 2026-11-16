import { describe, expect, it, vi } from "vitest";

import { PRUNE_BATCH_LIMIT } from "@/core/utils/prune-in-batches";

import { BOOKING_RETENTION_DAYS, PruneBookingsInteractor } from "../prune-bookings.interactor";

describe("PruneBookingsInteractor", () => {
  it("deletes bookings that ended before the retention window and reservations abandoned a day ago", async () => {
    const repo = { deleteExpiredUnscoped: vi.fn().mockResolvedValue(5) };

    const result = await new PruneBookingsInteractor(repo).invoke({ now: new Date("2026-11-16T09:00:00.000Z") });

    expect(BOOKING_RETENTION_DAYS).toBe(90);
    expect(result).toEqual({ pruned: 5 });
    expect(repo.deleteExpiredUnscoped).toHaveBeenCalledExactlyOnceWith(
      { endedBefore: new Date("2026-08-18T09:00:00.000Z"), abandonedBefore: new Date("2026-11-15T09:00:00.000Z") },
      PRUNE_BATCH_LIMIT,
    );
  });

  it("keeps deleting while batches come back full", async () => {
    const repo = { deleteExpiredUnscoped: vi.fn().mockResolvedValueOnce(PRUNE_BATCH_LIMIT).mockResolvedValueOnce(0) };

    expect(await new PruneBookingsInteractor(repo).invoke()).toEqual({ pruned: PRUNE_BATCH_LIMIT });
  });
});
