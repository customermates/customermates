import { randomUUID } from "node:crypto";

import { createTranslator } from "next-intl";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { Action, Resource } from "@/generated/prisma";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import messages from "@/i18n/locales/en.json";

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

type ToolResult = { structuredContent?: Record<string, unknown> };

const {
  getCountChannelsNeedingActionInteractor,
  getGetMyConnectedAccountsInteractor,
  getGetMyConnectedAccountsApiInteractor,
  getConnectedAccountRepo,
} = await import("@/core/di");
const { getWorkspaceContextTool } = await import("@/features/mcp-tools/workspace.mcp-tools");
const { prisma } = await import("@/prisma/db");
const { runWithTenant, runWithoutTenant } = await import("@/core/decorators/tenant-context");

const company = randomUUID();
const role = randomUUID();
const owner = randomUUID();
const colleague = randomUUID();

const account = (userId: string, status: string, shared = false) => {
  const id = randomUUID();
  return {
    id,
    companyId: company,
    userId,
    unipileAccountId: `uni_${id}`,
    provider: "linkedin" as const,
    status: status as never,
    displayName: `Account ${status}`,
    emailAddress: `${id}@example.com`,
    shared,
  };
};

const accounts = [
  account(owner, "credentials"),
  account(owner, "ok"),
  account(colleague, "error", true),
  account(colleague, "permissions"),
];

const connectionDetails = {
  status: "partial",
  products: { gmail: "disconnected", calendar: "running" },
  reason: "Provider reported mail unavailable",
};

const asOwner = (permissions: Array<{ resource: Resource; action: Action }>) => ({
  ...createMockUserWithPermissions(permissions),
  id: owner,
  companyId: company,
});

const withoutInbox = () =>
  asOwner([
    { resource: Resource.wiki, action: Action.readAll },
    { resource: Resource.users, action: Action.readOwn },
    { resource: Resource.company, action: Action.readOwn },
  ]);

const withInbox = () =>
  asOwner([
    { resource: Resource.inboxMessages, action: Action.readAll },
    { resource: Resource.users, action: Action.readOwn },
    { resource: Resource.company, action: Action.readOwn },
  ]);

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

