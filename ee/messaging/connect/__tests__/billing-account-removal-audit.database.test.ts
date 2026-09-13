import { randomUUID } from "node:crypto";

import { createTranslator } from "next-intl";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import messages from "@/i18n/locales/en.json";

const removedAtProvider: string[] = [];

vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => Promise.resolve(createTranslator({ locale: "en", messages })),
}));
vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    DATABASE_URL: process.env.DATABASE_URL,
    BASE_URL: "http://localhost:4000",
    NODE_ENV: "test",
  },
}));
vi.mock("@/ee/messaging/messaging.service", () => ({
  MessagingService: class {
    deleteAccount({ accountId }: { accountId: string }) {
      removedAtProvider.push(accountId);
      return Promise.resolve();
    }
  },
}));
vi.mock("@/core/email/email.service", () => ({
  EmailService: class {
    send() {
      return Promise.resolve(true);
    }
  },
}));

const { getDeleteAccountsForPlanInteractor } = await import("@/core/di");
const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");

const company = randomUUID();
const owner = randomUUID();
const role = randomUUID();
const olderAccount = randomUUID();
const newerAccount = randomUUID();

const account = (id: string, createdAt: Date, displayName: string) => ({
  id,
  companyId: company,
  userId: owner,
  unipileAccountId: `uni_${id}`,
  provider: "linkedin" as const,
  status: "ok" as const,
  displayName,
  emailAddress: `${displayName.toLowerCase().replace(" ", ".")}@example.com`,
  createdAt,
});

const auditRows = () =>
  runWithoutTenant(() => prisma.auditLog.findMany({ where: { companyId: company }, orderBy: { createdAt: "asc" } }));

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

describeDatabase("a billing-driven account removal leaves an audit trail", { timeout: 120_000 }, () => {
  beforeAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.company.create({ data: { id: company } });
      await prisma.userRole.create({
        data: { id: role, companyId: company, name: "System", isSystemRole: true },
      });
      await prisma.user.create({
        data: {
          id: owner,
          companyId: company,
          roleId: role,
          email: `owner-${owner}@example.com`,
          firstName: "Ada",
          lastName: "Owner",
          status: "active",
        },
      });
      await prisma.subscription.create({ data: { companyId: company, plan: "business", status: "active" } });
    });
  });

  beforeEach(async () => {
    removedAtProvider.length = 0;
    await runWithoutTenant(async () => {
      await prisma.auditLog.deleteMany({ where: { companyId: company } });
      await prisma.connectedAccount.deleteMany({ where: { companyId: company } });
      await prisma.connectedAccount.createMany({
        data: [
          account(olderAccount, new Date("2026-01-01T00:00:00.000Z"), "Older Account"),
          account(newerAccount, new Date("2026-06-01T00:00:00.000Z"), "Newer Account"),
        ],
      });
    });
  });

  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.delete({ where: { id: company } }));
  });

  it("records every account a downgrade removed, naming the owner and the cause", async () => {
    await getDeleteAccountsForPlanInteractor().invoke({ companyId: company, plan: "starter" });

    const accounts = await runWithoutTenant(() =>
      prisma.connectedAccount.findMany({ where: { companyId: company }, orderBy: { createdAt: "asc" } }),
    );

    expect(accounts.map((row) => row.status)).toEqual(["deleted", "deleted"]);
    expect(removedAtProvider.sort()).toEqual([`uni_${newerAccount}`, `uni_${olderAccount}`].sort());

    const rows = await auditRows();

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.event === "connected_account.deleted")).toBe(true);
    expect(rows.every((row) => row.userId === owner && row.companyId === company)).toBe(true);
    expect(rows.map((row) => row.entityId).sort()).toEqual([olderAccount, newerAccount].sort());
    expect(rows[0].eventData).toMatchObject({
      payload: { provider: "linkedin", removalReason: "planDowngrade" },
    });
  });

  it("removes only the overage and audits only what it removed", async () => {
    await getDeleteAccountsForPlanInteractor().invoke({ companyId: company, plan: "pro" });

    const rows = await auditRows();
    const surviving = await runWithoutTenant(() =>
      prisma.connectedAccount.findMany({ where: { companyId: company, status: "ok" } }),
    );

    expect(surviving.map((row) => row.id)).toEqual([olderAccount]);
    expect(rows).toHaveLength(1);
    expect(rows[0].entityId).toBe(newerAccount);
    expect(rows[0].eventData).toMatchObject({
      payload: { displayName: "Newer Account", removalReason: "planDowngrade" },
    });
  });

  it("writes nothing when the plan still covers every account", async () => {
    await getDeleteAccountsForPlanInteractor().invoke({ companyId: company, plan: "business" });

    expect(await auditRows()).toHaveLength(0);
    expect(removedAtProvider).toEqual([]);
  });

  it("is idempotent: a repeated downgrade neither re-deletes nor re-audits", async () => {
    await getDeleteAccountsForPlanInteractor().invoke({ companyId: company, plan: "starter" });
    await runWithoutTenant(() => prisma.auditLog.deleteMany({ where: { companyId: company } }));
    removedAtProvider.length = 0;

    await getDeleteAccountsForPlanInteractor().invoke({ companyId: company, plan: "starter" });

    expect(await auditRows()).toHaveLength(0);
    expect(removedAtProvider).toEqual([]);
  });
});
