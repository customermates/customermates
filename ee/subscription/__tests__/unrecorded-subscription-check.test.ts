import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { UnrecordedSubscriptionCheck } from "../unrecorded-subscription-check";

function subscription(id: string, status: string, createdAt: string) {
  return { data: { id, attributes: { status, created_at: createdAt } } } as never;
}

const workspace = { companyId: "company-1", plan: "pro" } as never;

describe("UnrecordedSubscriptionCheck", () => {
  const provider = { listStoreSubscriptionsByEmailOrThrowUnscoped: vi.fn(), syncSubscription: vi.fn() };
  const bindings = { findWorkspaceBillingBySubscriptionIdUnscoped: vi.fn() };
  const planAccounts = { invoke: vi.fn() };

  function check() {
    return new UnrecordedSubscriptionCheck(provider as never, bindings as never, planAccounts as never);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    provider.listStoreSubscriptionsByEmailOrThrowUnscoped.mockResolvedValue([]);
    provider.syncSubscription.mockResolvedValue({ companyId: "company-1", changedPlan: null });
    bindings.findWorkspaceBillingBySubscriptionIdUnscoped.mockResolvedValue(null);
  });

  it("finds nothing when no member's email has a subscription", async () => {
    await expect(check().recordUnscoped(workspace, ["Owner@Example.invalid", "owner@example.invalid"])).resolves.toBe(
      "none",
    );

    expect(provider.listStoreSubscriptionsByEmailOrThrowUnscoped).toHaveBeenCalledExactlyOnceWith(
      "owner@example.invalid",
    );
    expect(provider.syncSubscription).not.toHaveBeenCalled();
  });

  it("ignores expired subscriptions and those another workspace already records", async () => {
    provider.listStoreSubscriptionsByEmailOrThrowUnscoped.mockResolvedValue([
      subscription("sub-expired", "expired", "2026-10-18T10:00:00.000Z"),
      subscription("sub-bound", "active", "2026-10-18T11:00:00.000Z"),
    ]);
    bindings.findWorkspaceBillingBySubscriptionIdUnscoped.mockImplementation((id: string) =>
      Promise.resolve(id === "sub-bound" ? { companyId: "company-2" } : null),
    );

    await expect(check().recordUnscoped(workspace, ["owner@example.invalid"])).resolves.toBe("none");
    expect(provider.syncSubscription).not.toHaveBeenCalled();
  });

  it("records the newest unrecorded subscription on the workspace, as the webhook would", async () => {
    const older = subscription("sub-older", "cancelled", "2026-10-18T09:00:00.000Z");
    const newer = subscription("sub-newer", "active", "2026-10-18T12:00:00.000Z");
    provider.listStoreSubscriptionsByEmailOrThrowUnscoped.mockImplementation((email: string) =>
      Promise.resolve(email === "owner@example.invalid" ? [older] : [newer]),
    );
    provider.syncSubscription.mockResolvedValue({ companyId: "company-1", changedPlan: "starter" });

    await expect(check().recordUnscoped(workspace, ["owner@example.invalid", "member@example.invalid"])).resolves.toBe(
      "recorded",
    );

    expect(provider.syncSubscription).toHaveBeenCalledExactlyOnceWith(
      { companyId: "company-1", plan: "pro", lemonSqueezyId: null },
      newer,
      { whileDeleting: true },
    );
    expect(planAccounts.invoke).toHaveBeenCalledWith({ companyId: "company-1", plan: "starter" });
  });

  it("cannot verify when Lemon Squeezy is unreachable", async () => {
    provider.listStoreSubscriptionsByEmailOrThrowUnscoped.mockRejectedValue(new Error("fetch failed"));

    await expect(check().recordUnscoped(workspace, ["owner@example.invalid"])).resolves.toBe("unverified");
    expect(provider.syncSubscription).not.toHaveBeenCalled();
  });

  it("cannot verify when the subscription could not be recorded", async () => {
    provider.listStoreSubscriptionsByEmailOrThrowUnscoped.mockResolvedValue([
      subscription("sub-1", "active", "2026-10-18T12:00:00.000Z"),
    ]);
    provider.syncSubscription.mockResolvedValue(null);

    await expect(check().recordUnscoped(workspace, ["owner@example.invalid"])).resolves.toBe("unverified");
  });
});
