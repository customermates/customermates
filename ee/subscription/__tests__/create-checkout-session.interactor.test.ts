import { describe, it, expect, vi, beforeEach } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_ZOD_MODULE,
  MOCK_PRISMA_DB_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();
const request = vi.hoisted(() => ({ origin: "https://feat-inbox.customermates.com" }));
const affiliate = vi.hoisted(() => ({ referral: null as string | null }));

vi.mock("@/env", () => ({
  env: {
    ...MOCK_ENV_MODULE.env,
    BASE_URL: "https://customermates-git-feat-inbox-customermates.vercel.app",
    AUTH_ALLOWED_HOSTS: ["customermates-git-feat-inbox-customermates.vercel.app", "*.customermates.com"],
    LEMONSQUEEZY_VARIANT_ID_STARTER: "2001",
    LEMONSQUEEZY_VARIANT_ID_PRO: "2002",
    LEMONSQUEEZY_VARIANT_ID_BUSINESS: "2003",
  },
}));
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next/headers", () => ({
  headers: () => new Headers({ origin: request.origin }),
  cookies: () => ({
    get: (name: string) =>
      name === "aff_ref" && affiliate.referral ? { name, value: affiliate.referral } : undefined,
  }),
}));

const { CreateCheckoutSessionInteractor } = await import("../create-checkout-session.interactor");

function makeRepo(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    getSubscriptionOrThrow: vi.fn().mockResolvedValue({ plan: "pro" }),
    countActiveUsers: vi.fn().mockResolvedValue(4),
    ...overrides,
  };
}

function makeSubscriptionService() {
  return {
    createCheckoutOrThrow: vi.fn().mockResolvedValue({ data: { attributes: { url: "https://checkout.example.com" } } }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  request.origin = "https://feat-inbox.customermates.com";
});

describe("CreateCheckoutSessionInteractor", () => {
  it("creates a seat checkout for the selected plan with the active user count", async () => {
    const repo = makeRepo();
    const subscriptionService = makeSubscriptionService();
    const interactor = new CreateCheckoutSessionInteractor(subscriptionService as never, repo as never, repo as never);

    const result: any = await interactor.invoke({ plan: "business" } as never);

    expect(result.redirect).toBe("https://checkout.example.com");
    expect(subscriptionService.createCheckoutOrThrow).toHaveBeenCalledTimes(1);
    const args = subscriptionService.createCheckoutOrThrow.mock.calls[0][0];
    expect(args.variantId).toBe("2003");
    expect(args.quantity).toBe(4);
    expect(args.custom).toEqual({ company_id: mockUser.companyId });
    expect(args.redirectUrl).toBe("https://feat-inbox.customermates.com/company/subscription");
  });

  it("falls back to the stable branch origin for an untrusted request origin", async () => {
    request.origin = "https://attacker.example";
    const repo = makeRepo();
    const subscriptionService = makeSubscriptionService();
    const interactor = new CreateCheckoutSessionInteractor(subscriptionService as never, repo as never, repo as never);

    await interactor.invoke({ plan: "business" } as never);

    expect(subscriptionService.createCheckoutOrThrow.mock.calls[0][0].redirectUrl).toBe(
      "https://customermates-git-feat-inbox-customermates.vercel.app/company/subscription",
    );
  });

  it("refuses a self-serve checkout for a manually billed enterprise workspace", async () => {
    const repo = makeRepo({ getSubscriptionOrThrow: vi.fn().mockResolvedValue({ plan: "enterprise" }) });
    const subscriptionService = makeSubscriptionService();
    const interactor = new CreateCheckoutSessionInteractor(subscriptionService as never, repo as never, repo as never);

    await expect(interactor.invoke({ plan: "pro" } as never)).rejects.toThrow("billed manually");
    expect(subscriptionService.createCheckoutOrThrow).not.toHaveBeenCalled();
  });
});
