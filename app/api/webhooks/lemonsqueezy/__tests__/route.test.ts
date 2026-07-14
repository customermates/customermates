import type { NextRequest } from "next/server";

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";

const WEBHOOK_SECRET = "test-webhook-secret";

vi.mock("@/env", () => ({ env: { LEMONSQUEEZY_WEBHOOK_SECRET: WEBHOOK_SECRET } }));

const mockUpdateSubscriptionOrThrow = vi.fn().mockResolvedValue({ companyId: "company-1", changedPlan: null });
const mockDeleteAccountsForPlanInvoke = vi.fn().mockResolvedValue(undefined);

vi.mock("@/core/di", () => ({
  getSubscriptionService: () => ({
    updateSubscriptionOrThrow: mockUpdateSubscriptionOrThrow,
  }),
  getDeleteAccountsForPlanInteractor: () => ({ invoke: mockDeleteAccountsForPlanInvoke }),
}));

const { POST } = await import("../route");

function sign(body: string): string {
  return createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
}

function makeRequest(payload: unknown): NextRequest {
  const body = JSON.stringify(payload);
  const signature = sign(body);

  return {
    headers: { get: (key: string) => (key === "x-signature" ? signature : null) },
    text: () => Promise.resolve(body),
  } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LemonSqueezy webhook route", () => {
  it("rejects a request without a signature header", async () => {
    const request = { headers: { get: () => null }, text: () => Promise.resolve("{}") } as unknown as NextRequest;

    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  it("rejects a request with an invalid signature", async () => {
    const body = JSON.stringify({
      meta: { event_name: "subscription_updated" },
      data: { id: "sub-1", attributes: {} },
    });
    const request = {
      headers: { get: (key: string) => (key === "x-signature" ? "deadbeef" : null) },
      text: () => Promise.resolve(body),
    } as unknown as NextRequest;

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(mockUpdateSubscriptionOrThrow).not.toHaveBeenCalled();
  });

  it("syncs the subscription for subscription_updated using data.id and custom_data.company_id", async () => {
    const request = makeRequest({
      meta: { event_name: "subscription_updated", custom_data: { company_id: "company-1" } },
      data: { id: "sub-1", attributes: {} },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockUpdateSubscriptionOrThrow).toHaveBeenCalledWith("sub-1", "company-1");
  });

  it("passes the subscription id with no company hint when custom_data is absent", async () => {
    const request = makeRequest({
      meta: { event_name: "subscription_created" },
      data: { id: "sub-1", attributes: {} },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockUpdateSubscriptionOrThrow).toHaveBeenCalledWith("sub-1", undefined);
  });

  it("enforces plan caps when the sync reports a changed plan", async () => {
    mockUpdateSubscriptionOrThrow.mockResolvedValueOnce({ companyId: "company-1", changedPlan: "pro" });
    const request = makeRequest({
      meta: { event_name: "subscription_updated", custom_data: { company_id: "company-1" } },
      data: { id: "sub-1", attributes: {} },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockDeleteAccountsForPlanInvoke).toHaveBeenCalledWith({ companyId: "company-1", plan: "pro" });
  });

  it("does not enforce plan caps when the sync reports no plan change", async () => {
    const request = makeRequest({
      meta: { event_name: "subscription_updated", custom_data: { company_id: "company-1" } },
      data: { id: "sub-1", attributes: {} },
    });

    await POST(request);

    expect(mockDeleteAccountsForPlanInvoke).not.toHaveBeenCalled();
  });
});
