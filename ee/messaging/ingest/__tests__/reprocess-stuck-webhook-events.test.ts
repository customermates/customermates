import { describe, expect, it, vi } from "vitest";

import { ReprocessStuckWebhookEventsInteractor } from "../reprocess-stuck-webhook-events.interactor";

describe("ReprocessStuckWebhookEventsInteractor", () => {
  it("stops the batch at a Unipile rate limit, leaving the rest for the next run", async () => {
    const repo = { findReprocessableEventIdsUnscoped: vi.fn().mockResolvedValue(["a", "b", "c"]) };
    const processor = {
      invoke: vi.fn().mockResolvedValueOnce({ rateLimited: false }).mockResolvedValueOnce({ rateLimited: true }),
    };

    await new ReprocessStuckWebhookEventsInteractor(repo as never, processor as never).invoke();

    expect(processor.invoke.mock.calls.map(([input]) => input.id)).toEqual(["a", "b"]);
  });

  it("keeps going past an event that throws", async () => {
    const repo = { findReprocessableEventIdsUnscoped: vi.fn().mockResolvedValue(["a", "b"]) };
    const processor = {
      invoke: vi.fn().mockRejectedValueOnce(new Error("lost row")).mockResolvedValueOnce({ rateLimited: false }),
    };

    await new ReprocessStuckWebhookEventsInteractor(repo as never, processor as never).invoke();

    expect(processor.invoke).toHaveBeenCalledTimes(2);
  });
});
