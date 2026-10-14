import { describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
const sleep = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/core/di", () => ({ getDeliverWebhookInteractor: () => ({ invoke }) }));
vi.mock("workflow", () => ({ sleep }));
vi.mock("../capture-failure", () => ({ reportFailure: vi.fn(), toWorkflowFailure: vi.fn() }));

import { deliverWebhook } from "../deliver-webhook";

describe("webhook delivery workflow", () => {
  it("waits for a scheduled retry with a durable sleep instead of a step retry that holds a queue slot", async () => {
    const delivery = {
      companyId: "6a61ad3a-df22-43db-9a09-c77b582cbfee",
      deliveryId: "4b5c0bd5-27c2-4f52-a8e4-9b1b4a07f4c3",
    };
    const nextAttemptAt = "2026-10-12T20:00:10.000Z";
    invoke
      .mockResolvedValueOnce({
        status: "failed",
        statusCode: null,
        responseMessage: "Webhook network error",
        nextAttemptAt,
      })
      .mockResolvedValueOnce({ status: "success", statusCode: 200, responseMessage: "HTTP 200" });

    await deliverWebhook(delivery);

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke).toHaveBeenNthCalledWith(2, delivery);
    expect(sleep).toHaveBeenCalledExactlyOnceWith(new Date(nextAttemptAt));
  });
});
