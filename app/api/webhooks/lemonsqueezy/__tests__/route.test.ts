import type { NextRequest } from "next/server";

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";

const WEBHOOK_SECRET = "test-webhook-secret";
const COMPANY_ID = "00000000-0000-4000-8000-000000000001";
const CHECKOUT_TOKEN = "a".repeat(64);
const mockCaptureMessage = vi.fn();

vi.mock("@sentry/nextjs", () => ({
  captureMessage: (...args: unknown[]) => mockCaptureMessage(...args),
}));

vi.mock("@/env", () => ({
  env: { LEMONSQUEEZY_WEBHOOK_SECRET: WEBHOOK_SECRET },
}));

const mockUpdateSubscriptionOrThrow = vi.fn().mockResolvedValue({
  companyId: COMPANY_ID,
  changedPlan: "pro",
  disposition: "updated",
});
const mockDeleteAccountsForPlanInvoke = vi.fn().mockResolvedValue(undefined);

vi.mock("@/core/di", () => ({
  getSubscriptionService: () => ({
    updateSubscriptionOrThrow: mockUpdateSubscriptionOrThrow,
  }),
  getDeleteAccountsForPlanInteractor: () => ({
    invoke: mockDeleteAccountsForPlanInvoke,
  }),
}));

const { POST } = await import("../route");

function sign(body: string): string {
  return createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
}

function makeRequest(payload: unknown): NextRequest {
  const body = JSON.stringify(payload);
  const signature = sign(body);

  return {
    headers: {
      get: (key: string) => (key === "x-signature" ? signature : null),
    },
    text: () => Promise.resolve(body),
  } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LemonSqueezy webhook route", () => {
  it("rejects a request without a signature header", async () => {
    const request = {
      headers: { get: () => null },
      text: () => Promise.resolve("{}"),
    } as unknown as NextRequest;

    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  it("rejects a request with an invalid signature", async () => {
    const body = JSON.stringify({
      meta: { event_name: "subscription_updated" },
      data: { id: "sub-1", type: "subscriptions", attributes: {} },
    });
    const request = {
      headers: {
        get: (key: string) => (key === "x-signature" ? "deadbeef" : null),
      },
      text: () => Promise.resolve(body),
    } as unknown as NextRequest;

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(mockUpdateSubscriptionOrThrow).not.toHaveBeenCalled();
  });

  it("passes the subscription, company, and checkout authorization token", async () => {
    const request = makeRequest({
      meta: {
        event_name: "subscription_updated",
        custom_data: {
          company_id: COMPANY_ID,
          checkout_token: CHECKOUT_TOKEN,
        },
      },
      data: { id: "sub-1", type: "subscriptions", attributes: {} },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockUpdateSubscriptionOrThrow).toHaveBeenCalledWith("sub-1", COMPANY_ID, CHECKOUT_TOKEN);
  });

  it("passes the subscription id with no company hint when custom_data is absent", async () => {
    const request = makeRequest({
      meta: { event_name: "subscription_created" },
      data: { id: "sub-1", type: "subscriptions", attributes: {} },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockUpdateSubscriptionOrThrow).toHaveBeenCalledWith("sub-1", undefined, undefined);
  });

  it("applies plan caps after a synchronized plan change", async () => {
    const request = makeRequest({
      meta: {
        event_name: "subscription_updated",
        custom_data: { company_id: COMPANY_ID },
      },
      data: { id: "sub-1", type: "subscriptions", attributes: {} },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockDeleteAccountsForPlanInvoke).toHaveBeenCalledWith({
      companyId: COMPANY_ID,
      plan: "pro",
    });
  });

  it("returns 200 for a provider identity no-op without applying caps", async () => {
    mockUpdateSubscriptionOrThrow.mockResolvedValueOnce({
      companyId: COMPANY_ID,
      changedPlan: null,
      disposition: "ignored-provider-id-mismatch",
    });
    const request = makeRequest({
      meta: {
        event_name: "subscription_updated",
        custom_data: { company_id: COMPANY_ID },
      },
      data: { id: "sub-1", type: "subscriptions", attributes: {} },
    });

    const response = await POST(request);

    expect(await response.json()).toEqual({ success: true, ignored: true });
    expect(mockDeleteAccountsForPlanInvoke).not.toHaveBeenCalled();
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      "Ignored Lemon Squeezy webhook that was not authorized to change the billing binding",
      {
        level: "warning",
        tags: { disposition: "ignored-provider-id-mismatch" },
      },
    );
  });

  it("acknowledges an untrusted initial binding without applying caps", async () => {
    mockUpdateSubscriptionOrThrow.mockResolvedValueOnce({
      companyId: COMPANY_ID,
      changedPlan: null,
      disposition: "ignored-untrusted-initial-binding",
    });
    const request = makeRequest({
      meta: {
        event_name: "subscription_created",
        custom_data: {
          company_id: COMPANY_ID,
          checkout_token: CHECKOUT_TOKEN,
        },
      },
      data: { id: "sub-1", type: "subscriptions", attributes: {} },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, ignored: true });
    expect(mockDeleteAccountsForPlanInvoke).not.toHaveBeenCalled();
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      "Ignored Lemon Squeezy webhook that was not authorized to change the billing binding",
      {
        level: "warning",
        tags: { disposition: "ignored-untrusted-initial-binding" },
      },
    );
  });

  it("acknowledges signed non-subscription objects without treating their IDs as subscriptions", async () => {
    const request = makeRequest({
      meta: {
        event_name: "order_created",
        custom_data: { company_id: COMPANY_ID },
      },
      data: { id: "sub-1", type: "orders", attributes: {} },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, ignored: true });
    expect(mockUpdateSubscriptionOrThrow).not.toHaveBeenCalled();
  });

  it("acknowledges non-lifecycle subscription events without syncing the invoice object", async () => {
    const request = makeRequest({
      meta: {
        event_name: "subscription_payment_success",
        custom_data: { company_id: COMPANY_ID },
      },
      data: {
        id: "invoice-1",
        type: "subscription-invoices",
        attributes: {},
      },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockUpdateSubscriptionOrThrow).not.toHaveBeenCalled();
  });
});
