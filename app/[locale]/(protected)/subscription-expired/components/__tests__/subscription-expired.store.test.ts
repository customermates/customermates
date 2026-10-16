import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  checkout: vi.fn(),
  abandon: vi.fn(),
  subscription: vi.fn(),
  toastZodErrorTree: vi.fn(),
  assign: vi.fn(),
  navigateDocument: vi.fn(),
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
  return { status: "expired", plan: "pro", trialEndDate: null, checkout: "pending", ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
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
});
