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
const locale = vi.hoisted(() => ({ value: "en" }));
vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve(locale.value),
  getTranslations: () => Promise.resolve({ raw: (key: string) => key }),
}));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next/headers", () => ({
  headers: () => new Headers({ origin: request.origin }),
}));

const { CreateCheckoutSessionInteractor } = await import("../create-checkout-session.interactor");
const { isCheckoutWorkspaceSignature } = await import("../checkout-workspace-signature");

function makeCheckoutRepo(
  plan = "pro",
  checkoutStartedAt: Date | null = null,
  binding: { lemonSqueezyId: string | null; status: string; trialEndDate?: Date | null } = {
    lemonSqueezyId: null,
    status: "trial",
  },
) {
  return {
    getSubscriptionOrThrow: vi.fn().mockResolvedValue({ plan, checkoutStartedAt, trialEndDate: null, ...binding }),
    claimCheckoutStart: vi.fn().mockResolvedValue("claimed"),
    releaseCheckoutStart: vi.fn().mockResolvedValue(undefined),
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

function makeCompanyRepo(name: string | null = "Bergmann Steuern") {
  return {
    findCompanyOrThrow: vi.fn().mockResolvedValue({
      id: COMPANY_ID,
      name,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    }),
  };
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
      makeCompanyRepo() as never,
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
      email: mockUser.email,
      productName: "Bergmann Steuern",
      custom: { company_id: COMPANY_ID, company_signature: expect.stringMatching(/^[0-9a-f]{64}$/) },
      redirectUrl: "https://feat-inbox.customermates.com/en/settings/billing",
      expiresAt: expect.any(Date),
    });
  });

  it("names the checkout after the workspace so the payer can tell its subscriptions apart", async () => {
    const subscriptionService = makeSubscriptionService();
    const companyRepo = makeCompanyRepo("  Steuern 2026 ");
    const interactor = new CreateCheckoutSessionInteractor(
      subscriptionService as never,
      makeCheckoutRepo() as never,
      makeUserRepo() as never,
      companyRepo as never,
    );

    await interactor.invoke({ plan: "pro", cadence: "monthly" } as never);

    expect(companyRepo.findCompanyOrThrow).toHaveBeenCalledOnce();
    expect(subscriptionService.createCheckoutOrThrow.mock.calls[0][0]).toMatchObject({ productName: "Steuern 2026" });
  });

  it.each([null, "", "   "])("keeps the product's own name on the checkout of a workspace named %j", async (name) => {
    const subscriptionService = makeSubscriptionService();
    const interactor = new CreateCheckoutSessionInteractor(
      subscriptionService as never,
      makeCheckoutRepo() as never,
      makeUserRepo() as never,
      makeCompanyRepo(name) as never,
    );

    expect(await interactor.invoke({ plan: "pro", cadence: "monthly" } as never)).toMatchObject({
      redirect: "https://checkout.example.com",
    });
    expect(subscriptionService.createCheckoutOrThrow.mock.calls[0][0]).not.toHaveProperty("productName");
  });

  it("lets the checkout link expire a day after the start it records", async () => {
    const repo = makeCheckoutRepo();
    const subscriptionService = makeSubscriptionService();
    const interactor = new CreateCheckoutSessionInteractor(
      subscriptionService as never,
      repo as never,
      makeUserRepo() as never,
      makeCompanyRepo() as never,
    );

    await interactor.invoke({ plan: "pro", cadence: "monthly" } as never);

    const [{ startedAt }] = repo.claimCheckoutStart.mock.calls[0] as [{ startedAt: Date }];
    const { expiresAt } = subscriptionService.createCheckoutOrThrow.mock.calls[0][0] as { expiresAt: Date };
    expect(expiresAt.getTime() - startedAt.getTime()).toBe(15 * 60 * 1000);
  });

  it("signs the workspace id it puts into the checkout with the server secret", async () => {
    const subscriptionService = makeSubscriptionService();
    const interactor = new CreateCheckoutSessionInteractor(
      subscriptionService as never,
      makeCheckoutRepo() as never,
      makeUserRepo() as never,
      makeCompanyRepo() as never,
    );

    await interactor.invoke({ plan: "pro", cadence: "monthly" } as never);

    const { custom } = subscriptionService.createCheckoutOrThrow.mock.calls[0][0] as {
      custom: { company_id: string; company_signature: string };
    };
    expect(
      isCheckoutWorkspaceSignature(COMPANY_ID, custom.company_signature, MOCK_ENV_MODULE.env.BETTER_AUTH_SECRET),
    ).toBe(true);
    expect(
      isCheckoutWorkspaceSignature("another-company", custom.company_signature, MOCK_ENV_MODULE.env.BETTER_AUTH_SECRET),
    ).toBe(false);
  });

  it("falls back to the stable branch origin for an untrusted request origin", async () => {
    request.origin = "https://attacker.example";
    const subscriptionService = makeSubscriptionService();
    const interactor = new CreateCheckoutSessionInteractor(
      subscriptionService as never,
      makeCheckoutRepo() as never,
      makeUserRepo() as never,
      makeCompanyRepo() as never,
    );

    await interactor.invoke({ plan: "business", cadence: "monthly" } as never);

    expect(subscriptionService.createCheckoutOrThrow.mock.calls[0][0].redirectUrl).toBe(
      "https://customermates-git-feat-inbox-customermates.vercel.app/en/settings/billing",
    );
  });

  it("returns the payer to the billing page in the locale the checkout was started from", async () => {
    locale.value = "de";
    const subscriptionService = makeSubscriptionService();
    const interactor = new CreateCheckoutSessionInteractor(
      subscriptionService as never,
      makeCheckoutRepo() as never,
      makeUserRepo() as never,
      makeCompanyRepo() as never,
    );

    try {
      await interactor.invoke({ plan: "business", cadence: "monthly" } as never);
    } finally {
      locale.value = "en";
    }

    expect(subscriptionService.createCheckoutOrThrow.mock.calls[0][0].redirectUrl).toBe(
      "https://feat-inbox.customermates.com/de/settings/billing",
    );
  });

  it("rejects Enterprise before calling the provider", async () => {
    const subscriptionService = makeSubscriptionService();
    const repo = makeCheckoutRepo("enterprise");
    const interactor = new CreateCheckoutSessionInteractor(
      subscriptionService as never,
      repo as never,
      makeUserRepo() as never,
      makeCompanyRepo() as never,
    );

    await expect(interactor.invoke({ plan: "pro", cadence: "monthly" } as never)).resolves.toMatchObject({
      ok: false,
      error: { issues: [{ params: { error: "enterpriseCheckoutUnavailable" } }] },
    });
    expect(subscriptionService.createCheckoutOrThrow).not.toHaveBeenCalled();
    expect(repo.claimCheckoutStart).not.toHaveBeenCalled();
  });

  it("rejects annual checkout before calling the provider", async () => {
    const subscriptionService = makeSubscriptionService();
    const repo = makeCheckoutRepo();
    const interactor = new CreateCheckoutSessionInteractor(
      subscriptionService as never,
      repo as never,
      makeUserRepo() as never,
      makeCompanyRepo() as never,
    );

    const result = await interactor.invoke({
      plan: "business",
      cadence: "annual",
    } as never);

    expect(result).toMatchObject({ ok: false });
    expect(subscriptionService.createCheckoutOrThrow).not.toHaveBeenCalled();
    expect(repo.claimCheckoutStart).not.toHaveBeenCalled();
  });

  it("records the start of the checkout for the workspace before calling the provider", async () => {
    const repo = makeCheckoutRepo();
    const subscriptionService = makeSubscriptionService();
    const interactor = new CreateCheckoutSessionInteractor(
      subscriptionService as never,
      repo as never,
      makeUserRepo() as never,
      makeCompanyRepo() as never,
    );
    const before = Date.now();

    await interactor.invoke({ plan: "pro", cadence: "monthly" } as never);

    expect(repo.claimCheckoutStart).toHaveBeenCalledOnce();
    const [{ startedAt, pendingSince, lemonSqueezyId: binding }] = repo.claimCheckoutStart.mock.calls[0] as [
      { startedAt: Date; pendingSince: Date; lemonSqueezyId: string | null },
    ];
    expect(binding).toBeNull();
    expect(startedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(startedAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(startedAt.getTime() - pendingSince.getTime()).toBe(15 * 60 * 1000);
    expect(repo.claimCheckoutStart.mock.calls[0][0]).toMatchObject({ email: expect.stringContaining("@") });
    expect(repo.claimCheckoutStart).toHaveBeenCalledBefore(subscriptionService.createCheckoutOrThrow);
    expect(repo.releaseCheckoutStart).not.toHaveBeenCalled();
  });

  it("returns the pending state instead of a second checkout while a payment is being processed", async () => {
    const repo = makeCheckoutRepo("pro", new Date(Date.now() - 60_000));
    repo.claimCheckoutStart.mockResolvedValue("pending");
    const subscriptionService = makeSubscriptionService();
    const userRepo = makeUserRepo();
    const interactor = new CreateCheckoutSessionInteractor(
      subscriptionService as never,
      repo as never,
      userRepo as never,
      makeCompanyRepo() as never,
    );

    const result = await interactor.invoke({ plan: "business", cadence: "monthly" } as never);

    expect(result).toEqual({ ok: true, data: { checkout: "pending" } });
    expect(subscriptionService.createCheckoutOrThrow).not.toHaveBeenCalled();
    expect(userRepo.countActiveUsers).not.toHaveBeenCalled();
    expect(repo.releaseCheckoutStart).not.toHaveBeenCalled();
  });

  it("refuses a checkout while the workspace is being deleted", async () => {
    const repo = makeCheckoutRepo("pro", null);
    repo.claimCheckoutStart.mockResolvedValue("deleting");
    const subscriptionService = makeSubscriptionService();
    const interactor = new CreateCheckoutSessionInteractor(
      subscriptionService as never,
      repo as never,
      makeUserRepo() as never,
      makeCompanyRepo() as never,
    );

    const result = await interactor.invoke({ plan: "pro", cadence: "monthly" } as never);

    expect(result).toMatchObject({ ok: false });
    expect(subscriptionService.createCheckoutOrThrow).not.toHaveBeenCalled();
    expect(repo.releaseCheckoutStart).not.toHaveBeenCalled();
  });

  it("gives the recorded start back when the provider refuses the checkout", async () => {
    const previous = new Date(Date.now() - 20 * 60_000);
    const repo = makeCheckoutRepo("pro", previous);
    const subscriptionService = makeSubscriptionService();
    subscriptionService.createCheckoutOrThrow.mockRejectedValue(new Error("Failed to create checkout"));
    const interactor = new CreateCheckoutSessionInteractor(
      subscriptionService as never,
      repo as never,
      makeUserRepo() as never,
      makeCompanyRepo() as never,
    );

    await expect(interactor.invoke({ plan: "pro", cadence: "monthly" } as never)).rejects.toThrow(
      "Failed to create checkout",
    );

    const [{ startedAt }] = repo.claimCheckoutStart.mock.calls[0] as [{ startedAt: Date }];
    expect(repo.releaseCheckoutStart).toHaveBeenCalledExactlyOnceWith({ startedAt, previous });
  });

  it.each(["active", "trial", "pastDue"])(
    "answers that the workspace is already paid instead of a new checkout while its subscription is %s",
    async (status) => {
      const repo = makeCheckoutRepo("pro", null, { lemonSqueezyId: "sub-1", status });
      const subscriptionService = makeSubscriptionService();
      const interactor = new CreateCheckoutSessionInteractor(
        subscriptionService as never,
        repo as never,
        makeUserRepo() as never,
        makeCompanyRepo() as never,
      );

      const result = await interactor.invoke({ plan: "business", cadence: "monthly" } as never);

      expect(result).toEqual({ ok: true, data: { checkout: "active" } });
      expect(repo.claimCheckoutStart).not.toHaveBeenCalled();
      expect(subscriptionService.createCheckoutOrThrow).not.toHaveBeenCalled();
    },
  );

  it.each(["expired", "cancelled", "unPaid"])(
    "opens a new checkout for a workspace whose subscription is %s",
    async (status) => {
      const repo = makeCheckoutRepo("pro", null, { lemonSqueezyId: "sub-1", status });
      const subscriptionService = makeSubscriptionService();
      const interactor = new CreateCheckoutSessionInteractor(
        subscriptionService as never,
        repo as never,
        makeUserRepo() as never,
        makeCompanyRepo() as never,
      );

      expect(await interactor.invoke({ plan: "business", cadence: "monthly" } as never)).toMatchObject({
        redirect: "https://checkout.example.com",
      });
    },
  );

  it("opens a checkout for a workspace that holds a subscription whose trial date passed", async () => {
    const repo = makeCheckoutRepo("pro", null, {
      lemonSqueezyId: "sub-1",
      status: "trial",
      trialEndDate: new Date(Date.now() - 60_000),
    });
    const subscriptionService = makeSubscriptionService();
    const interactor = new CreateCheckoutSessionInteractor(
      subscriptionService as never,
      repo as never,
      makeUserRepo() as never,
      makeCompanyRepo() as never,
    );

    expect(await interactor.invoke({ plan: "pro", cadence: "monthly" } as never)).toMatchObject({
      redirect: "https://checkout.example.com",
    });
    expect(repo.claimCheckoutStart.mock.calls[0][0]).toMatchObject({ lemonSqueezyId: "sub-1" });
  });

  it("opens a checkout for a workspace whose paid subscription was paused and synced as unpaid without a trial end", async () => {
    const repo = makeCheckoutRepo("pro", null, { lemonSqueezyId: "sub-1", status: "unPaid", trialEndDate: null });
    const subscriptionService = makeSubscriptionService();
    const interactor = new CreateCheckoutSessionInteractor(
      subscriptionService as never,
      repo as never,
      makeUserRepo() as never,
      makeCompanyRepo() as never,
    );

    expect(await interactor.invoke({ plan: "pro", cadence: "monthly" } as never)).toMatchObject({
      redirect: "https://checkout.example.com",
    });
  });
});
