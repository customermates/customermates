import type { RecordIdentity } from "../record-identity.schema";

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";

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
const { Prisma } = await import("@/generated/prisma");
const { runWithTenant, runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { runInTransaction } = await import("@/core/decorators/transaction-runner");
const { createCrmPreset, presetId } = await import("../crm-preset");
const { createTestRecordRepo } = await import("@/tests/helpers/record-repository");
const { PrismaEventLogRepo } = await import("@/features/event/prisma-event-log.repository");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companies: string[] = [];

async function fixture() {
  const seed = await runWithoutTenant(async () => {
    const company = await prisma.company.create({ data: {} });
    companies.push(company.id);
    const role = await prisma.userRole.create({
      data: { companyId: company.id, name: "Administrator", isSystemRole: true },
    });
    const user = await prisma.user.create({
      data: {
        companyId: company.id,
        roleId: role.id,
        firstName: "Admin",
        lastName: "Test",
        email: `${randomUUID()}@example.test`,
        status: "active",
      },
    });
    return { company, role, user };
  });
  const companyId = seed.company.id;
  const admin = createMockUser({ ...seed.user, role: { ...seed.role, permissions: [] } });
  const repo = createTestRecordRepo();
  const model = createCrmPreset(companyId);
  await runWithTenant(admin, () => runInTransaction(() => repo.saveModel(model, admin.id), { timeout: 30000 }));
  const id = (key: string) => presetId(companyId, key);
  const as = <T>(fn: () => Promise<T>) => runWithTenant(admin, fn);
  const raw = <T>(fn: () => Promise<T>) => runWithoutTenant(fn);
  const record = async (typeKey: string, data: { deletedAt?: Date; trashItemId?: string } = {}) => {
    const recordId = randomUUID();
    await raw(() => prisma.crmRecord.create({ data: { companyId, typeId: id(typeKey), id: recordId, ...data } }));
    return recordId;
  };
  const link = (relationKey: string, source: string, target: string, deletedAt: Date | null = null) => {
    const relation = model.relationships.find((candidate) => candidate.id === id(relationKey));
    if (!relation) throw new Error(`Missing relation ${relationKey}`);
    return raw(() =>
      prisma.recordLink.create({
        data: {
          companyId,
          id: randomUUID(),
          relationId: relation.id,
          sourceTypeId: relation.sourceTypeId,
          sourceId: source,
          targetTypeId: relation.targetTypeId,
          targetId: target,
          deletedAt,
        },
      }),
    );
  };
  const trashItem = async (typeKey: string, targetId: string) => {
    const trashId = randomUUID();
    await raw(() =>
      prisma.trashItem.create({
        data: {
          companyId,
          id: trashId,
          kind: "record",
          targetId,
          typeId: id(typeKey),
          label: "Trashed",
          expiresAt: new Date(Date.now() + 86400000),
          batchId: randomUUID(),
        },
      }),
    );
    return trashId;
  };
  return { companyId, admin, repo, model, id, as, raw, record, link, trashItem, user: seed.user };
}

afterAll(async () => {
  if (companies.length) await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companies } } }));
});

