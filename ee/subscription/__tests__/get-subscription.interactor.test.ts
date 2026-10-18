import { beforeEach, describe, expect, it, vi } from "vitest";

import { Action, Resource } from "@/generated/prisma";

import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_ZOD_MODULE,
  MOCK_PRISMA_DB_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => ({ env: { ...MOCK_ENV_MODULE.env } }));
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve({ raw: (key: string) => key }),
}));

const { GetSubscriptionInteractor } = await import("../get-subscription.interactor");
const { GetBillingPortalUrlInteractor } = await import("../get-billing-portal-url.interactor");
const { runWithTenant } = await import("@/core/decorators/tenant-context");

const PORTAL_URL = "https://billing.example/billing?signature=abc";
const PAYMENT_DETAILS_URL = "https://billing.example/subscription/1/payment-details?signature=def";

function subscriptionRow(overrides: Record<string, unknown> = {}) {
  return {
    status: "active",
    plan: "pro",
    quantity: 3,
    trialEndDate: null,
    currentPeriodEnd: null,
    lemonSqueezyId: "ls-1",
    ...overrides,
  };
}

function makeSubscription(overrides: Record<string, unknown> = {}) {
  const repo = { getSubscriptionOrThrow: vi.fn().mockResolvedValue(subscriptionRow(overrides)) };
  const userRepo = { countActiveUsers: vi.fn().mockResolvedValue(3) };

  return new GetSubscriptionInteractor(repo as never, userRepo as never);
}

function providerAttributes(overrides: Record<string, unknown> = {}) {
  return {
    user_email: "payer@example.invalid",
    urls: { customer_portal: PORTAL_URL, update_payment_method: PAYMENT_DETAILS_URL },
    ...overrides,
  };
}

function makePortal(overrides: Record<string, unknown> = {}, attributes = providerAttributes()) {
  const repo = { getSubscriptionOrThrow: vi.fn().mockResolvedValue(subscriptionRow(overrides)) };
  const lemonSqueezyService = {
    getSubscriptionOrThrowUnscoped: vi.fn().mockResolvedValue({ data: { attributes } }),
  };

  return {
    interactor: new GetBillingPortalUrlInteractor(repo as never, lemonSqueezyService as never),
    lemonSqueezyService,
  };
}

const readOnlyMember = () => ({
  ...createMockUserWithPermissions([
    { resource: Resource.company, action: Action.readOwn },
    { resource: Resource.company, action: Action.readAll },
  ]),
  id: mockUser.id,
  companyId: mockUser.companyId,
});

const billingManager = () => ({
  ...createMockUserWithPermissions([
    { resource: Resource.company, action: Action.readOwn },
    { resource: Resource.company, action: Action.update },
  ]),
  id: mockUser.id,
  companyId: mockUser.companyId,
});

beforeEach(() => vi.clearAllMocks());

describe("GetSubscriptionInteractor", () => {
  it("reports the plan and seats to a member who may only read the company", async () => {
    const result = await runWithTenant(readOnlyMember(), () => makeSubscription().invoke());

    expect(result.data).toMatchObject({ plan: "pro", status: "active", activeUsers: 3, hasActiveSubscription: true });
  });

  it("says a billing portal exists without reaching the billing provider", async () => {
    const result = await runWithTenant(readOnlyMember(), () => makeSubscription().invoke());

    expect(result.data.hasBillingPortal).toBe(true);
    expect(result.data).not.toHaveProperty("customerPortalUrl");
  });

  it("reports no billing portal for an enterprise plan, which is contracted rather than self-serve", async () => {
    const result = await runWithTenant(billingManager(), () => makeSubscription({ plan: "enterprise" }).invoke());

    expect(result.data.hasBillingPortal).toBe(false);
  });

  it("reports no billing portal when the workspace has no billing subscription", async () => {
    const result = await runWithTenant(billingManager(), () => makeSubscription({ lemonSqueezyId: null }).invoke());

    expect(result.data.hasBillingPortal).toBe(false);
  });

  it("reports no checkout when the workspace has not started one", async () => {
    const result = await runWithTenant(readOnlyMember(), () =>
      makeSubscription({ lemonSqueezyId: null, checkoutStartedAt: null }).invoke(),
    );

    expect(result.data.checkout).toBe("none");
  });

  it("reports a checkout started minutes ago as pending to every member who can read the company", async () => {
    const startedAt = new Date(Date.now() - 5 * 60_000);

    for (const member of [readOnlyMember(), billingManager()]) {
      const result = await runWithTenant(member, () =>
        makeSubscription({ lemonSqueezyId: null, checkoutStartedAt: startedAt }).invoke(),
      );
      expect(result.data.checkout).toBe("pending");
    }
  });

  it("reports a checkout started more than fifteen minutes ago as overdue", async () => {
    const result = await runWithTenant(billingManager(), () =>
      makeSubscription({ lemonSqueezyId: null, checkoutStartedAt: new Date(Date.now() - 16 * 60_000) }).invoke(),
    );

    expect(result.data.checkout).toBe("overdue");
  });
});

