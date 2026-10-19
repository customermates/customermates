import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerWorkspaceChangedHandler } from "@/core/errors/workspace-changed-notice";

const harness = vi.hoisted(() => ({
  checkout: vi.fn(),
  abandon: vi.fn(),
  subscription: vi.fn(),
  toastZodErrorTree: vi.fn(),
  assign: vi.fn(),
  navigateDocument: vi.fn(),
  notifyWorkspaceChanged: vi.fn(),
}));

vi.mock("@/app/[locale]/(protected)/settings/(workspace)/actions", () => ({
  createCheckoutSessionAction: harness.checkout,
  abandonCheckoutAction: harness.abandon,
  getSubscriptionAction: harness.subscription,
}));
vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree: harness.toastZodErrorTree }));

const { SubscriptionExpiredStore } = await import("../subscription-expired.store");

function store() {
  return new SubscriptionExpiredStore({
    loadingOverlayStore: { withLoading: async (fn: () => Promise<void>) => fn() },
    localeStore: { locale: "de", getTranslation: (key: string) => key },
    navigationGuard: { navigateDocument: harness.navigateDocument },
  } as never);
}

function subscription(overrides: Record<string, unknown>) {
  return { ok: true, data: { status: "expired", plan: "pro", trialEndDate: null, checkout: "pending", ...overrides } };
}

beforeEach(() => {
  vi.clearAllMocks();
  registerWorkspaceChangedHandler(harness.notifyWorkspaceChanged);
  vi.stubGlobal("window", { location: { assign: harness.assign } });
});

describe("SubscriptionExpiredStore", () => {
  it("opens the checkout the server started", async () => {
    harness.checkout.mockResolvedValue({ ok: true, data: { checkout: "started", url: "https://checkout.example/1" } });
    const expired = store();

    await expired.handleSubscribe({ plan: "business", cadence: "monthly" });

    expect(harness.assign).toHaveBeenCalledWith("https://checkout.example/1");
    expect(expired.checkout).toBeNull();
  });

  it("shows the pending payment instead of opening a second checkout", async () => {
    harness.checkout.mockResolvedValue({ ok: true, data: { checkout: "pending" } });
    const expired = store();

    await expired.handleSubscribe({ plan: "business", cadence: "monthly" });

    expect(expired.checkout).toBe("pending");
    expect(harness.assign).not.toHaveBeenCalled();
  });

  it("moves on instead of opening a checkout when another admin's payment already activated the workspace", async () => {
    harness.checkout.mockResolvedValue({ ok: true, data: { checkout: "active" } });
    harness.subscription.mockResolvedValue(subscription({ status: "active", checkout: "none" }));
    const expired = store();

    await expired.handleSubscribe({ plan: "business", cadence: "monthly" });

    expect(harness.assign).not.toHaveBeenCalled();
    expect(harness.navigateDocument).toHaveBeenCalledExactlyOnceWith("/de/settings/billing");
  });

  it("clears the pending payment when the person did not finish paying", async () => {
    harness.abandon.mockResolvedValue({ ok: true, data: null });
    const expired = store();
    expired.setCheckout("pending");

    await expired.handleAbandon();

    expect(expired.checkout).toBe("none");
  });

  it("keeps the notice and reports why when clearing fails", async () => {
    const error = { errors: ["Access denied"], properties: {} };
    harness.abandon.mockResolvedValue({ ok: false, error });
    const expired = store();
    expired.setCheckout("pending");

    await expired.handleAbandon();

    expect(expired.checkout).toBe("pending");
    expect(harness.toastZodErrorTree).toHaveBeenCalledWith(error);
  });

  it("follows the workspace's checkout state while it is still expired", async () => {
    harness.subscription.mockResolvedValueOnce(subscription({ checkout: "pending" }));
    harness.subscription.mockResolvedValueOnce(subscription({ checkout: "overdue" }));
    const expired = store();
    expired.setCheckout("pending");

    await expired.refreshCheckout();
    expect(expired.checkout).toBe("pending");
    await expired.refreshCheckout();

    expect(expired.checkout).toBe("overdue");
    expect(harness.navigateDocument).not.toHaveBeenCalled();
  });

  it("moves on to billing once, in the person's language, when the payment activates the workspace", async () => {
    harness.subscription.mockResolvedValue(subscription({ status: "active", checkout: "none" }));
    const expired = store();
    expired.setCheckout("pending");

    await expired.refreshCheckout();
    await expired.refreshCheckout();

    expect(expired.activated).toBe(true);
    expect(harness.navigateDocument).toHaveBeenCalledExactlyOnceWith("/de/settings/billing");
    expect(harness.subscription).toHaveBeenCalledOnce();
  });

  it("treats a trial that ended as still expired", async () => {
    harness.subscription.mockResolvedValue(
      subscription({ status: "trial", trialEndDate: new Date(Date.now() - 60_000), checkout: "pending" }),
    );
    const expired = store();

    await expired.refreshCheckout();

    expect(expired.activated).toBe(false);
    expect(harness.navigateDocument).not.toHaveBeenCalled();
  });

  it("shows the changed-workspace notice instead of failing when the membership is no longer active", async () => {
    harness.subscription.mockResolvedValue({
      ok: false,
      failure: {
        kind: "authorization",
        issues: [{ code: "custom", path: [], message: "Inactive", customCode: "userInactive" }],
      },
    });
    const expired = store();
    expired.setCheckout("pending");

    await expect(expired.refreshCheckout()).resolves.toBeUndefined();

    expect(harness.notifyWorkspaceChanged).toHaveBeenCalledOnce();
    expect(expired.checkout).toBe("pending");
    expect(harness.navigateDocument).not.toHaveBeenCalled();
  });

  it("reports any other failure to load the subscription", async () => {
    harness.subscription.mockResolvedValue({
      ok: false,
      failure: { kind: "unavailable", issues: [{ code: "custom", path: [], message: "Down" }] },
    });

    await expect(store().refreshCheckout()).rejects.toThrow("Subscription could not be loaded");
    expect(harness.notifyWorkspaceChanged).not.toHaveBeenCalled();
  });
});
