import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  portalUrl: vi.fn(),
  getSubscription: vi.fn(),
  toastError: vi.fn(),
  assign: vi.fn(),
}));

vi.mock("../../../actions", () => ({
  createCheckoutSessionAction: vi.fn(),
  refreshSubscriptionAction: vi.fn(),
  getSubscriptionAction: harness.getSubscription,
  getBillingPortalUrlAction: harness.portalUrl,
}));
vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree: vi.fn() }));

const { SubscriptionStore } = await import("../subscription.store");

const STALE = { plan: "pro", status: "active", hasBillingPortal: true, hasActiveSubscription: true };
const FRESH = { plan: "pro", status: "active", hasBillingPortal: false, hasActiveSubscription: false };

function store() {
  const instance = new SubscriptionStore({
    loadingOverlayStore: { withLoading: async (fn: () => Promise<void>) => fn() },
    localeStore: { getTranslation: (key: string) => key },
  } as never);
  instance.setSubscription(STALE as never);
  Object.assign(instance, { toastError: harness.toastError });
  return instance;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("window", { location: { assign: harness.assign } });
  harness.getSubscription.mockResolvedValue(FRESH);
});

describe("handleManageBilling", () => {
  it("opens the billing portal when the server returns its url", async () => {
    harness.portalUrl.mockResolvedValue("https://billing.example/portal/abc");

    await store().handleManageBilling();

    expect(harness.assign).toHaveBeenCalledWith("https://billing.example/portal/abc");
    expect(harness.toastError).not.toHaveBeenCalled();
    expect(harness.getSubscription).not.toHaveBeenCalled();
  });

  it("tells the user and re-reads the subscription when no portal is available", async () => {
    harness.portalUrl.mockResolvedValue(null);
    const s = store();

    await s.handleManageBilling();

    expect(harness.assign).not.toHaveBeenCalled();
    expect(harness.toastError).toHaveBeenCalledWith("Subscription.billingPortalUnavailable");
    expect(harness.getSubscription).toHaveBeenCalledOnce();
    expect(s.subscription?.hasBillingPortal).toBe(false);
  });
});
