import { PrismaPg } from "@prisma/adapter-pg";
import type { ClientBase } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma";
import { SYNTHETIC_SEED_USER } from "@/core/config/synthetic-seed-user";
import { presetId } from "@/features/records/crm-preset";
import { RecordModelSchema } from "@/features/records/record-model.schema";
import { recordJson } from "@/features/records/record-storage";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { populateLegacyWorkspace } from "@/tests/helpers/legacy-crm-fixture";
import {
  applyConfigurableRecordsMigration,
  createLegacyMigrationDatabase,
  legacyFixtureWriter,
} from "@/tests/helpers/legacy-migration-database";
import { createSeedContext, SEED_IDS } from "../seeds/context";
import { runSyntheticSeed } from "../seeds/run";
import { SOLUTION_WORKSPACES } from "../seeds/solutions/solution-workspaces";
import { solutionWorkspacePlans } from "../seeds/solutions/seed-solutions";

const database = getLocalDatabaseTestUrl();
const suite = database ? describe : describe.skip;
const companyId = SEED_IDS.company;
const DEMO_COMPANIES = SOLUTION_WORKSPACES.map((workspace) => workspace.companyId);
const TEAM_TYPES = (solutionWorkspacePlans().find(({ workspace }) => workspace.team)?.content.lists ?? [])
  .map((list) => list.key)
  .concat("lineItem");

type Fixture = Awaited<ReturnType<typeof createLegacyMigrationDatabase>> & { prisma: PrismaClient };

async function migratedDatabase(legacy: (client: ClientBase) => Promise<void> = () => Promise.resolve()) {
  const fixture = await createLegacyMigrationDatabase(database);
  try {
    await legacy(fixture.client);
    await applyConfigurableRecordsMigration(fixture.client);
  } catch (error) {
    await fixture.close();
    throw error;
  }
  return { ...fixture, prisma: new PrismaClient({ adapter: new PrismaPg({ connectionString: fixture.url }) }) };
}

function seed(fixture: Fixture) {
  return runSyntheticSeed(
    createSeedContext(fixture.prisma, {
      seedUserEmail: SYNTHETIC_SEED_USER.email,
      sharedUserPassword: "synthetic-local-test",
    }),
  );
}

async function catalogSlugs(fixture: Fixture) {
  const companies = await fixture.prisma.company.findMany({
    where: { id: { in: DEMO_COMPANIES } },
    select: { id: true, slug: true },
  });
  return DEMO_COMPANIES.map((id) => companies.find((company) => company.id === id));
}

const BILLING_USAGE_LEDGER_TABLES = new Set(["BillingUsageInterval", "BillingUsageWorkspace"]);

async function tenantTables(client: ClientBase) {
  const { rows } = await client.query<{ table: string }>(
    `SELECT table_name AS table FROM information_schema.columns
     WHERE table_schema = current_schema() AND column_name = 'companyId' ORDER BY table_name`,
  );
  return rows.map((row) => row.table).filter((table) => !BILLING_USAGE_LEDGER_TABLES.has(table));
}

/** Row counts of every tenant table for one company, plus the stored record model and the record ids. */
async function workspaceState(fixture: Fixture, company: string) {
  const counts: Record<string, number> = {};
  for (const table of await tenantTables(fixture.client)) {
    const { rows } = await fixture.client.query<{ count: string }>(
      `SELECT count(*) FROM "${table}" WHERE "companyId" = $1`,
      [company],
    );
    counts[table] = Number(rows[0].count);
  }
  const state = await fixture.prisma.recordSchemaState.findUnique({ where: { companyId: company } });
  const revision =
    state &&
    (await fixture.prisma.recordSchemaRevision.findUniqueOrThrow({
      where: { companyId_revision: { companyId: company, revision: state.revision } },
    }));
  const records = await fixture.prisma.crmRecord.findMany({
    where: { companyId: company },
    select: { typeId: true, id: true, deletedAt: true },
    orderBy: [{ typeId: "asc" }, { id: "asc" }],
  });
  return { counts, model: revision?.snapshot ?? null, records };
}

/**
 * Every tenant row of every demo workspace apart from its timestamps, for a repeated seed on the same database.
 * Routine runs and agent conversations are anchored to the time of the seed run, so timestamps move on every run.
 */
async function workspaceContent(fixture: Fixture) {
  const content: Record<string, string> = {};
  for (const table of await tenantTables(fixture.client)) {
    const { rows: timestamps } = await fixture.client.query<{ column: string }>(
      `SELECT column_name AS column FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = $1 AND data_type LIKE 'timestamp%'`,
      [table],
    );
    const { rows } = await fixture.client.query<{ digest: string | null }>(
      `SELECT md5(string_agg(row, ',' ORDER BY row)) AS digest FROM (
         SELECT (to_jsonb(t) - $2::text[])::text AS row FROM "${table}" t WHERE "companyId" = ANY($1::text[])
       ) rows`,
      [DEMO_COMPANIES, timestamps.map((row) => row.column)],
    );
    content[table] = rows[0].digest ?? "";
  }
  return content;
}

