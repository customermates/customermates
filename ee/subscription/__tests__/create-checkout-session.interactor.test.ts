import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_ZOD_MODULE,
  MOCK_PRISMA_DB_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const COMPANY_ID = "00000000-0000-4000-8000-000000000001";
const mockUser = createMockUser({ companyId: COMPANY_ID });
const request = vi.hoisted(() => ({
  origin: "https://feat-inbox.customermates.com",
}));

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
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve({ raw: (key: string) => key }),
}));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next/headers", () => ({
  headers: () => new Headers({ origin: request.origin }),
}));

const { CreateCheckoutSessionInteractor } = await import("../create-checkout-session.interactor");

function makeCheckoutRepo(plan = "pro") {
  return {
    getSubscriptionOrThrow: vi.fn().mockResolvedValue({ plan, lemonSqueezyId: null }),
  };
}

function makeSubscriptionService() {
  return {
    createCheckoutOrThrow: vi.fn().mockResolvedValue({
      data: { attributes: { url: "https://checkout.example.com" } },
    }),
  };
}

function makeUserRepo() {
  return { countActiveUsers: vi.fn().mockResolvedValue(4) };
}

beforeEach(() => {
  vi.clearAllMocks();
  request.origin = "https://feat-inbox.customermates.com";
});

describe("CreateCheckoutSessionInteractor", () => {
  it("creates checkout for the explicit monthly offer and current active seats", async () => {
    const repo = makeCheckoutRepo();
    const subscriptionService = makeSubscriptionService();
    const userRepo = makeUserRepo();
    const interactor = new CreateCheckoutSessionInteractor(
      subscriptionService as never,
      repo as never,
      userRepo as never,
    );

    const result = await interactor.invoke({
      plan: "business",
      cadence: "monthly",
    } as never);

    expect(result).toMatchObject({ redirect: "https://checkout.example.com" });
    expect(userRepo.countActiveUsers).toHaveBeenCalledTimes(1);
    expect(subscriptionService.createCheckoutOrThrow).toHaveBeenCalledWith({
      offer: expect.objectContaining({ id: "business:monthly" }),
      quantity: 4,
      custom: { company_id: COMPANY_ID },
      redirectUrl: "https://feat-inbox.customermates.com/company/subscription",
    });
  });

  it("falls back to the stable branch origin for an untrusted request origin", async () => {
    request.origin = "https://attacker.example";
    const subscriptionService = makeSubscriptionService();
    const interactor = new CreateCheckoutSessionInteractor(
      subscriptionService as never,
      makeCheckoutRepo() as never,
      makeUserRepo() as never,
    );

    await interactor.invoke({ plan: "business", cadence: "monthly" } as never);

    expect(subscriptionService.createCheckoutOrThrow.mock.calls[0][0].redirectUrl).toBe(
      "https://customermates-git-feat-inbox-customermates.vercel.app/company/subscription",
    );
  });

  it("rejects Enterprise before calling the provider", async () => {
    const subscriptionService = makeSubscriptionService();
    const interactor = new CreateCheckoutSessionInteractor(
      subscriptionService as never,
      makeCheckoutRepo("enterprise") as never,
      makeUserRepo() as never,
    );

    await expect(interactor.invoke({ plan: "pro", cadence: "monthly" } as never)).resolves.toMatchObject({
      ok: false,
      error: { issues: [{ params: { error: "enterpriseCheckoutUnavailable" } }] },
    });
    expect(subscriptionService.createCheckoutOrThrow).not.toHaveBeenCalled();
  });

  it("rejects annual checkout before calling the provider", async () => {
    const subscriptionService = makeSubscriptionService();
    const interactor = new CreateCheckoutSessionInteractor(
      subscriptionService as never,
      makeCheckoutRepo() as never,
      makeUserRepo() as never,
    );

    const result = await interactor.invoke({
      plan: "business",
      cadence: "annual",
    } as never);

    expect(result).toMatchObject({ ok: false });
    expect(subscriptionService.createCheckoutOrThrow).not.toHaveBeenCalled();
  });
});
