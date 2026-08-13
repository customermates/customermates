import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_ZOD_MODULE,
  MOCK_PRISMA_DB_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const COMPANY_ID = "00000000-0000-4000-8000-000000000001";
const WEBHOOK_SECRET = "test-webhook-secret";
const mockUser = createMockUser({ companyId: COMPANY_ID });
const request = vi.hoisted(() => ({
  origin: "https://feat-inbox.customermates.com",
}));
const mockCaptureException = vi.hoisted(() => vi.fn());

vi.mock("@/env", () => ({
  env: {
    ...MOCK_ENV_MODULE.env,
    BASE_URL: "https://customermates-git-feat-inbox-customermates.vercel.app",
    AUTH_ALLOWED_HOSTS: ["customermates-git-feat-inbox-customermates.vercel.app", "*.customermates.com"],
    LEMONSQUEEZY_VARIANT_ID_STARTER: "2001",
    LEMONSQUEEZY_VARIANT_ID_PRO: "2002",
    LEMONSQUEEZY_VARIANT_ID_BUSINESS: "2003",
    LEMONSQUEEZY_WEBHOOK_SECRET: WEBHOOK_SECRET,
  },
}));
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next/headers", () => ({
  headers: () => new Headers({ origin: request.origin }),
}));
vi.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

const { CreateCheckoutSessionInteractor } = await import("../create-checkout-session.interactor");
const { CHECKOUT_SESSION_TTL_MINUTES } = await import("@/core/commercial/plan-catalog");
const { createCheckoutReservation, parseCheckoutReservationMarker } = await import("../checkout-reservation");