describeDatabase("connected-account reads that every role runs", { timeout: 120_000 }, () => {
  beforeAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.company.create({ data: { id: company } });
      await prisma.userRole.create({ data: { id: role, companyId: company, name: "Member", isSystemRole: false } });
      for (const [id, name] of [
        [owner, "Owner"],
        [colleague, "Colleague"],
      ]) {
        await prisma.user.create({
          data: {
            id,
            companyId: company,
            roleId: role,
            email: `${name.toLowerCase()}-${id}@example.com`,
            firstName: name,
            lastName: "Test",
            status: "active",
          },
        });
      }
      await prisma.connectedAccount.createMany({ data: accounts });
      await prisma.connectedAccount.update({
        where: { id: accounts[0].id },
        data: { connectionDetails, statusCheckedAt: new Date("2026-11-16T10:00:00Z") },
      });
    });
  });

  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.delete({ where: { id: company } }));
  });

  it("counts the member's own and shared accounts that need action, for a role that can read the inbox", async () => {
    const readAll = await runWithTenant(asOwner([{ resource: Resource.inboxMessages, action: Action.readAll }]), () =>
      getCountChannelsNeedingActionInteractor().invoke(),
    );
    const readOwn = await runWithTenant(asOwner([{ resource: Resource.inboxMessages, action: Action.readOwn }]), () =>
      getCountChannelsNeedingActionInteractor().invoke(),
    );

    expect(readAll.data).toBe(2);
    expect(readOwn.data).toBe(2);
  });

  it("counts for a system role, as the connected-accounts list does", async () => {
    const result = await runWithTenant({ ...createMockUser(), id: owner, companyId: company }, () =>
      getCountChannelsNeedingActionInteractor().invoke(),
    );

    expect(result.data).toBe(2);
  });

  it("returns zero instead of failing for a role without inbox access, so every page still renders", async () => {
    const result = await runWithTenant(withoutInbox(), () => getCountChannelsNeedingActionInteractor().invoke());

    expect(result).toEqual({ ok: true, data: 0 });
  });

  it("gives the workspace context the member's own and shared accounts, for a role that can read the inbox", async () => {
    const result = await runWithTenant(withInbox(), () => getWorkspaceContextTool.execute());
    const listed = await runWithTenant(withInbox(), () => getGetMyConnectedAccountsApiInteractor().invoke());

    if (!listed.ok) throw new Error("Expected the connected-accounts list");

    const structured = (result as ToolResult).structuredContent ?? {};
    const contextIds = (structured.connectedAccounts as Array<{ id: string }>).map(({ id }) => id).sort();
    expect(contextIds).toEqual([accounts[0].id, accounts[1].id, accounts[2].id].sort());
    expect(contextIds).toEqual(listed.data.map(({ id }) => id).sort());
  });

  it("gives the Configure graph only the member's own and shared accounts, never a colleague's private one", async () => {
    const listed = await runWithTenant(withInbox(), () => getGetMyConnectedAccountsInteractor().invoke());

    if (!listed.ok) throw new Error("Expected the connected-accounts list");
    expect(listed.data.map(({ id }) => id).sort()).toEqual([accounts[0].id, accounts[1].id, accounts[2].id].sort());
    expect(listed.data.find(({ id }) => id === accounts[2].id)?.isOwner).toBe(false);
    expect(listed.data.find(({ id }) => id === accounts[0].id)).toMatchObject({
      connectionDetails,
      statusCheckedAt: new Date("2026-11-16T10:00:00Z"),
    });
  });

  it("selects unchecked and stale accounts for reconciliation, excluding deleted, fresh and recently failed accounts", async () => {
    const [unchecked, stale, fresh, deleted, failedRecently, failedEarlier] = Array.from({ length: 6 }, () =>
      randomUUID(),
    );
    const before = new Date("2026-11-16T10:30:00Z");
    const staleAt = new Date("2026-11-16T10:00:00Z");
    await runWithoutTenant(async () => {
      await prisma.connectedAccount.createMany({
        data: [
          { ...account(owner, "ok"), id: unchecked },
          { ...account(owner, "ok"), id: stale, statusCheckedAt: staleAt },
          { ...account(owner, "ok"), id: fresh, statusCheckedAt: new Date("2026-11-16T11:00:00Z") },
          { ...account(owner, "deleted"), id: deleted },
          {
            ...account(owner, "ok"),
            id: failedRecently,
            statusCheckedAt: staleAt,
            statusAttemptedAt: new Date("2026-11-16T10:45:00Z"),
          },
          {
            ...account(owner, "ok"),
            id: failedEarlier,
            statusCheckedAt: staleAt,
            statusAttemptedAt: new Date("2026-11-16T10:15:00Z"),
          },
        ],
      });
      const repo = getConnectedAccountRepo();
      const created = [unchecked, stale, fresh, deleted, failedRecently, failedEarlier];
      const targets = await prisma.connectedAccount.findMany({ where: { id: { in: created } } });
      const idOf = new Map(targets.map(({ id, unipileAccountId }) => [unipileAccountId, id]));
      const staleUnipileId = targets.find(({ id }) => id === stale)?.unipileAccountId ?? "";
      const everyAccount = 100_000;
      const selected = (await repo.findAccountsNeedingStatusRefreshUnscoped(before, everyAccount))
        .map(({ unipileAccountId }) => idOf.get(unipileAccountId))
        .filter((id) => id !== undefined);

      expect(selected[0]).toBe(unchecked);
      expect([...selected].sort()).toEqual([unchecked, stale, failedEarlier].sort());
      expect(await repo.findAccountsNeedingStatusRefreshUnscoped(before, 1)).toHaveLength(1);

      const attemptedAt = new Date("2026-11-16T10:40:00Z");
      await repo.markStatusRefreshAttemptedUnscoped(staleUnipileId, attemptedAt);
      expect(await prisma.connectedAccount.findUnique({ where: { id: stale } })).toMatchObject({
        statusCheckedAt: staleAt,
        statusAttemptedAt: attemptedAt,
      });
      const afterAttempt = (await repo.findAccountsNeedingStatusRefreshUnscoped(before, everyAccount)).map(
        ({ unipileAccountId }) => idOf.get(unipileAccountId),
      );
      expect(afterAttempt).not.toContain(stale);
      expect(afterAttempt).toContain(failedEarlier);
    });
  });

  it("does not let an older concurrent provider read overwrite a newer status", async () => {
    await runWithoutTenant(async () => {
      const created = await prisma.connectedAccount.create({
        data: {
          ...account(owner, "ok"),
          statusCheckedAt: new Date("2026-11-16T11:00:00Z"),
          connectionDetails,
        },
      });
      const result = await getConnectedAccountRepo().updateAccountUnscoped({
        unipileAccountId: created.unipileAccountId,
        status: "credentials",
        statusCheckedAt: new Date("2026-11-16T10:00:00Z"),
      });
      expect(result).toBeNull();
      expect(await prisma.connectedAccount.findUnique({ where: { id: created.id } })).toMatchObject({
        status: "ok",
        statusCheckedAt: new Date("2026-11-16T11:00:00Z"),
        connectionDetails,
      });
    });
  });

  it("gives the workspace context an empty account list instead of failing, for a role without inbox access", async () => {
    const result = await runWithTenant(withoutInbox(), () => getWorkspaceContextTool.execute());

    expect(result).toMatchObject({ structuredContent: { company: { id: company }, connectedAccounts: [] } });
  });

  it("leaves the connected-accounts list itself refused to that role, in the app and the API", async () => {
    await expect(runWithTenant(withoutInbox(), () => getGetMyConnectedAccountsInteractor().invoke())).rejects.toThrow(
      /inboxMessages/,
    );
    await expect(
      runWithTenant(withoutInbox(), () => getGetMyConnectedAccountsApiInteractor().invoke()),
    ).rejects.toThrow(/inboxMessages/);
  });
});