describe("GetBillingPortalUrlInteractor", () => {
  it("refuses a member who cannot act on the company, at the decorator", async () => {
    const { interactor, lemonSqueezyService } = makePortal();

    await expect(runWithTenant(readOnlyMember(), () => interactor.invoke())).rejects.toThrow(/update on company/);
    expect(lemonSqueezyService.getSubscriptionOrThrowUnscoped).not.toHaveBeenCalled();
  });

  it("redirects the admin who pays the subscription to their own Lemon Squeezy portal", async () => {
    const { interactor, lemonSqueezyService } = makePortal(
      {},
      providerAttributes({ user_email: billingManager().email }),
    );

    const result = await runWithTenant(billingManager(), () => interactor.invoke());

    expect(result).toEqual({ redirect: PORTAL_URL });
    expect(lemonSqueezyService.getSubscriptionOrThrowUnscoped).toHaveBeenCalledExactlyOnceWith("ls-1");
  });

  it("redirects another admin only to the payment details of this subscription, never to the payer's portal", async () => {
    const { interactor, lemonSqueezyService } = makePortal();

    const result = await runWithTenant(billingManager(), () => interactor.invoke());

    expect(result).toEqual({ redirect: PAYMENT_DETAILS_URL });
    expect(lemonSqueezyService.getSubscriptionOrThrowUnscoped).toHaveBeenCalledExactlyOnceWith("ls-1");
  });

  it("recognises the payer whatever the case and the spaces around the e-mail", async () => {
    const payer = { ...billingManager(), email: "Clara.Admin@Example.com" };
    const { interactor } = makePortal({}, providerAttributes({ user_email: " clara.admin@EXAMPLE.com " }));

    await expect(runWithTenant(payer, () => interactor.invoke())).resolves.toEqual({ redirect: PORTAL_URL });
  });

  it.each([null, undefined, "", "  "])(
    "treats a subscription whose payer e-mail is %j as paid by someone else",
    async (payerEmail) => {
      const { interactor } = makePortal({}, providerAttributes({ user_email: payerEmail }));

      await expect(runWithTenant(billingManager(), () => interactor.invoke())).resolves.toEqual({
        redirect: PAYMENT_DETAILS_URL,
      });
    },
  );

  it("rejects the payer when the billing provider returns no portal url, instead of another link", async () => {
    const { interactor } = makePortal(
      {},
      providerAttributes({
        user_email: billingManager().email,
        urls: { customer_portal: null, update_payment_method: PAYMENT_DETAILS_URL },
      }),
    );

    await expect(runWithTenant(billingManager(), () => interactor.invoke())).resolves.toMatchObject({
      ok: false,
      error: { issues: [{ params: { error: "billingPortalUnavailable" } }] },
    });
  });

  it("rejects another admin when the billing provider returns no payment details url, instead of the portal", async () => {
    const { interactor } = makePortal(
      {},
      providerAttributes({ urls: { customer_portal: PORTAL_URL, update_payment_method: "" } }),
    );

    const result = await runWithTenant(billingManager(), () => interactor.invoke());

    expect(result).toMatchObject({
      ok: false,
      error: { issues: [{ params: { error: "billingPortalUnavailable" } }] },
    });
    expect(result).not.toHaveProperty("redirect");
  });

  it("rejects an enterprise plan before calling the billing provider", async () => {
    const { interactor, lemonSqueezyService } = makePortal({ plan: "enterprise" });

    await expect(runWithTenant(billingManager(), () => interactor.invoke())).resolves.toMatchObject({
      ok: false,
      error: { issues: [{ params: { error: "billingPortalUnavailable" } }] },
    });
    expect(lemonSqueezyService.getSubscriptionOrThrowUnscoped).not.toHaveBeenCalled();
  });

  it("rejects a workspace without a billing subscription before calling the billing provider", async () => {
    const { interactor, lemonSqueezyService } = makePortal({ lemonSqueezyId: null });

    await expect(runWithTenant(billingManager(), () => interactor.invoke())).resolves.toMatchObject({
      ok: false,
      error: { issues: [{ params: { error: "billingPortalUnavailable" } }] },
    });
    expect(lemonSqueezyService.getSubscriptionOrThrowUnscoped).not.toHaveBeenCalled();
  });

  it("rejects when the billing provider returns no portal url", async () => {
    const { interactor, lemonSqueezyService } = makePortal();
    lemonSqueezyService.getSubscriptionOrThrowUnscoped.mockResolvedValue({ data: { attributes: { urls: null } } });

    await expect(runWithTenant(billingManager(), () => interactor.invoke())).resolves.toMatchObject({
      ok: false,
      error: { issues: [{ params: { error: "billingPortalUnavailable" } }] },
    });
  });
});
