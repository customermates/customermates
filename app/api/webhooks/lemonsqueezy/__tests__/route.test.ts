import type { NextRequest } from "next/server";

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";

const WEBHOOK_SECRET = "test-webhook-secret";
const SIGNATURE = "a".repeat(64);

vi.mock("@/env", () => ({ env: { LEMONSQUEEZY_WEBHOOK_SECRET: WEBHOOK_SECRET } }));

const mockProcess = vi.fn().mockResolvedValue("applied");

vi.mock("@/core/di", () => ({
  getProcessLemonSqueezyWebhookInteractor: () => ({ invoke: mockProcess }),
}));

const { POST } = await import("../route");
const { lemonSqueezyPaymentSuccessEvent, lemonSqueezySubscriptionAttributes, lemonSqueezySubscriptionEvent } =
  await import("@/tests/helpers/lemonsqueezy-subscription");

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
    expect(mockProcess).not.toHaveBeenCalled();
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
    expect(mockProcess).not.toHaveBeenCalled();
  });

  it("hands the subscription, its creation time and the signed workspace claim to the interactor", async () => {
    const request = makeRequest({
      meta: {
        event_name: "subscription_updated",
        custom_data: { company_id: "company-1", company_signature: SIGNATURE },
      },
      data: { type: "subscriptions", id: "sub-1", attributes: { created_at: "2026-10-16T09:12:34.000000Z" } },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(mockProcess).toHaveBeenCalledExactlyOnceWith({
      kind: "subscription",
      eventName: "subscription_updated",
      subscriptionId: "sub-1",
      subscriptionCreatedAt: new Date("2026-10-16T09:12:34.000Z"),
      claim: { companyId: "company-1", signature: SIGNATURE },
    });
  });

  it("passes an unsigned workspace claim on without a signature", async () => {
    const request = makeRequest({
      meta: { event_name: "subscription_created", custom_data: { company_id: "company-1" } },
      data: { id: "sub-1", attributes: {} },
    });

    await POST(request);

    expect(mockProcess).toHaveBeenCalledWith(
      expect.objectContaining({ claim: { companyId: "company-1", signature: null }, subscriptionCreatedAt: null }),
    );
  });

  it("passes no claim when the event names no workspace", async () => {
    const request = makeRequest({
      meta: { event_name: "subscription_created" },
      data: { id: "sub-1", attributes: {} },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockProcess).toHaveBeenCalledWith(expect.objectContaining({ subscriptionId: "sub-1", claim: null }));
  });

  it.each([
    ["a number", { company_id: 42 }],
    ["an empty string", { company_id: "" }],
    ["an overlong string", { company_id: "x".repeat(201) }],
    ["a list", ["company-1"]],
  ])("treats a workspace claim given as %s as no claim", async (_, customData) => {
    const request = makeRequest({
      meta: { event_name: "subscription_created", custom_data: customData },
      data: { id: "sub-1", attributes: {} },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockProcess).toHaveBeenCalledWith(expect.objectContaining({ claim: null }));
  });

  it.each([
    ["a number", 7, ""],
    ["an object", { value: SIGNATURE }, ""],
    ["an overlong string", "a".repeat(500), "a".repeat(200)],
  ])("passes a signature given as %s on as an invalid one, never as unsigned", async (_, signature, expected) => {
    const request = makeRequest({
      meta: {
        event_name: "subscription_created",
        custom_data: { company_id: "company-1", company_signature: signature },
      },
      data: { id: "sub-1", attributes: { created_at: "not a date" } },
    });

    await POST(request);

    expect(mockProcess).toHaveBeenCalledWith(
      expect.objectContaining({ claim: { companyId: "company-1", signature: expected }, subscriptionCreatedAt: null }),
    );
  });

  it("treats an explicit null signature as unsigned", async () => {
    const request = makeRequest({
      meta: { event_name: "subscription_created", custom_data: { company_id: "company-1", company_signature: null } },
      data: { id: "sub-1", attributes: {} },
    });

    await POST(request);

    expect(mockProcess).toHaveBeenCalledWith(
      expect.objectContaining({ claim: { companyId: "company-1", signature: null } }),
    );
  });

  it.each([
    ["a failed payment", "subscription_payment_failed", "subscription-invoices"],
    ["a refunded payment", "subscription_payment_refunded", "subscription-invoices"],
    ["an order", "order_created", "orders"],
    ["a license key", "license_key_created", "license-keys"],
  ])("acknowledges %s without touching any workspace", async (_, eventName, type) => {
    const request = makeRequest({
      meta: { event_name: eventName, custom_data: { company_id: "company-1", company_signature: SIGNATURE } },
      data: { type, id: "object-1", attributes: { subscription_id: 1 } },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ignored: true });
    expect(mockProcess).not.toHaveBeenCalled();
  });

  it("hands a successful payment to the interactor with the subscription it pays for and acknowledges it", async () => {
    mockProcess.mockResolvedValueOnce("ignored");
    const request = makeRequest(
      lemonSqueezyPaymentSuccessEvent("123456789", { company_id: "company-1", company_signature: SIGNATURE }),
    );

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ignored: true });
    expect(mockProcess).toHaveBeenCalledExactlyOnceWith({
      kind: "payment",
      eventName: "subscription_payment_success",
      subscriptionId: "123456789",
      subscriptionCreatedAt: null,
      claim: { companyId: "company-1", signature: SIGNATURE },
    });
  });

  it.each([
    ["no subscription", {}],
    ["a malformed subscription", { subscription_id: "sub-1" }],
  ])("acknowledges a successful payment that names %s without asking the interactor", async (_, attributes) => {
    const request = makeRequest({
      meta: { event_name: "subscription_payment_success", custom_data: { company_id: "company-1" } },
      data: { type: "subscription-invoices", id: "invoice-1", attributes },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ignored: true });
    expect(mockProcess).not.toHaveBeenCalled();
  });

  it("acknowledges an event the interactor deliberately left alone", async () => {
    mockProcess.mockResolvedValueOnce("ignored");
    const request = makeRequest({
      meta: {
        event_name: "subscription_cancelled",
        custom_data: { company_id: "company-1", company_signature: SIGNATURE },
      },
      data: { type: "subscriptions", id: "sub-old", attributes: {} },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ignored: true });
  });

  it("acknowledges an event the interactor refused, so the provider does not retry it and alert again", async () => {
    mockProcess.mockResolvedValueOnce("refused");
    const request = makeRequest({
      meta: { event_name: "subscription_updated", custom_data: { company_id: "unknown-company" } },
      data: { id: "sub-1", attributes: {} },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ refused: true });
  });

  it("reads the subscription id, creation time and workspace from a real-shaped subscription_created event", async () => {
    const attributes = lemonSqueezySubscriptionAttributes({
      subscriptionId: "123456789",
      itemId: 987654321,
      storeId: 1,
      storeOrigin: "https://customermates.lemonsqueezy.com",
      variantId: 2003,
      variantName: "Business",
      quantity: 1,
      customer: { name: "Test Customer", email: "customer@example.invalid" },
      createdAt: new Date("2026-10-16T09:12:34.567Z"),
    });
    const request = makeRequest(
      lemonSqueezySubscriptionEvent(
        "subscription_created",
        { type: "subscriptions", id: "123456789", attributes },
        { company_id: "company-1", company_signature: SIGNATURE },
      ),
    );

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(mockProcess).toHaveBeenCalledExactlyOnceWith({
      kind: "subscription",
      eventName: "subscription_created",
      subscriptionId: "123456789",
      subscriptionCreatedAt: new Date("2026-10-16T09:12:34.000Z"),
      claim: { companyId: "company-1", signature: SIGNATURE },
    });
  });
});
