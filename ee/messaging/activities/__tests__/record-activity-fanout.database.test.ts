import { PermissionService } from "@/core/base/permission.service";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Prisma } from "@/generated/prisma";
import type { AppPrismaClient } from "@/prisma/db";
import type { TenantUser } from "@/features/user/user.schema";
import type { ActivityKind } from "@/ee/messaging/activities/activities.schema";
import type { RecordActivityIndexRow } from "@/ee/messaging/activities/record-activity-query";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    BASE_URL: "http://127.0.0.1:4000",
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));
vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));

const { prisma } = await import("@/prisma/db");
const { runWithTenant, runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { runInTransaction } = await import("@/core/decorators/transaction-runner");
const { getTransactionClient } = await import("@/core/decorators/transaction-context");
const { PrismaRecordRepo } = await import("@/features/records/prisma-record.repository");
const { PrismaUserRepo } = await import("@/features/user/prisma-user.repository");
const { RecordAccessPolicy } = await import("@/features/records/record-access");
const { createCrmPreset, presetId } = await import("@/features/records/crm-preset");
const { compileRecordActivityIndex, compileRecordActivityScope } = await import(
  "@/ee/messaging/activities/record-activity-query"
);
const { RecordActivitiesInputSchema } = await import("@/ee/messaging/activities/record-activities.schema");

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;
const companies: string[] = [];
const organizationId = randomUUID();
const personId = randomUUID();
const canonical = "activity-fanout@example.test";
const alias = "activity-fanout-alias@example.test";
const siblings = Array.from({ length: 600 }, () => randomUUID());
let database: Client;
let workspace: Awaited<ReturnType<typeof createWorkspace>>;
let foreign: Awaited<ReturnType<typeof createWorkspace>>;
let canonicalMessage: Awaited<ReturnType<typeof createMessage>>;
let aliasMessage: Awaited<ReturnType<typeof createMessage>>;
let directMessage: Awaited<ReturnType<typeof createMessage>>;
let foreignMessage: Awaited<ReturnType<typeof createMessage>>;
let organizationEventId: string;

function fixtureClient() {
  return getTransactionClient<AppPrismaClient>() ?? prisma;
}

async function createWorkspace() {
  const seed = await runWithoutTenant(async () => {
    const company = await fixtureClient().company.create({ data: {} });
    companies.push(company.id);
    const adminRole = await fixtureClient().userRole.create({
      data: { companyId: company.id, name: "Administrator", isSystemRole: true },
    });
    const memberRole = await fixtureClient().userRole.create({ data: { companyId: company.id, name: "Member" } });
    const adminUser = await fixtureClient().user.create({
      data: {
        companyId: company.id,
        roleId: adminRole.id,
        firstName: "Admin",
        lastName: "Test",
        email: `${randomUUID()}@example.test`,
        status: "active",
      },
    });
    const memberUser = await fixtureClient().user.create({
      data: {
        companyId: company.id,
        roleId: memberRole.id,
        firstName: "Member",
        lastName: "Test",
        email: `${randomUUID()}@example.test`,
        status: "active",
      },
    });
    await fixtureClient().rolePermission.createMany({
      data: [
        { companyId: company.id, roleId: memberRole.id, resource: "auditLog", action: "readAll" },
        { companyId: company.id, roleId: memberRole.id, resource: "inboxMessages", action: "readOwn" },
      ],
    });
    return { company, adminRole, memberRole, adminUser, memberUser };
  });
  const admin = createMockUser({ ...seed.adminUser, role: { ...seed.adminRole, permissions: [] } });
  const member = createMockUser({ ...seed.memberUser, role: { ...seed.memberRole, permissions: [] } });
  const repo = new PrismaRecordRepo();
  const id = (key: string) => presetId(seed.company.id, key);
  await runWithTenant(admin, () =>
    runInTransaction(async () => {
      await repo.saveModel(createCrmPreset(seed.company.id), admin.id);
      await repo.setGrants(id("organization"), [{ roleId: seed.memberRole.id, actions: ["readAll"] }]);
      await repo.setGrants(id("contact"), [{ roleId: seed.memberRole.id, actions: ["readOwn"] }]);
      await fixtureClient().crmRecord.createMany({
        data: [
          { companyId: seed.company.id, typeId: id("organization"), id: organizationId },
          { companyId: seed.company.id, typeId: id("contact"), id: personId },
        ],
      });
      const identity = await fixtureClient().recordIdentity.create({
        data: { companyId: seed.company.id, provider: "mail", channelClass: "email", value: canonical },
      });
      await fixtureClient().recordIdentityKey.createMany({
        data: [canonical, alias].map((value) => ({
          companyId: seed.company.id,
          channelClass: "email",
          value,
          identityId: identity.id,
        })),
      });
      await fixtureClient().recordIdentityLink.create({
        data: { companyId: seed.company.id, identityId: identity.id, typeId: id("contact"), recordId: personId },
      });
    }),
  );
  const account = await runWithTenant(admin, () =>
    fixtureClient().connectedAccount.create({
      data: {
        companyId: seed.company.id,
        userId: admin.id,
        provider: "mail",
        status: "ok",
        unipileAccountId: randomUUID(),
        shared: true,
        foldersSyncedAt: new Date(),
        selectedFolderIds: ["INBOX"],
      },
    }),
  );
  return { companyId: seed.company.id, admin, member, memberRole: seed.memberRole, repo, id, account };
}

async function createMessage(owner: Awaited<ReturnType<typeof createWorkspace>>, identifier: string) {
  return runWithTenant(owner.admin, async () => {
    const thread = await fixtureClient().messagingThread.create({
      data: {
        companyId: owner.companyId,
        connectedAccountId: owner.account.id,
        provider: "mail",
        unipileThreadId: randomUUID(),
        participants: {
          create: {
            companyId: owner.companyId,
            provider: "mail",
            providerUserId: identifier,
            identifier: identifier.toUpperCase(),
            identityLookupValue: identifier,
          },
        },
      },
    });
    const message = await fixtureClient().messagingMessage.create({
      data: {
        companyId: owner.companyId,
        connectedAccountId: owner.account.id,
        messagingThreadId: thread.id,
        provider: "mail",
        unipileMessageId: randomUUID(),
        direction: "inbound",
        origin: "unipile",
        sender: { identifier },
        folderIds: ["INBOX"],
        sentAt: new Date("2026-01-01T12:00:00Z"),
      },
    });
    return { id: message.id, threadId: thread.id };
  });
}

async function boundedQuery<T extends object>(query: Prisma.Sql) {
  await database.query("BEGIN READ ONLY");
  try {
    await database.query("SET LOCAL statement_timeout = '5s'");
    const result = await database.query(query.text, query.values);
    return result.rows as T[];
  } finally {
    await database.query("ROLLBACK");
  }
}

async function queryActivity(user: TenantUser) {
  const context = await runWithTenant(user, () =>
    runInTransaction(async () => {
      const policy = await new RecordAccessPolicy(new PrismaUserRepo(new PermissionService()), workspace.repo).load();
      const model = await workspace.repo.getModel();
      const available: ActivityKind[] = [];
      if (policy.allowedSystem("auditLog", "readAll")) available.push("record", "audit", "configuration");
      if (policy.canReadSystem("inboxMessages")) available.push("message", "activity", "calendar_event");
      return { policy, model, available, access: policy.access(model.types.map((type) => type.id)) };
    }),
  );
  expect(context.policy.actor?.id).toBe(user.id);
  const input = RecordActivitiesInputSchema.parse({
    scope: { records: [{ typeId: workspace.id("organization"), recordId: organizationId }], typeIds: [] },
    kinds: ["record", "audit", "message", "activity", "calendar_event"],
    limit: 100,
  });
  const scope = await boundedQuery<{
    typeId: string;
    id: string;
    audit: boolean;
    messaging: boolean;
    threading: boolean;
  }>(compileRecordActivityScope(workspace.companyId, user.id, input, context.model, context.access));
  const index = await boundedQuery<RecordActivityIndexRow>(
    compileRecordActivityIndex(workspace.companyId, user.id, input, context.model, context.access, context.available),
  );
  expect(new Set(index.map((row) => `${row.kind}:${row.id}`)).size).toBe(index.length);
  expect(index.map((row) => row.id)).not.toContain(foreignMessage.id);
  return { scope, index };
}

function expectedEntries(...messages: Array<{ id: string }>) {
  return [
    { kind: "record", id: organizationEventId },
    ...messages.map((message) => ({ kind: "message", id: message.id })),
  ].sort((a, b) => a.id.localeCompare(b.id));
}

describeDatabase("record activity of an organization with 600 linked contacts", { timeout: 30000 }, () => {
  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Owned local database required");
    database = new Client({ connectionString: databaseUrl });
    await database.connect();
    workspace = await createWorkspace();
    foreign = await createWorkspace();
    await runWithTenant(workspace.admin, () =>
      runInTransaction(async () => {
        await fixtureClient().crmRecord.createMany({
          data: siblings.map((contact) => ({
            companyId: workspace.companyId,
            typeId: workspace.id("contact"),
            id: contact,
          })),
        });
        await fixtureClient().recordLink.createMany({
          data: [personId, ...siblings].map((contact) => ({
            companyId: workspace.companyId,
            relationId: workspace.id("contact.organizations"),
            sourceTypeId: workspace.id("contact"),
            sourceId: contact,
            targetTypeId: workspace.id("organization"),
            targetId: organizationId,
          })),
        });
        const event = await fixtureClient().eventLog.create({
          data: {
            companyId: workspace.companyId,
            subjectKind: "record",
            subjectTypeId: workspace.id("organization"),
            subjectId: organizationId,
            actorId: workspace.admin.id,
            causeId: randomUUID(),
            kind: "record.created",
            payload: {},
            deliveredAt: new Date(),
          },
        });
        organizationEventId = event.id;
      }),
    );
    canonicalMessage = await createMessage(workspace, canonical);
    aliasMessage = await createMessage(workspace, alias);
    directMessage = await createMessage(workspace, "explicit-context@example.test");
    foreignMessage = await createMessage(foreign, alias);
    await runWithTenant(workspace.admin, () =>
      fixtureClient().messagingThreadRecordLink.create({
        data: {
          companyId: workspace.companyId,
          threadId: directMessage.threadId,
          typeId: workspace.id("organization"),
          recordId: organizationId,
        },
      }),
    );
  });

  afterAll(async () => {
    try {
      for (const companyId of companies)
        await runWithoutTenant(() => fixtureClient().company.delete({ where: { id: companyId } }));
    } finally {
      await database?.end();
    }
  });

  it("bounds the actual query while deduplicating aliases and excluding a foreign workspace with the same record IDs", async () => {
    const matchingLinks = await runWithTenant(workspace.admin, () =>
      fixtureClient().recordLink.count({
        where: {
          companyId: workspace.companyId,
          relationId: workspace.id("contact.organizations"),
          targetTypeId: workspace.id("organization"),
          targetId: organizationId,
        },
      }),
    );
    expect(matchingLinks).toBe(601);
    const result = await queryActivity(workspace.admin);
    expect(result.scope).toHaveLength(602);
    expect(result.scope).toEqual(
      expect.arrayContaining([
        { typeId: workspace.id("organization"), id: organizationId, audit: true, messaging: false, threading: true },
        { typeId: workspace.id("contact"), id: personId, audit: false, messaging: true, threading: true },
      ]),
    );
    expect(result.index.map(({ kind, id }) => ({ kind, id })).sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      expectedEntries(canonicalMessage, aliasMessage, directMessage),
    );
  });

  it("requires readOwn access at the linked person while retaining independent thread context", async () => {
    const assignment = {
      companyId: workspace.companyId,
      typeId: workspace.id("contact"),
      recordId: personId,
      userId: workspace.member.id,
    };
    const restricted = await queryActivity(workspace.member);
    expect(restricted.scope.map((row) => row.typeId)).toEqual([workspace.id("organization")]);
    expect(restricted.index.map(({ kind, id }) => ({ kind, id })).sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      expectedEntries(directMessage),
    );
    await runWithTenant(workspace.admin, () => fixtureClient().recordAssignment.create({ data: assignment }));
    const readable = await queryActivity(workspace.member);
    expect(readable.scope.map((row) => row.id).sort()).toEqual([organizationId, personId].sort());
    expect(readable.index.map(({ kind, id }) => ({ kind, id })).sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      expectedEntries(canonicalMessage, aliasMessage, directMessage),
    );
  });
});
