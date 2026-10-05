import { PermissionService } from "@/core/base/permission.service";
import type { RecordRef, RecordScalar } from "../record-model.schema";
import type { RecordMutation } from "../record-query.schema";

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
const { runWithTenant, runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { runInTransaction } = await import("@/core/decorators/transaction-runner");
const { PrismaRecordRepo } = await import("../prisma-record.repository");
const { PrismaUserRepo } = await import("@/features/user/prisma-user.repository");
const { RecordAccessPolicy } = await import("../record-access");
const { RecordCalculationService } = await import("../record-calculation.service");
const { RecordWriteService } = await import("../record-write.service");
const { MutateRecordInteractor } = await import("../mutate-record.interactor");
const { QueryRecordsInteractor } = await import("../query-records.interactor");
const { GetRecordInteractor } = await import("../get-record.interactor");
const { createCrmPreset, presetId } = await import("../crm-preset");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companies: string[] = [];
const text = (value: string): RecordScalar => ({ kind: "text", value });

async function fixture() {
  const seed = await runWithoutTenant(async () => {
    const company = await prisma.company.create({ data: {} });
    companies.push(company.id);
    const adminRole = await prisma.userRole.create({
      data: { companyId: company.id, name: "Administrator", isSystemRole: true },
    });
    const memberRole = await prisma.userRole.create({ data: { companyId: company.id, name: "Member" } });
    const [admin, member] = await Promise.all(
      [adminRole, memberRole].map((role, index) =>
        prisma.user.create({
          data: {
            companyId: company.id,
            roleId: role.id,
            firstName: index ? "Member" : "Admin",
            lastName: "Test",
            email: `${randomUUID()}@example.test`,
            status: "active",
          },
        }),
      ),
    );
    return { company, adminRole, memberRole, admin, member };
  });
  const admin = createMockUser({ ...seed.admin, role: { ...seed.adminRole, permissions: [] } });
  const member = createMockUser({ ...seed.member, role: { ...seed.memberRole, permissions: [] } });
  const repo = new PrismaRecordRepo();
  const policy = new RecordAccessPolicy(new PrismaUserRepo(new PermissionService()), repo);
  const calculations = new RecordCalculationService(repo);
  const mutate = new MutateRecordInteractor(
    repo,
    policy,
    new RecordWriteService(repo, policy, calculations),
    { getDetails: () => Promise.resolve({ currency: "EUR" }) },
    { dispatch: () => Promise.resolve() },
  );
  const read = new GetRecordInteractor(repo, policy);
  const query = new QueryRecordsInteractor(repo, policy);
  const id = (key: string) => presetId(seed.company.id, key);
  await runWithTenant(admin, () =>
    runInTransaction(
      async () => {
        await repo.saveModel(createCrmPreset(seed.company.id, "EUR"), admin.id);
        await repo.setGrants(id("deal"), [{ roleId: seed.memberRole.id, actions: ["readAll", "update"] }]);
        await repo.setGrants(id("contact"), [{ roleId: seed.memberRole.id, actions: ["readOwn"] }]);
      },
      { timeout: 30000 },
    ),
  );
  const mutation = (value: RecordMutation, as = admin) =>
    runWithTenant(as, async () => {
      const state = await runWithoutTenant(() =>
        prisma.recordSchemaState.findUniqueOrThrow({ where: { companyId: seed.company.id } }),
      );
      return mutate.invoke({ mutation: value, expectedRevision: state.revision, idempotencyKey: randomUUID() });
    });
  const created = async (value: Extract<RecordMutation, { action: "create" }>) => {
    const result = await mutation(value);
    if (!result.ok || result.data.status !== "completed") throw new Error(JSON.stringify(result));
    const ref = result.data.refs.find((candidate) => candidate.typeId === value.typeId);
    if (!ref) throw new Error("Fixture creation returned no reference");
    return ref;
  };
  const links = (deal: RecordRef) =>
    runWithoutTenant(() =>
      prisma.recordLink.findMany({
        where: { companyId: seed.company.id, relationId: id("deal.contacts"), sourceId: deal.recordId },
        select: { targetId: true },
      }),
    ).then((rows) => rows.map((row) => row.targetId).sort());
  const version = async (ref: RecordRef) => {
    const result = await runWithTenant(admin, () => read.invoke(ref));
    if (!result.ok) throw new Error("Record could not be read");
    return result.data.version;
  };
  return { seed, admin, member, id, mutation, created, links, version, query, read };
}

afterAll(async () => {
  if (companies.length) await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companies } } }));
});

describeDatabase("record links outside the caller's access", () => {
  it("lists only readable linked records, and links or unlinks only those, keeping hidden links intact", async () => {
    const f = await fixture();
    const deal = await f.created({
      action: "create",
      typeId: f.id("deal"),
      fields: [{ fieldId: f.id("deal.name"), value: text("Atlas") }],
    });
    const visible = await f.created({
      action: "create",
      typeId: f.id("contact"),
      fields: [{ fieldId: f.id("contact.firstName"), value: text("Ada") }],
      assignedUserIds: [f.member.id],
    });
    const hidden = await f.created({
      action: "create",
      typeId: f.id("contact"),
      fields: [{ fieldId: f.id("contact.firstName"), value: text("Bea") }],
    });
    for (const target of [visible, hidden]) {
      expect(
        await f.mutation({ action: "link", relationId: f.id("deal.contacts"), source: deal, target }),
      ).toMatchObject({ ok: true });
    }
    expect(await f.links(deal)).toEqual([hidden.recordId, visible.recordId].sort());

    const listed = await runWithTenant(f.member, () =>
      f.query.invoke({
        typeId: f.id("deal"),
        includeRelationships: [{ relationId: f.id("deal.contacts"), direction: "outgoing", limit: 25 }],
      } as never),
    );
    if (!listed.ok) throw new Error("Member query failed");
    const [relationship] =
      listed.data.records.find((record) => record.ref.recordId === deal.recordId)?.relationships ?? [];
    expect(relationship).toMatchObject({ readableCount: 1, hasMore: false });
    expect(relationship?.records.map((record) => record.ref.recordId)).toEqual([visible.recordId]);

    expect(
      await f.mutation({ action: "unlink", relationId: f.id("deal.contacts"), source: deal, target: hidden }, f.member),
    ).toMatchObject({ ok: false });
    expect(await f.links(deal)).toEqual([hidden.recordId, visible.recordId].sort());

    expect(
      await f.mutation(
        {
          action: "update",
          ref: deal,
          expectedVersion: await f.version(deal),
          fields: [],
          linkChanges: [
            { action: "unlink", relationId: f.id("deal.contacts"), direction: "outgoing", record: visible },
          ],
        },
        f.member,
      ),
    ).toMatchObject({ ok: true });
    expect(await f.links(deal)).toEqual([hidden.recordId]);

    expect(
      await f.mutation({ action: "link", relationId: f.id("deal.contacts"), source: deal, target: hidden }, f.member),
    ).toMatchObject({ ok: false });
    expect(
      await f.mutation({ action: "link", relationId: f.id("deal.contacts"), source: deal, target: visible }, f.member),
    ).toMatchObject({ ok: true });
    expect(await f.links(deal)).toEqual([hidden.recordId, visible.recordId].sort());
  }, 120_000);
});