suite("synthetic seed on an existing synthetic workspace", { timeout: 900000 }, () => {
  let fresh: Fixture;
  let freshState: Awaited<ReturnType<typeof workspaceState>>;

  beforeAll(async () => {
    fresh = await migratedDatabase();
    await seed(fresh);
    freshState = await workspaceState(fresh, companyId);
  }, 900000);

  afterAll(async () => {
    await fresh?.prisma.$disconnect();
    await fresh?.close();
  });

  it("seeds every list of the team workspace and every demo workspace on a fresh database", async () => {
    const types = await fresh.prisma.recordTypeDefinition.findMany({ where: { companyId }, select: { id: true } });
    expect(types.map((type) => type.id)).toEqual(
      expect.arrayContaining(TEAM_TYPES.map((key) => presetId(companyId, key))),
    );
    for (const demo of DEMO_COMPANIES)
      expect(await fresh.prisma.crmRecord.count({ where: { companyId: demo } }), demo).toBeGreaterThan(30);
    expect(await catalogSlugs(fresh)).toEqual(
      SOLUTION_WORKSPACES.map(({ companyId, slug }) => ({ id: companyId, slug })),
    );
    for (const key of TEAM_TYPES) {
      expect(freshState.records.filter((record) => record.typeId === presetId(companyId, key)).length).toBeGreaterThan(
        0,
      );
    }
  });

  it("leaves the workspace unchanged when the seed runs again", async () => {
    const before = await workspaceContent(fresh);
    const slugs = await catalogSlugs(fresh);
    expect((await seed(fresh)).slugsAssigned).toBe(0);
    expect(await catalogSlugs(fresh)).toEqual(slugs);
    expect(await workspaceState(fresh, companyId)).toEqual(freshState);
    expect(await workspaceContent(fresh)).toEqual(before);
  });

  it("rebuilds a workspace seeded on an older model without a later list", async () => {
    const ticket = presetId(companyId, "service");
    const state = await fresh.prisma.recordSchemaState.findUniqueOrThrow({ where: { companyId } });
    const revision = await fresh.prisma.recordSchemaRevision.findUniqueOrThrow({
      where: { companyId_revision: { companyId, revision: state.revision } },
    });
    const model = RecordModelSchema.parse(revision.snapshot);
    const older = {
      ...model,
      types: model.types.filter((type) => type.id !== ticket),
      fields: model.fields.filter((field) => field.typeId !== ticket),
      relationships: model.relationships.filter(
        (relation) => relation.sourceTypeId !== ticket && relation.targetTypeId !== ticket,
      ),
    };
    await fresh.prisma.recordEventSubscription.deleteMany({ where: { companyId, typeId: ticket } });
    await fresh.prisma.recordTypeDefinition.delete({ where: { companyId_id: { companyId, id: ticket } } });
    await fresh.prisma.recordSchemaRevision.update({
      where: { companyId_revision: { companyId, revision: state.revision } },
      data: { snapshot: recordJson(older) },
    });
    expect(await fresh.prisma.crmRecord.count({ where: { companyId, typeId: ticket } })).toBe(0);

    await seed(fresh);

    expect(await workspaceState(fresh, companyId)).toEqual(freshState);
  });

  it("rebuilds a synthetic company the release migration converted, without touching another company", async () => {
    let other = "";
    const converted = await migratedDatabase(async (client) => {
      other = (await populateLegacyWorkspace(client)).companyId;
      const db = legacyFixtureWriter(client);
      await db.company.create({ data: { id: companyId, currency: "eur" } });
      const role = await db.userRole.create({ data: { companyId, name: "Admin", isSystemRole: true } });
      await db.user.create({
        data: {
          id: SEED_IDS.user,
          companyId,
          roleId: role.id,
          firstName: "Max",
          lastName: "Bergmann",
          status: "active",
          email: SYNTHETIC_SEED_USER.email,
        },
      });
      await db.contact.create({ data: { companyId, firstName: "Older", lastName: "Seed" } });
    });
    try {
      expect(await converted.prisma.recordSchemaState.count({ where: { companyId } })).toBe(1);
      const otherBefore = await workspaceState(converted, other);
      const otherValueDigest = () =>
        converted.client.query(
          `SELECT md5(string_agg(t::text, ',' ORDER BY t::text)) FROM "RecordValue" t WHERE "companyId" = $1`,
          [other],
        );
      const otherValues = (await otherValueDigest()).rows;

      await seed(converted);

      expect(await workspaceState(converted, companyId)).toEqual(freshState);
      expect(await workspaceState(converted, other)).toEqual(otherBefore);
      expect((await otherValueDigest()).rows).toEqual(otherValues);
    } finally {
      await converted.prisma.$disconnect();
      await converted.close();
    }
  });
});
