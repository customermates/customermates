import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  portalUrl: vi.fn(),
  checkout: vi.fn(),
  abandon: vi.fn(),
  subscription: vi.fn(),
  toastZodErrorTree: vi.fn(),
  assign: vi.fn(),
}));

vi.mock("../../../actions", () => ({
  createCheckoutSessionAction: harness.checkout,
  abandonCheckoutAction: harness.abandon,
  refreshSubscriptionAction: vi.fn(),
  getSubscriptionAction: harness.subscription,
  getBillingPortalUrlAction: harness.portalUrl,
}));
vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree: harness.toastZodErrorTree }));

const { SubscriptionStore } = await import("../subscription.store");

function store() {
  return new SubscriptionStore({
    loadingOverlayStore: { withLoading: async (fn: () => Promise<void>) => fn() },
    localeStore: { getTranslation: (key: string) => key },
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("window", { location: { assign: harness.assign } });
});

describe("handleManageBilling", () => {
  it("opens the billing portal the server redirects to", async () => {
    harness.portalUrl.mockResolvedValue({ ok: true, data: { url: "https://billing.example/portal/abc" } });

    await store().handleManageBilling();

    expect(harness.assign).toHaveBeenCalledWith("https://billing.example/portal/abc");
    expect(harness.toastZodErrorTree).not.toHaveBeenCalled();
  });

  it("reports the server's reason and stays on the page when no portal is available", async () => {
    const error = { errors: [], properties: {} };
    harness.portalUrl.mockResolvedValue({ ok: false, error });

    await store().handleManageBilling();

    expect(harness.toastZodErrorTree).toHaveBeenCalledWith(error);
    expect(harness.assign).not.toHaveBeenCalled();
  });
});

describe("handleSubscribe", () => {
  it("opens the checkout the server started", async () => {
    harness.checkout.mockResolvedValue({ ok: true, data: { checkout: "started", url: "https://checkout.example/1" } });

    await store().handleSubscribe({ plan: "business", cadence: "monthly" });

    expect(harness.assign).toHaveBeenCalledWith("https://checkout.example/1");
    expect(harness.subscription).not.toHaveBeenCalled();
  });

  it("stays on the page and shows the pending payment when the server refuses a second checkout", async () => {
    const pending = { plan: "pro", status: "trial", checkout: "pending" };
    harness.checkout.mockResolvedValue({ ok: true, data: { checkout: "pending" } });
    harness.subscription.mockResolvedValue(pending);
    const subscriptions = store();

    await subscriptions.handleSubscribe({ plan: "business", cadence: "monthly" });

    expect(harness.assign).not.toHaveBeenCalled();
    expect(subscriptions.subscription).toEqual(pending);
    expect(harness.toastZodErrorTree).not.toHaveBeenCalled();
  });
});

describe("handleAbandon", () => {
  it("clears the pending payment and shows the plans again", async () => {
    const cleared = { plan: "pro", status: "trial", checkout: "none" };
    harness.abandon.mockResolvedValue({ ok: true, data: null });
    harness.subscription.mockResolvedValue(cleared);
    const subscriptions = store();

    await subscriptions.handleAbandon();

    expect(harness.abandon).toHaveBeenCalledOnce();
    expect(subscriptions.subscription).toEqual(cleared);
  });

  it("reports the server's reason and keeps the notice when clearing fails", async () => {
    const error = { errors: ["Access denied"], properties: {} };
    harness.abandon.mockResolvedValue({ ok: false, error });

    await store().handleAbandon();

    expect(harness.toastZodErrorTree).toHaveBeenCalledWith(error);
    expect(harness.subscription).not.toHaveBeenCalled();
  });
});
