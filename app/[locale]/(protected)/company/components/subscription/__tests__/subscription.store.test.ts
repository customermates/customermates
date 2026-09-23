import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  portalUrl: vi.fn(),
  toastZodErrorTree: vi.fn(),
  assign: vi.fn(),
}));

vi.mock("../../../actions", () => ({
  createCheckoutSessionAction: vi.fn(),
  refreshSubscriptionAction: vi.fn(),
  getSubscriptionAction: vi.fn(),
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
