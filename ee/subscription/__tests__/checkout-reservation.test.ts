import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";

const COMPANY_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_COMPANY_ID = "00000000-0000-4000-8000-000000000002";
const WEBHOOK_SECRET = "test-webhook-secret";

const prismaMock = {
  subscription: {
    findUniqueOrThrow: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  },
  user: {
    count: vi.fn().mockResolvedValue(4),
  },
};

vi.mock("@/prisma/db", () => ({ prisma: prismaMock }));
vi.mock("@/core/decorators/transaction.decorator", () => ({
  Transaction: () => undefined,
}));

const {
  checkoutReservationMatches,
  createCheckoutReservation,
  parseCheckoutReservationMarker,
  verifyCheckoutReservation,
} = await import("../checkout-reservation");
const { getCommercialOfferOrThrow } = await import("@/core/commercial/plan-catalog");
const { runWithTenant } = await import("@/core/decorators/tenant-context");
const { PrismaCompanyRepo } = await import("@/features/company/prisma-company.repository");

const PRO_OFFER = getCommercialOfferOrThrow("pro", "monthly");
const BUSINESS_OFFER = getCommercialOfferOrThrow("business", "monthly");

function createReservation(
  options: {
    companyId?: string;
    quantity?: number;
    bindingExpiresAt?: Date;
  } = {},
) {
  return createCheckoutReservation({
    secret: WEBHOOK_SECRET,
    companyId: options.companyId ?? COMPANY_ID,
    offer: PRO_OFFER,
    quantity: options.quantity ?? 4,
    checkoutExpiresAt: new Date("2099-01-01T00:30:00.000Z"),
    bindingExpiresAt: options.bindingExpiresAt ?? new Date("2099-01-01T01:00:00.000Z"),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.subscription.findUniqueOrThrow.mockResolvedValue({
    plan: "pro",
    lemonSqueezyId: null,
    lemonSqueezyVariantId: null,
  });
  prismaMock.subscription.update.mockResolvedValue({});
  prismaMock.subscription.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.user.count.mockResolvedValue(4);
});

describe("checkout reservation", () => {
  it("round-trips a signed company, offer, quantity, and expiry snapshot", () => {
    const reservation = createReservation();

    expect(parseCheckoutReservationMarker(reservation.marker)).toEqual(reservation);
    expect(
      verifyCheckoutReservation({
        marker: reservation.marker,
        token: reservation.token,
        secret: WEBHOOK_SECRET,
        companyId: COMPANY_ID,
        now: new Date("2098-12-31T00:00:00.000Z"),
      }),
    ).toEqual(reservation);
    expect(
      checkoutReservationMatches({
        marker: reservation.marker,
        token: reservation.token,
        secret: WEBHOOK_SECRET,
        companyId: COMPANY_ID,
        offer: PRO_OFFER,
        quantity: 4,
        now: new Date("2098-12-31T00:00:00.000Z"),
      }),
    ).toBe(true);
  });

  it.each([
    {
      label: "missing token",
      options: (reservation: ReturnType<typeof createReservation>) => ({
        marker: reservation.marker,
        token: undefined,
        companyId: COMPANY_ID,
        offer: PRO_OFFER,
        quantity: 4,
        now: new Date("2098-12-31T00:00:00.000Z"),
      }),
    },
    {
      label: "tampered token",
      options: (reservation: ReturnType<typeof createReservation>) => ({
        marker: reservation.marker,
        token: "f".repeat(64),
        companyId: COMPANY_ID,
        offer: PRO_OFFER,
        quantity: 4,
        now: new Date("2098-12-31T00:00:00.000Z"),
      }),
    },
    {
      label: "wrong company",
      options: (reservation: ReturnType<typeof createReservation>) => ({
        marker: reservation.marker,
        token: reservation.token,
        companyId: OTHER_COMPANY_ID,
        offer: PRO_OFFER,
        quantity: 4,
        now: new Date("2098-12-31T00:00:00.000Z"),
      }),
    },
    {
      label: "wrong offer",
      options: (reservation: ReturnType<typeof createReservation>) => ({
        marker: reservation.marker,
        token: reservation.token,
        companyId: COMPANY_ID,
        offer: BUSINESS_OFFER,
        quantity: 4,
        now: new Date("2098-12-31T00:00:00.000Z"),
      }),
    },
    {
      label: "wrong quantity",
      options: (reservation: ReturnType<typeof createReservation>) => ({
        marker: reservation.marker,
        token: reservation.token,
        companyId: COMPANY_ID,
        offer: PRO_OFFER,
        quantity: 5,
        now: new Date("2098-12-31T00:00:00.000Z"),
      }),
    },
    {
      label: "expired reservation",
      options: (reservation: ReturnType<typeof createReservation>) => ({
        marker: reservation.marker,
        token: reservation.token,
        companyId: COMPANY_ID,
        offer: PRO_OFFER,
        quantity: 4,
        now: new Date("2100-01-01T00:00:00.000Z"),
      }),
    },
  ])("rejects a $label", ({ options }) => {
    const reservation = createReservation();

    expect(
      checkoutReservationMatches({
        secret: WEBHOOK_SECRET,
        ...options(reservation),
      }),
    ).toBe(false);
  });

  it("rejects a non-UUID company before it can be persisted", () => {
    expect(() => createReservation({ companyId: "company-1" })).toThrow();
  });
});

describe("PrismaCompanyRepo checkout reservation", () => {
  it("claims the current active-seat quantity and stores its signed marker", async () => {
    const user = createMockUser({ companyId: COMPANY_ID });
    const repo = new PrismaCompanyRepo();
    const checkoutExpiresAt = new Date("2099-01-01T00:30:00.000Z");
    const bindingExpiresAt = new Date("2099-01-01T01:00:00.000Z");

    const result = await runWithTenant(user, () =>
      repo.claimCheckoutReservationOrThrow({
        secret: WEBHOOK_SECRET,
        offer: PRO_OFFER,
        checkoutExpiresAt,
        bindingExpiresAt,
        now: new Date("2099-01-01T00:00:00.000Z"),
      }),
    );

    expect(result.quantity).toBe(4);
    expect(result.reservation.payload).toEqual({
      companyId: COMPANY_ID,
      offerId: "pro:monthly",
      quantity: 4,
      checkoutExpiresAt: checkoutExpiresAt.toISOString(),
      bindingExpiresAt: bindingExpiresAt.toISOString(),
    });
    expect(
      checkoutReservationMatches({
        marker: result.reservation.marker,
        token: result.reservation.token,
        secret: WEBHOOK_SECRET,
        companyId: COMPANY_ID,
        offer: PRO_OFFER,
        quantity: 4,
        now: new Date("2099-01-01T00:15:00.000Z"),
      }),
    ).toBe(true);
    expect(prismaMock.user.count).toHaveBeenCalledWith({
      where: { companyId: COMPANY_ID, status: "active" },
    });
    expect(prismaMock.subscription.update).toHaveBeenCalledWith({
      where: { companyId: COMPANY_ID },
      data: { lemonSqueezyVariantId: result.reservation.marker },
    });
  });

  it("releases only the exact reservation while the subscription is still unbound", async () => {
    const user = createMockUser({ companyId: COMPANY_ID });
    const repo = new PrismaCompanyRepo();
    const marker = createReservation().marker;

    const released = await runWithTenant(user, () => repo.releaseCheckoutReservationIfMatches(marker));

    expect(released).toBe(true);
    expect(prismaMock.subscription.updateMany).toHaveBeenCalledWith({
      where: {
        companyId: COMPANY_ID,
        lemonSqueezyId: null,
        lemonSqueezyVariantId: marker,
      },
      data: { lemonSqueezyVariantId: null },
    });
  });

  it("does not release a stale marker after a newer reservation wins the race", async () => {
    prismaMock.subscription.updateMany.mockResolvedValue({ count: 0 });
    const user = createMockUser({ companyId: COMPANY_ID });
    const repo = new PrismaCompanyRepo();
    const staleMarker = createReservation().marker;

    const released = await runWithTenant(user, () => repo.releaseCheckoutReservationIfMatches(staleMarker));

    expect(released).toBe(false);
    expect(prismaMock.subscription.updateMany).toHaveBeenCalledWith({
      where: {
        companyId: COMPANY_ID,
        lemonSqueezyId: null,
        lemonSqueezyVariantId: staleMarker,
      },
      data: { lemonSqueezyVariantId: null },
    });
  });

  it("does not release a reservation after the provider subscription has been bound", async () => {
    prismaMock.subscription.updateMany.mockResolvedValue({ count: 0 });
    const user = createMockUser({ companyId: COMPANY_ID });
    const repo = new PrismaCompanyRepo();
    const marker = createReservation().marker;

    const released = await runWithTenant(user, () => repo.releaseCheckoutReservationIfMatches(marker));

    expect(released).toBe(false);
    expect(prismaMock.subscription.updateMany).toHaveBeenCalledWith({
      where: {
        companyId: COMPANY_ID,
        lemonSqueezyId: null,
        lemonSqueezyVariantId: marker,
      },
      data: { lemonSqueezyVariantId: null },
    });
  });
});
