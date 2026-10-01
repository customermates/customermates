import { describe, it, expect, vi, beforeEach } from "vitest";

import { Status } from "@/generated/prisma";

import { CLOUD_TRIAL } from "@/core/commercial/plan-catalog";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { createMockUser } from "@/tests/helpers/mock-user";

const prismaMock = {
  user: {
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: "user-1", createdAt: new Date("2026-09-02T10:00:00.000Z") }),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "user-1", email: "owner@example.com" }),
  },
  adAttribution: {
    create: vi.fn().mockResolvedValue({ id: "attribution-1" }),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
  },
  conversionEvent: { create: vi.fn().mockResolvedValue({ id: "conversion-1" }) },
  company: {
    create: vi.fn().mockResolvedValue({ id: "company-1" }),
    update: vi.fn().mockResolvedValue({ id: "company-1" }),
  },
  userRole: { create: vi.fn().mockResolvedValue({ id: "role-1" }) },
  subscription: { create: vi.fn().mockResolvedValue({ id: "subscription-1" }) },
};

vi.mock("@/prisma/db", () => ({ prisma: prismaMock }));
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
}));
vi.mock("@/core/decorators/transaction.decorator", () => ({
  Transaction: () => undefined,
}));
vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    AUTH_GOOGLE_ID: undefined,
    AUTH_MICROSOFT_ENTRA_ID_ID: undefined,
  },
}));

const { PrismaUserRepo } = await import("../prisma-user.repository");

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
  });

  it("creates membership, role, subscription, and workspace infrastructure", async () => {
    await new PrismaUserRepo().createCompanyAndUser(registerArgs);
    expect(prismaMock.company.create).toHaveBeenCalledOnce();
    expect(prismaMock.userRole.create).toHaveBeenCalledOnce();
    expect(prismaMock.user.create).toHaveBeenCalledOnce();
    expect(prismaMock.subscription.create).toHaveBeenCalledOnce();
    expect(prismaMock.userRole.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isSystemRole: true }) }),
    );
  });

  it("stores one consented ad attribution row per provider on the initial owner", async () => {
    const adAttribution = [
      {
        provider: "google_ads" as const,
        identifierKind: "gclid" as const,
        identifierValue: "Case-Sensitive_GCLID",
        clickedAt: new Date("2026-08-31T09:55:00.000Z"),
        capturedAt: new Date("2026-08-31T10:00:00.000Z"),
        consentedAt: new Date("2026-08-31T10:00:00.000Z"),
        consentNoticeVersion: "2026-09-02",
        expiresAt: new Date("2026-11-28T10:00:00.000Z"),
      },
      {
        provider: "openai_ads" as const,
        identifierKind: "oppref" as const,
        identifierValue: "Opaque-OPPREF",
        clickedAt: new Date("2026-08-31T09:55:00.000Z"),
        capturedAt: new Date("2026-08-31T10:00:00.000Z"),
        consentedAt: new Date("2026-08-31T10:00:00.000Z"),
        consentNoticeVersion: "2026-09-02",
        expiresAt: new Date("2026-09-30T10:00:00.000Z"),
      },
    ];

    await new PrismaUserRepo().createCompanyAndUser({ ...registerArgs, adAttribution });

    expect(prismaMock.adAttribution.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.adAttribution.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: "company-1",
        userId: "user-1",
        provider: "google_ads",
        identifierKind: "gclid",
        identifierValue: "Case-Sensitive_GCLID",
        clickedAt: adAttribution[0].clickedAt,
        consentNoticeVersion: "2026-09-02",
      }),
    });
    expect(prismaMock.conversionEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ companyId: "company-1", type: "signup" }),
    });
  });

  it("records no attribution or conversion for an unattributed registration", async () => {
    await new PrismaUserRepo().createCompanyAndUser({ ...registerArgs, adAttribution: [] });

    expect(prismaMock.adAttribution.create).not.toHaveBeenCalled();
    expect(prismaMock.conversionEvent.create).not.toHaveBeenCalled();
  });

  it("deletes expired attribution rows without touching account state", async () => {
    const now = new Date("2026-11-29T10:00:00.000Z");
    prismaMock.adAttribution.deleteMany.mockResolvedValueOnce({ count: 3 });

    await expect(new PrismaUserRepo().expireAdAttributionUnscoped(now)).resolves.toBe(3);

    expect(prismaMock.adAttribution.deleteMany).toHaveBeenCalledWith({ where: { expiresAt: { lte: now } } });
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
  });

  it("reports no change when a withdrawal retry finds nothing to delete", async () => {
    prismaMock.adAttribution.deleteMany.mockResolvedValueOnce({ count: 0 });
    const user = createMockUser({ id: "user-1", companyId: "company-1" });

    await expect(
      runWithTenant(user, () => new PrismaUserRepo().clearAdAttributionForUser({ userId: user.id })),
    ).resolves.toBe(false);

    expect(prismaMock.adAttribution.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", companyId: "company-1" },
    });
  });

  it("creates the catalog-owned Pro cloud trial", async () => {
    const before = new Date();
    before.setDate(before.getDate() + CLOUD_TRIAL.days);
    await new PrismaUserRepo().createCompanyAndUser(registerArgs);
    const after = new Date();
    after.setDate(after.getDate() + CLOUD_TRIAL.days);

    const data = prismaMock.subscription.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ plan: CLOUD_TRIAL.plan, status: "trial" });
    expect(data.trialEndDate.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(data.trialEndDate.getTime()).toBeLessThanOrEqual(after.getTime());
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