function makeCheckoutRepo(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    getSubscriptionOrThrow: vi.fn().mockResolvedValue({
      plan: "pro",
      lemonSqueezyId: null,
    }),
    claimCheckoutReservationOrThrow: vi.fn().mockImplementation((options) => ({
      reservation: createCheckoutReservation({
        secret: options.secret,
        companyId: COMPANY_ID,
        offer: options.offer,
        quantity: 4,
        checkoutExpiresAt: options.checkoutExpiresAt,
        bindingExpiresAt: options.bindingExpiresAt,
      }),
      quantity: 4,
    })),
    releaseCheckoutReservationIfMatches: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function makeSubscriptionService() {
  return {
    createCheckoutOrThrow: vi.fn().mockResolvedValue({
      data: { attributes: { url: "https://checkout.example.com" } },
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  request.origin = "https://feat-inbox.customermates.com";
});

describe("CreateCheckoutSessionInteractor", () => {
  it("creates one checkout for the selected offer and active seats", async () => {
    const repo = makeCheckoutRepo();
    const subscriptionService = makeSubscriptionService();
    const interactor = new CreateCheckoutSessionInteractor(subscriptionService as never, repo as never);
    const before = Date.now();

    const result = await interactor.invoke({
      plan: "business",
      cadence: "monthly",
    } as never);
    const after = Date.now();

    expect(result).toMatchObject({ redirect: "https://checkout.example.com" });
    expect(repo.claimCheckoutReservationOrThrow).toHaveBeenCalledTimes(1);
    expect(repo.claimCheckoutReservationOrThrow).toHaveBeenCalledWith({
      secret: WEBHOOK_SECRET,
      offer: expect.objectContaining({ id: "business:monthly" }),
      checkoutExpiresAt: expect.any(Date),
      bindingExpiresAt: expect.any(Date),
      now: expect.any(Date),
    });
    expect(subscriptionService.createCheckoutOrThrow).toHaveBeenCalledTimes(1);
    const checkoutInput = subscriptionService.createCheckoutOrThrow.mock.calls[0][0];
    const claimedReservation = await repo.claimCheckoutReservationOrThrow.mock.results[0].value;
    const parsedReservation = parseCheckoutReservationMarker(claimedReservation.reservation.marker);
    expect(checkoutInput).toMatchObject({
      offer: expect.objectContaining({ id: "business:monthly" }),
      quantity: 4,
      custom: {
        company_id: COMPANY_ID,
        checkout_token: claimedReservation.reservation.token,
      },
      redirectUrl: "https://feat-inbox.customermates.com/company/subscription",
    });
    expect(parsedReservation).toMatchObject({
      token: checkoutInput.custom.checkout_token,
      payload: {
        companyId: COMPANY_ID,
        offerId: "business:monthly",
        quantity: 4,
      },
    });
    expect(checkoutInput.expiresAt.getTime()).toBeGreaterThanOrEqual(before + CHECKOUT_SESSION_TTL_MINUTES * 60 * 1000);
    expect(checkoutInput.expiresAt.getTime()).toBeLessThanOrEqual(after + CHECKOUT_SESSION_TTL_MINUTES * 60 * 1000);
  });

  it("falls back to the stable branch origin for an untrusted request origin", async () => {
    request.origin = "https://attacker.example";
    const repo = makeCheckoutRepo();
    const subscriptionService = makeSubscriptionService();
    const interactor = new CreateCheckoutSessionInteractor(subscriptionService as never, repo as never);

    await interactor.invoke({ plan: "business", cadence: "monthly" } as never);

    expect(subscriptionService.createCheckoutOrThrow.mock.calls[0][0].redirectUrl).toBe(
      "https://customermates-git-feat-inbox-customermates.vercel.app/company/subscription",
    );
  });

  it("rejects a workspace with an existing provider subscription", async () => {
    const repo = makeCheckoutRepo({
      getSubscriptionOrThrow: vi.fn().mockResolvedValue({
        plan: "pro",
        lemonSqueezyId: "sub-1",
      }),
    });
    const subscriptionService = makeSubscriptionService();
    const interactor = new CreateCheckoutSessionInteractor(subscriptionService as never, repo as never);

    await expect(interactor.invoke({ plan: "pro", cadence: "monthly" } as never)).rejects.toThrow("customer portal");
    expect(subscriptionService.createCheckoutOrThrow).not.toHaveBeenCalled();
  });

  it("rejects Enterprise before calling the provider", async () => {
    const repo = makeCheckoutRepo({
      getSubscriptionOrThrow: vi.fn().mockResolvedValue({
        plan: "enterprise",
        lemonSqueezyId: null,
      }),
    });
    const subscriptionService = makeSubscriptionService();
    const interactor = new CreateCheckoutSessionInteractor(subscriptionService as never, repo as never);

    await expect(interactor.invoke({ plan: "pro", cadence: "monthly" } as never)).rejects.toThrow("Enterprise");
    expect(subscriptionService.createCheckoutOrThrow).not.toHaveBeenCalled();
  });

  it("rejects annual checkout before calling the provider", async () => {
    const repo = makeCheckoutRepo();
    const subscriptionService = makeSubscriptionService();
    const interactor = new CreateCheckoutSessionInteractor(subscriptionService as never, repo as never);

    const result = await interactor.invoke({
      plan: "business",
      cadence: "annual",
    } as never);

    expect(result).toMatchObject({ ok: false });
    expect(subscriptionService.createCheckoutOrThrow).not.toHaveBeenCalled();
  });

  it("does not call the provider when the reservation claim fails", async () => {
    const repo = makeCheckoutRepo({
      claimCheckoutReservationOrThrow: vi.fn().mockRejectedValue(new Error("A checkout is already in progress")),
    });
    const subscriptionService = makeSubscriptionService();
    const interactor = new CreateCheckoutSessionInteractor(subscriptionService as never, repo as never);

    await expect(interactor.invoke({ plan: "pro", cadence: "monthly" } as never)).rejects.toThrow(
      "already in progress",
    );
    expect(subscriptionService.createCheckoutOrThrow).not.toHaveBeenCalled();
    expect(repo.releaseCheckoutReservationIfMatches).not.toHaveBeenCalled();
  });

  it("releases the exact reservation after a provider failure so checkout can be retried", async () => {
    let activeMarker: string | null = null;
    const claimCheckoutReservationOrThrow = vi.fn().mockImplementation((options) => {
      if (activeMarker) throw new Error("A checkout is already in progress");

      const reservation = createCheckoutReservation({
        secret: options.secret,
        companyId: COMPANY_ID,
        offer: options.offer,
        quantity: 4,
        checkoutExpiresAt: options.checkoutExpiresAt,
        bindingExpiresAt: options.bindingExpiresAt,
      });
      activeMarker = reservation.marker;

      return { reservation, quantity: 4 };
    });
    const releaseCheckoutReservationIfMatches = vi.fn().mockImplementation((marker: string) => {
      if (activeMarker !== marker) return false;

      activeMarker = null;
      return true;
    });
    const repo = makeCheckoutRepo({
      claimCheckoutReservationOrThrow,
      releaseCheckoutReservationIfMatches,
    });
    const providerError = new Error("Provider checkout failed");
    const subscriptionService = makeSubscriptionService();
    subscriptionService.createCheckoutOrThrow.mockRejectedValueOnce(providerError);
    const interactor = new CreateCheckoutSessionInteractor(subscriptionService as never, repo as never);

    await expect(interactor.invoke({ plan: "pro", cadence: "monthly" } as never)).rejects.toBe(providerError);
    const firstClaim = await claimCheckoutReservationOrThrow.mock.results[0].value;
    expect(releaseCheckoutReservationIfMatches).toHaveBeenCalledWith(firstClaim.reservation.marker);

    await expect(interactor.invoke({ plan: "pro", cadence: "monthly" } as never)).resolves.toMatchObject({
      redirect: "https://checkout.example.com",
    });
    expect(claimCheckoutReservationOrThrow).toHaveBeenCalledTimes(2);
  });

  it("preserves the provider error when releasing the reservation also fails", async () => {
    const providerError = new Error("Provider checkout failed");
    const releaseError = new Error("Reservation release failed");
    const repo = makeCheckoutRepo({
      releaseCheckoutReservationIfMatches: vi.fn().mockRejectedValue(releaseError),
    });
    const subscriptionService = makeSubscriptionService();
    subscriptionService.createCheckoutOrThrow.mockRejectedValue(providerError);
    const interactor = new CreateCheckoutSessionInteractor(subscriptionService as never, repo as never);

    await expect(interactor.invoke({ plan: "pro", cadence: "monthly" } as never)).rejects.toBe(providerError);
    expect(mockCaptureException).toHaveBeenCalledWith(releaseError, {
      tags: { kind: "checkout-reservation-release-failure" },
    });
  });
});