describeDatabase("record repository native queries", () => {
  it("reads configuration deletions across pages and ignores revisions without a deletions array", async () => {
    const f = await fixture();
    const target = (index: number) => ({ kind: "field" as const, id: presetId(f.companyId, `deleted.${index}`) });
    const deletion = (index: number) => ({ target: target(index), cascade: [] });
    const base = 1000;
    await f.raw(() =>
      prisma.recordSchemaRevision.createMany({
        data: [
          {
            companyId: f.companyId,
            revision: base,
            actorId: "old",
            snapshot: {},
            change: { deletions: [deletion(0)] },
          },
          { companyId: f.companyId, revision: base + 1, actorId: "a", snapshot: {}, change: { version: 1 } },
          { companyId: f.companyId, revision: base + 2, actorId: "a", snapshot: {}, change: { deletions: null } },
          { companyId: f.companyId, revision: base + 3, actorId: "a", snapshot: {}, change: Prisma.DbNull },
          { companyId: f.companyId, revision: base + 4, actorId: "a", snapshot: {}, change: Prisma.JsonNull },
          { companyId: f.companyId, revision: base + 5, actorId: "a", snapshot: {}, change: { deletions: [] } },
          ...Array.from({ length: 250 }, (_, index) => ({
            companyId: f.companyId,
            revision: base + 10 + index,
            actorId: index === 249 ? "newest" : "actor",
            snapshot: {},
            change: { deletions: [deletion(index === 249 ? 0 : index + 1)] },
          })),
        ],
      }),
    );

    const all = await f.as(() => f.repo.getConfigurationDeletions());
    expect(all.size).toBe(250);
    expect(all.get(`field:${target(0).id}`)?.actorId).toBe("newest");
    expect(all.get(`field:${target(1).id}`)?.actorId).toBe("actor");

    const deep = await f.as(() => f.repo.getConfigurationDeletions([target(1), target(0)]));
    expect([...deep.keys()].sort()).toEqual([`field:${target(0).id}`, `field:${target(1).id}`].sort());
    expect(deep.get(`field:${target(0).id}`)?.actorId).toBe("newest");
    expect(await f.as(() => f.repo.getConfigurationDeletions([]))).toEqual(new Map());
  });

  it("pages view states across the personalization and view boundary exactly like the former union", async () => {
    const f = await fixture();
    const typeIds = Array.from({ length: 150 }, () => randomUUID());
    await f.raw(async () => {
      await prisma.p13n.createMany({
        data: typeIds.map((typeId) => ({
          companyId: f.companyId,
          userId: f.user.id,
          p13nId: `records:${typeId}`,
          searchTerm: "personal",
        })),
      });
      await prisma.dataView.createMany({
        data: Array.from({ length: 120 }, (_, index) => ({
          companyId: f.companyId,
          userId: f.user.id,
          surfaceKey: `records:${typeIds[index % typeIds.length]}`,
          name: `View ${index}`,
          searchTerm: `view ${index}`,
          deletedAt: index % 7 === 0 ? new Date() : null,
        })),
      });
    });
    const oracle = (afterKey: string) =>
      f.raw(() =>
        prisma.$queryRaw<Array<{ key: string }>>(Prisma.sql`
          SELECT key FROM (
            SELECT 'view:' || v."id" AS key FROM "DataView" v
            WHERE v."companyId" = ${f.companyId} AND v."surfaceKey" IN (${Prisma.join(typeIds.map((typeId) => `records:${typeId}`))})
            UNION ALL
            SELECT 'personalization:' || p."id" AS key FROM "P13n" p
            WHERE p."companyId" = ${f.companyId} AND p."p13nId" IN (${Prisma.join(typeIds.map((typeId) => `records:${typeId}`))})
          ) consumers WHERE key > ${afterKey} ORDER BY key LIMIT 200`),
      );

    const pages: string[][] = [];
    let afterKey = "";
    for (;;) {
      const page = await f.as(() => f.repo.getViewStatesCompanyWide(typeIds, afterKey));
      expect(page.map((row) => row.key)).toEqual((await oracle(afterKey)).map((row) => row.key));
      if (!page.length) break;
      pages.push(page.map((row) => row.key));
      afterKey = page.at(-1)?.key ?? "";
    }
    expect(pages.map((page) => page.length)).toEqual([200, 70]);
    expect(pages[0].filter((key) => key.startsWith("view:"))).toHaveLength(50);

    const first = await f.as(() => f.repo.getViewStatesCompanyWide(typeIds));
    const personal = first[0];
    expect(personal).toMatchObject({ name: null, trashed: false, state: { searchTerm: "personal" } });
    const views = [
      ...first.slice(150),
      ...(await f.as(() => f.repo.getViewStatesCompanyWide(typeIds, first[199].key))),
    ];
    expect(views).toHaveLength(120);
    expect(views.filter((view) => view.trashed)).toHaveLength(18);
    for (const view of views) {
      expect(view.name).toMatch(/^View \d+$/);
      expect(view.state.searchTerm).toBe(`view ${view.name?.slice(5)}`);
      expect(typeIds).toContain(view.typeId);
    }
  });

  it("counts trashed and cascaded records and their links like the former joins", async () => {
    const f = await fixture();
    const organization = await f.record("organization");
    const contact = await f.record("contact");
    const otherOrganization = await f.record("organization");
    const trash = await f.trashItem("organization", organization);
    const otherTrash = await f.trashItem("deal", randomUUID());
    await f.raw(() =>
      prisma.crmRecord.updateMany({
        where: { companyId: f.companyId, id: organization },
        data: { deletedAt: new Date(), trashItemId: trash },
      }),
    );
    const cascadedDeal = await f.record("deal", { deletedAt: new Date(), trashItemId: trash });
    await f.record("deal", { deletedAt: new Date(), trashItemId: otherTrash });
    await f.link("deal.organizations", cascadedDeal, organization);
    await f.link("deal.contacts", cascadedDeal, contact);
    await f.link("contact.organizations", contact, otherOrganization);
    await f.link("contact.organizations", contact, organization, new Date());

    const counts = await f.as(() =>
      f.repo.countDefinitionDeletion({
        typeIds: [f.id("organization")],
        fieldIds: [],
        relationIds: [],
        channelTypeIds: [],
      }),
    );
    expect(counts.records).toBe(3);

    const trashed = await f.as(() => f.repo.countTrashedRecordsCompanyWide([trash]));
    expect(trashed).toEqual({
      records: [
        { typeId: f.id("deal"), count: 1 },
        { typeId: f.id("organization"), count: 1 },
      ].sort((left, right) => (left.typeId < right.typeId ? -1 : 1)),
      links: 3,
    });
    const [oracle] = await f.raw(() =>
      prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
        SELECT COUNT(DISTINCT link.id)::integer AS count FROM "RecordLink" link JOIN "CrmRecord" record
          ON record."companyId" = link."companyId" AND record."trashItemId" = ANY(${[trash]}::text[])
          AND ((link."sourceTypeId" = record."typeId" AND link."sourceId" = record.id)
            OR (link."targetTypeId" = record."typeId" AND link."targetId" = record.id))
        WHERE link."companyId" = ${f.companyId}`),
    );
    expect(trashed.links).toBe(oracle.count);
    expect(await f.as(() => f.repo.countTrashedRecordsCompanyWide([]))).toEqual({ records: [], links: 0 });
  });

  it("flags a to-one relationship only when live links repeat an endpoint", async () => {
    const f = await fixture();
    const relationId = f.id("deal.organizations");
    const toOne = (side: "source" | "target") => ({
      ...f.model,
      relationships: f.model.relationships.map((relation) =>
        relation.id === relationId ? { ...relation, [`${side}Cardinality`]: "one" } : relation,
      ),
    });
    const deal = await f.record("deal");
    const [first, second] = [await f.record("organization"), await f.record("organization")];
    await f.link("deal.organizations", deal, first);
    await f.link("deal.organizations", deal, second, new Date());
    expect(await f.as(() => f.repo.validateRelationshipCardinality(toOne("source")))).toEqual([]);
    await f.raw(() =>
      prisma.recordLink.updateMany({ where: { companyId: f.companyId, targetId: second }, data: { deletedAt: null } }),
    );
    expect(await f.as(() => f.repo.validateRelationshipCardinality(toOne("source")))).toEqual([relationId]);
    expect(await f.as(() => f.repo.validateRelationshipCardinality(toOne("target")))).toEqual([]);
  });

  it("stages each identity key once and deletes only identities without links", async () => {
    const f = await fixture();
    const operationId = randomUUID();
    await f.raw(() =>
      prisma.recordOperation.create({
        data: {
          companyId: f.companyId,
          id: operationId,
          userId: f.user.id,
          kind: "test",
          expectedRevision: 0,
          request: {},
        },
      }),
    );
    const identity = (value: string, extra: Partial<RecordIdentity> = {}): RecordIdentity => ({
      id: randomUUID(),
      provider: "mail",
      channelClass: "email",
      value,
      messagingId: null,
      displayName: null,
      profileUrl: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...extra,
    });
    const first = identity("a@example.test", { messagingId: "m-1", aliases: ["a@example.test", "alias@example.test"] });
    const second = identity("b@example.test", { aliases: ["alias@example.test"] });
    await f.as(() => f.repo.stageIdentityChannelsCompanyWide(operationId, [first, second]));
    await f.as(() => f.repo.stageIdentityChannelsCompanyWide(operationId, [identity("a@example.test")]));
    const staged = await f.raw(() =>
      prisma.recordStageRow.findMany({
        where: { companyId: f.companyId, operationId, kind: "identity-key" },
        orderBy: { key: "asc" },
      }),
    );
    expect(staged.map((row) => [row.key, (row.payload as { id: string }).id])).toEqual([
      ["email:a@example.test", first.id],
      ["email:alias@example.test", first.id],
      ["email:b@example.test", second.id],
      ["email:m-1", first.id],
    ]);
    expect(staged[0].payload).toEqual(JSON.parse(JSON.stringify(first)));

    const contact = await f.record("contact");
    const [linked, orphan] = [randomUUID(), randomUUID()];
    await f.raw(async () => {
      await prisma.recordIdentity.createMany({
        data: [linked, orphan].map((identityId) => ({
          companyId: f.companyId,
          id: identityId,
          provider: "mail" as const,
          channelClass: "email",
          value: `${identityId}@example.test`,
        })),
      });
      await prisma.recordIdentityLink.create({
        data: { companyId: f.companyId, identityId: linked, typeId: f.id("contact"), recordId: contact },
      });
    });
    const removable = f.repo as unknown as { deleteOrphanedIdentities(ids: string[]): Promise<void> };
    await f.as(() => removable.deleteOrphanedIdentities([linked, orphan, orphan]));
    const remaining = await f.raw(() =>
      prisma.recordIdentity.findMany({ where: { companyId: f.companyId, id: { in: [linked, orphan] } } }),
    );
    expect(remaining.map((row) => row.id)).toEqual([linked]);
  });

  it("orders due companies by their earliest attempt like the former grouped query", async () => {
    const [a, b, c] = await Promise.all([fixture(), fixture(), fixture()]);
    const at = (iso: string) => new Date(iso);
    const event = (companyId: string, nextAttemptAt: Date, deliveredAt: Date | null = null) => ({
      companyId,
      id: randomUUID(),
      subjectKind: "record",
      subjectId: randomUUID(),
      kind: "record.updated",
      payload: {},
      nextAttemptAt,
      deliveredAt,
    });
    await runWithoutTenant(() =>
      prisma.eventLog.createMany({
        data: [
          event(a.companyId, at("1999-03-01T00:00:00Z")),
          event(a.companyId, at("1999-01-02T00:00:00Z")),
          event(b.companyId, at("1999-01-01T00:00:00Z")),
          event(c.companyId, at("1999-01-02T00:00:00Z")),
          event(c.companyId, at("1998-01-01T00:00:00Z"), at("1998-01-02T00:00:00Z")),
          event(b.companyId, at("2000-06-01T00:00:00Z")),
        ],
      }),
    );
    const now = at("1999-12-31T00:00:00Z");
    const outbox = new PrismaEventLogRepo({ dispatch: () => Promise.resolve() });
    const oracle = (take: number) =>
      runWithoutTenant(() =>
        prisma.$queryRaw<Array<{ companyId: string }>>(
          Prisma.sql`SELECT "companyId" FROM "EventLog" WHERE "deliveredAt" IS NULL AND "nextAttemptAt" <= ${now}
            GROUP BY "companyId" ORDER BY MIN("nextAttemptAt"), "companyId" LIMIT ${take}`,
        ),
      );
    for (const take of [1, 2, 50]) {
      const due = await runWithoutTenant(() => outbox.dueCompaniesUnscoped(now, take));
      expect(due).toEqual((await oracle(take)).map((row) => row.companyId));
    }
    const ours = (await runWithoutTenant(() => outbox.dueCompaniesUnscoped(now, 50))).filter((companyId) =>
      [a.companyId, b.companyId, c.companyId].includes(companyId),
    );
    expect(ours).toEqual([b.companyId, ...[a.companyId, c.companyId].sort()]);
  });
});
