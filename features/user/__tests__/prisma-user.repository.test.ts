import { describe, it, expect, vi, beforeEach } from "vitest";

import { CustomColumnType, EntityType, Status, SubscriptionStatus } from "@/generated/prisma";

import { CHIP_COLORS } from "@/constants/chip-colors";
import { CLOUD_TRIAL, SELF_HOSTED_BASELINE_PLAN } from "@/core/commercial/plan-catalog";
import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";

const customColumnCreate = vi.fn().mockResolvedValue({ id: "column-1" });

const prismaMock = {
  user: {
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: "user-1" }),
    update: vi.fn().mockResolvedValue({ id: "user-1" }),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "user-1", email: "owner@example.com" }),
  },
  company: { create: vi.fn().mockResolvedValue({ id: "company-1" }) },
  userRole: { create: vi.fn().mockResolvedValue({ id: "role-1" }) },
  subscription: {
    create: vi.fn().mockResolvedValue({ id: "subscription-1" }),
    findUniqueOrThrow: vi.fn().mockResolvedValue({ lemonSqueezyVariantId: null }),
  },
  customColumn: { create: customColumnCreate },
};

vi.mock("@/prisma/db", () => ({ prisma: prismaMock }));
vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
}));
vi.mock("@/core/decorators/transaction.decorator", () => ({
  Transaction: () => undefined,
}));

const { PrismaUserRepo } = await import("../prisma-user.repository");
const { createCheckoutReservation } = await import("@/ee/subscription/checkout-reservation");
const { getCommercialOfferOrThrow } = await import("@/core/commercial/plan-catalog");

const registerArgs = {
  email: "owner@example.com",
  firstName: "Owner",
  lastName: "Example",
  country: "de",
  agreeToTerms: true,
  avatarUrl: null,
} as Parameters<InstanceType<typeof PrismaUserRepo>["createCompanyAndUser"]>[0];

describe("PrismaUserRepo.createCompanyAndUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (MOCK_ENV_MODULE.env as { APP_MODE: "cloud" | "demo" | "self-hosted" }).APP_MODE = "cloud";
  });

  it("gives a new workspace the select fields a CRM is expected to have", async () => {
    await new PrismaUserRepo().createCompanyAndUser(registerArgs);

    const created = customColumnCreate.mock.calls.map((call) => call[0].data);

    expect(created.map((data) => data.entityType)).toEqual([EntityType.contact, EntityType.deal, EntityType.task]);
    expect(created.every((data) => data.type === CustomColumnType.singleSelect)).toBe(true);
    expect(created.every((data) => data.companyId === "company-1")).toBe(true);
  });

  it("takes every label from the translator so it follows the locale", async () => {
    await new PrismaUserRepo().createCompanyAndUser(registerArgs);

    const created = customColumnCreate.mock.calls.map((call) => call[0].data);

    for (const data of created) {
      expect(data.label).toBe(`Common.defaultData.${data.entityType}.columnLabel`);
      for (const option of data.options.options)
        expect(option.label).toMatch(new RegExp(`^Common\\.defaultData\\.${data.entityType}\\.options\\.`));
    }
  });

  it("gives every field exactly one default option and distinct option values", async () => {
    await new PrismaUserRepo().createCompanyAndUser(registerArgs);

    const created = customColumnCreate.mock.calls.map((call) => call[0].data);

    for (const data of created) {
      const options = data.options.options as Array<{
        isDefault: boolean;
        value: string;
        color: string;
      }>;

      expect(options.length).toBeGreaterThan(1);
      for (const option of options as Array<{ color: string }>) expect(CHIP_COLORS).toContain(option.color);
      expect(options.filter((option) => option.isDefault)).toHaveLength(1);
      expect(options[0].isDefault).toBe(true);
      expect(new Set(options.map((option) => option.value)).size).toBe(options.length);
    }
  });

  it("provisions the workspace without seeding demo records", async () => {
    await new PrismaUserRepo().createCompanyAndUser(registerArgs);

    expect(prismaMock.company.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.userRole.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.user.create).toHaveBeenCalledTimes(1);
    expect(customColumnCreate).toHaveBeenCalledTimes(3);
  });

  it("creates a cloud workspace on the catalog-owned Pro trial", async () => {
    const before = Date.now();
    await new PrismaUserRepo().createCompanyAndUser(registerArgs);
    const after = Date.now();

    const data = prismaMock.subscription.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ plan: CLOUD_TRIAL.plan, status: "trial" });
    expect(data.trialEndDate.getTime()).toBeGreaterThanOrEqual(before + CLOUD_TRIAL.days * 24 * 60 * 60 * 1000);
    expect(data.trialEndDate.getTime()).toBeLessThanOrEqual(after + CLOUD_TRIAL.days * 24 * 60 * 60 * 1000);
  });

  it("creates a self-hosted workspace on the catalog-owned baseline plan", async () => {
    (MOCK_ENV_MODULE.env as { APP_MODE: "cloud" | "demo" | "self-hosted" }).APP_MODE = "self-hosted";

    await new PrismaUserRepo().createCompanyAndUser(registerArgs);

    expect(prismaMock.subscription.create).toHaveBeenCalledWith({
      data: {
        companyId: "company-1",
        status: "active",
        plan: SELF_HOSTED_BASELINE_PLAN,
        trialEndDate: null,
      },
    });
  });
});

