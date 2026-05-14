import { describe, it, expect, vi } from "vitest";

import { AbortTaskRunError } from "@trigger.dev/sdk/v3";

vi.mock("@/core/app-di", () => ({ getDeliverWebhookInteractor: () => null }));

import { WebhookPermanentFailure } from "../webhook-deliveries";

describe("WebhookPermanentFailure", () => {
  it("inherits AbortTaskRunError so trigger.dev recognises it for non-retry", () => {
    const err = new WebhookPermanentFailure(404, "Not Found");

    expect(err).toBeInstanceOf(AbortTaskRunError);
    expect(err.name).toBe("AbortTaskRunError");
  });

  it("preserves the status code and response message on the error instance", () => {
    const err = new WebhookPermanentFailure(404, "Not Found");

    expect(err.statusCode).toBe(404);
    expect(err.responseMessage).toBe("Not Found");
    expect(err.message).toBe("Webhook target responded 404 Not Found (non-retryable)");
  });

  it("handles missing status code and missing response message", () => {
    const err = new WebhookPermanentFailure(null, null);

    expect(err.statusCode).toBeNull();
    expect(err.responseMessage).toBeNull();
    expect(err.message).toBe("Webhook target responded no-status  (non-retryable)");
  });
});
