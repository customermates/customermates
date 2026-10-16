import { describe, expect, it, vi } from "vitest";

import { DRAFT_SEND_PRUNE_BATCH_LIMIT } from "../../draft-send";
import { PruneDraftSendsInteractor } from "../prune-draft-sends.interactor";

describe("PruneDraftSendsInteractor", () => {
  it("prunes send records last changed more than 30 days ago", async () => {
    const repo = { pruneDraftSendsUnscoped: vi.fn().mockResolvedValue({ pruned: 3, next: null }) };

    const result = await new PruneDraftSendsInteractor(repo).invoke({ now: new Date("2026-10-16T09:00:00Z") });

    expect(result).toEqual({ pruned: 3 });
    expect(repo.pruneDraftSendsUnscoped).toHaveBeenCalledExactlyOnceWith({
      before: new Date("2026-09-16T09:00:00Z"),
      after: null,
      limit: DRAFT_SEND_PRUNE_BATCH_LIMIT,
    });
  });

  it("continues after the last record of each full batch until a batch ends the scan", async () => {
    const repo = {
      pruneDraftSendsUnscoped: vi
        .fn()
        .mockResolvedValueOnce({ pruned: 2, next: "send-500" })
        .mockResolvedValueOnce({ pruned: 0, next: "send-1000" })
        .mockResolvedValueOnce({ pruned: 1, next: null }),
    };

    const result = await new PruneDraftSendsInteractor(repo).invoke({ now: new Date("2026-10-16T09:00:00Z") });

    expect(result).toEqual({ pruned: 3 });
    expect(repo.pruneDraftSendsUnscoped.mock.calls.map(([args]) => args.after)).toEqual([
      null,
      "send-500",
      "send-1000",
    ]);
  });
});
