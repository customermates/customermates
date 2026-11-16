import { describe, expect, it, vi } from "vitest";

import { PRUNE_BATCH_LIMIT } from "@/core/utils/prune-in-batches";

import {
  PUBLIC_FORM_SUBMISSION_RETENTION_DAYS,
  PrunePublicFormSubmissionsInteractor,
} from "../prune-public-form-submissions.interactor";

describe("PrunePublicFormSubmissionsInteractor", () => {
  it("deletes submissions older than the retention window", async () => {
    const repo = { deleteSubmissionsBeforeUnscoped: vi.fn().mockResolvedValue(4) };

    const result = await new PrunePublicFormSubmissionsInteractor(repo).invoke({
      now: new Date("2026-11-16T09:00:00.000Z"),
    });

    expect(PUBLIC_FORM_SUBMISSION_RETENTION_DAYS).toBe(400);
    expect(result).toEqual({ pruned: 4 });
    expect(repo.deleteSubmissionsBeforeUnscoped).toHaveBeenCalledExactlyOnceWith(
      new Date("2025-10-12T09:00:00.000Z"),
      PRUNE_BATCH_LIMIT,
    );
  });

  it("keeps deleting while batches come back full", async () => {
    const repo = {
      deleteSubmissionsBeforeUnscoped: vi.fn().mockResolvedValueOnce(PRUNE_BATCH_LIMIT).mockResolvedValueOnce(1),
    };

    expect(await new PrunePublicFormSubmissionsInteractor(repo).invoke()).toEqual({ pruned: PRUNE_BATCH_LIMIT + 1 });
  });
});
