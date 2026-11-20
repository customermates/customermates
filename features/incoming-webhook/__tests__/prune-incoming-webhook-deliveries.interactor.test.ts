import { describe, expect, it, vi } from "vitest";

import { PRUNE_BATCH_LIMIT } from "@/core/utils/prune-in-batches";

import { INCOMING_WEBHOOK_LIMITS } from "../incoming-webhook.schema";
import { PruneIncomingWebhookDeliveriesInteractor } from "../prune-incoming-webhook-deliveries.interactor";

describe("PruneIncomingWebhookDeliveriesInteractor", () => {
  it("deletes deliveries older than the retention window", async () => {
    const repo = { deleteDeliveriesBeforeUnscoped: vi.fn().mockResolvedValue(7) };

    const result = await new PruneIncomingWebhookDeliveriesInteractor(repo).invoke({
      now: new Date("2026-11-16T09:00:00.000Z"),
    });

    expect(INCOMING_WEBHOOK_LIMITS.retentionDays).toBe(30);
    expect(result).toEqual({ pruned: 7 });
    expect(repo.deleteDeliveriesBeforeUnscoped).toHaveBeenCalledExactlyOnceWith(
      new Date("2026-10-17T09:00:00.000Z"),
      PRUNE_BATCH_LIMIT,
    );
  });

  it("keeps deleting while batches come back full", async () => {
    const repo = {
      deleteDeliveriesBeforeUnscoped: vi.fn().mockResolvedValueOnce(PRUNE_BATCH_LIMIT).mockResolvedValueOnce(2),
    };

    const result = await new PruneIncomingWebhookDeliveriesInteractor(repo).invoke();

    expect(result).toEqual({ pruned: PRUNE_BATCH_LIMIT + 2 });
  });
});