describe("PrismaUserRepo.findActiveLegalNoticeRecipientsUnscoped", () => {
  it("returns the UTC creation timestamp needed for historical-notice suppression", async () => {
    const createdAt = new Date("2026-08-07T23:59:59.000Z");
    prismaMock.user.findMany.mockResolvedValueOnce([
      {
        id: "user-1",
        companyId: "company-1",
        createdAt,
        email: "owner@example.com",
        firstName: "Owner",
        displayLanguage: "en",
        formattingLocale: "de",
        role: { isSystemRole: true },
      },
    ]);

    await expect(new PrismaUserRepo().findActiveLegalNoticeRecipientsUnscoped()).resolves.toEqual([
      expect.objectContaining({
        id: "user-1",
        createdAt,
        formattingLocale: "de",
        isSystemAdministrator: true,
      }),
    ]);
    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: Status.active },
        select: expect.objectContaining({
          createdAt: true,
          formattingLocale: true,
        }),
      }),
    );
  });
});

describe("PrismaUserRepo.findUsersPastSubscriptionGracePeriod", () => {
  it("retains system administrators so an expired workspace can reach billing recovery", async () => {
    prismaMock.user.findMany.mockResolvedValueOnce([]);

    await new PrismaUserRepo().findUsersPastSubscriptionGracePeriod();

    expect(prismaMock.user.findMany).toHaveBeenCalledWith({
      where: {
        status: { not: Status.inactive },
        OR: [{ roleId: null }, { role: { isSystemRole: false } }],
        company: {
          subscription: {
            status: {
              in: [SubscriptionStatus.unPaid, SubscriptionStatus.expired],
            },
            updatedAt: { lte: expect.any(Date) },
          },
        },
      },
    });
  });
});

describe("PrismaUserRepo lifecycle deactivation", () => {
  const companyId = "00000000-0000-4000-8000-000000000001";

  function mockTrialEndDate(trialEndDate: Date) {
    prismaMock.user.updateMany.mockImplementation(
      (args: {
        where: {
          company: { subscription: { trialEndDate: { gt?: Date; lte?: Date } } };
        };
      }) => {
        const range = args.where.company.subscription.trialEndDate;
        const afterLowerBound = range.gt === undefined || trialEndDate > range.gt;
        const beforeUpperBound = range.lte === undefined || trialEndDate <= range.lte;

        return Promise.resolve({ count: afterLowerBound && beforeUpperBound ? 1 : 0 });
      },
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({ companyId });
    prismaMock.subscription.findUniqueOrThrow.mockResolvedValue({ lemonSqueezyVariantId: null });
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 });
  });

  it("still claims a selected trial user after crossing the seven-day boundary", async () => {
    const selectionNow = new Date("2026-08-13T12:00:00.000Z");
    const trialEndDate = new Date("2026-08-06T12:00:00.001Z");
    const claimNow = new Date("2026-08-13T12:00:00.002Z");
    mockTrialEndDate(trialEndDate);

    expect(trialEndDate.getTime()).toBeGreaterThan(selectionNow.getTime() - 7 * 24 * 60 * 60 * 1000);
    expect(trialEndDate.getTime()).toBeLessThanOrEqual(selectionNow.getTime() - 6 * 24 * 60 * 60 * 1000);
    await expect(
      new PrismaUserRepo().claimTrialInactivationAndDeactivateUnlessCheckoutReservedOrThrow({
        userId: "user-1",
        sentAt: claimNow,
        now: claimNow,
      }),
    ).resolves.toBe(true);
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: "user-1",
        companyId,
        status: { not: Status.inactive },
        trialInactivationNoticeSentAt: null,
        company: {
          subscription: {
            status: SubscriptionStatus.trial,
            trialEndDate: {
              lte: new Date("2026-08-07T12:00:00.002Z"),
            },
          },
        },
      },
      data: { status: Status.inactive, trialInactivationNoticeSentAt: claimNow },
    });
  });

  it("does not claim a trial user whose trial ended less than six days ago", async () => {
    const now = new Date("2026-08-13T12:00:00.000Z");
    mockTrialEndDate(new Date("2026-08-07T12:00:00.001Z"));

    await expect(
      new PrismaUserRepo().claimTrialInactivationAndDeactivateUnlessCheckoutReservedOrThrow({
        userId: "user-1",
        sentAt: now,
        now,
      }),
    ).resolves.toBe(false);
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          company: {
            subscription: {
              status: SubscriptionStatus.trial,
              trialEndDate: { lte: new Date("2026-08-07T12:00:00.000Z") },
            },
          },
        }),
      }),
    );
  });

  it("leaves the seat active while a signed checkout reservation is live", async () => {
    const reservation = createCheckoutReservation({
      secret: "test-secret",
      companyId,
      offer: getCommercialOfferOrThrow("pro", "monthly"),
      quantity: 1,
      checkoutExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
      bindingExpiresAt: new Date(Date.now() + 120 * 60 * 1000),
    });
    prismaMock.subscription.findUniqueOrThrow.mockResolvedValue({
      lemonSqueezyVariantId: reservation.marker,
    });

    await expect(
      new PrismaUserRepo().claimTrialInactivationAndDeactivateUnlessCheckoutReservedOrThrow({
        userId: "user-1",
        sentAt: new Date(),
        now: new Date(),
      }),
    ).resolves.toBe(false);
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
  });

  it("rechecks lapsed status under the company lock before post-grace deactivation", async () => {
    const now = new Date("2026-08-13T12:00:00.000Z");

    await expect(
      new PrismaUserRepo().deactivateUserAfterGraceUnlessCheckoutReservedOrThrow({ userId: "user-1", now }),
    ).resolves.toBe(true);

    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: "user-1",
        companyId,
        status: { not: Status.inactive },
        OR: [{ roleId: null }, { role: { isSystemRole: false } }],
        company: {
          subscription: {
            status: { in: [SubscriptionStatus.unPaid, SubscriptionStatus.expired] },
            updatedAt: { lte: new Date("2026-08-10T12:00:00.000Z") },
          },
        },
      },
      data: { status: Status.inactive },
    });
  });
});
