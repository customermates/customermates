import { describe, it, expect, vi, beforeEach } from "vitest";

import { CustomColumnType, EntityType } from "@/generated/prisma";

import { CHIP_COLORS } from "@/constants/chip-colors";

const customColumnCreate = vi.fn().mockResolvedValue({ id: "column-1" });

const prismaMock = {
  user: {
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: "user-1" }),
    findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "user-1", email: "owner@example.com" }),
  },
  company: { create: vi.fn().mockResolvedValue({ id: "company-1" }) },
  userRole: { create: vi.fn().mockResolvedValue({ id: "role-1" }) },
  subscription: { create: vi.fn().mockResolvedValue({ id: "subscription-1" }) },
  customColumn: { create: customColumnCreate },
};

vi.mock("@/prisma/db", () => ({ prisma: prismaMock }));
vi.mock("next-intl/server", () => ({ getTranslations: () => Promise.resolve((key: string) => key) }));
vi.mock("@/core/decorators/transaction.decorator", () => ({ Transaction: () => undefined }));

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
      const options = data.options.options as Array<{ isDefault: boolean; value: string; color: string }>;

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
