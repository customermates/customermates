import { describe, it, expect, vi, beforeEach } from "vitest";

import { CustomColumnType, EntityType, Status } from "@/generated/prisma";

import { CHIP_COLORS } from "@/constants/chip-colors";

const customColumnCreate = vi.fn().mockResolvedValue({ id: "column-1" });
const transactionUserUpdate = vi.fn().mockResolvedValue({ id: "user-1" });
const transactionClient = {
  $executeRaw: vi.fn().mockResolvedValue(0),
  user: { update: transactionUserUpdate },
};

const prismaMock = {
  $transaction: vi.fn(async (callback: (tx: typeof transactionClient) => Promise<unknown>) =>
    callback(transactionClient),
  ),
  user: {
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: "user-1" }),
    findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "user-1", email: "owner@example.com" }),
  },
  company: { create: vi.fn().mockResolvedValue({ id: "company-1" }) },
  userRole: { create: vi.fn().mockResolvedValue({ id: "role-1" }) },
  subscription: { create: vi.fn().mockResolvedValue({ id: "subscription-1" }) },
  customColumn: { create: customColumnCreate },
};

vi.mock("@/prisma/db", () => ({ prisma: prismaMock }));
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
}));
vi.mock("@/core/decorators/transaction.decorator", () => ({
  Transaction: () => undefined,
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
});

describe("PrismaUserRepo.deactivateUserOrThrow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("takes the hosted-AI company lock before deactivating the seat", async () => {
    const companyId = "00000000-0000-4000-8000-000000000001";
    const userId = "00000000-0000-4000-8000-000000000002";
    prismaMock.user.findUniqueOrThrow.mockResolvedValueOnce({ companyId });

    await new PrismaUserRepo().deactivateUserOrThrow(userId);

    expect(prismaMock.user.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: userId },
      select: { companyId: true },
    });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(transactionClient.$executeRaw).toHaveBeenCalledWith(expect.any(Array), companyId);
    expect(transactionUserUpdate).toHaveBeenCalledWith({
      where: { id: userId, companyId },
      data: { status: Status.inactive, agentCreditActivatedAt: null },
    });
    expect(transactionClient.$executeRaw).toHaveBeenCalledBefore(transactionUserUpdate);
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
        select: expect.objectContaining({ createdAt: true, formattingLocale: true }),
      }),
    );
  });
});
