import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createLegacyMigrationDatabase, CRM_CONTRACTION_MIGRATION } from "@/tests/helpers/legacy-migration-database";
import { LEGACY_CRM_TABLES } from "../record-migrations/v8/tables";
import { createSeedContext, SEED_IDS } from "../seeds/context";
import { runSyntheticSeed } from "../seeds/run";
import { presetId } from "@/features/records/crm-preset";

const database = getLocalDatabaseTestUrl();
const suite = database ? describe : describe.skip;
suite("generic synthetic seed convergence", { timeout: 180000 }, () => {
  it("seeds twice after physical contraction, preserves recreated links and unrelated records, and removes only stale fixtures", async () => {
    const fixture = await createLegacyMigrationDatabase(database);
    let prisma: PrismaClient | undefined;
    try {
      const migrations = (await readdir(resolve("prisma/migrations")))
        .filter((entry) => /^\d+_/.test(entry) && entry >= CRM_CONTRACTION_MIGRATION)
        .sort();
      for (const migration of migrations)
        await fixture.client.query(await readFile(resolve("prisma/migrations", migration, "migration.sql"), "utf8"));
      prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: fixture.url }) });
      const context = createSeedContext(prisma, {
        seedUserEmail: "max.bergmann@customermates.com",
        sharedUserPassword: "synthetic-local-test",
      });
      const entities = await runSyntheticSeed(context);
      const companyId = SEED_IDS.company,
        typeId = presetId(companyId, "contact");
      const link = await prisma.recordLink.findFirstOrThrow({
        where: { companyId, relationId: presetId(companyId, "contact.organizations") },
      });
      await prisma.recordLink.delete({
        where: { companyId_relationId_id: { companyId, relationId: link.relationId, id: link.id } },
      });
      const replacementId = randomUUID();
      await prisma.recordLink.create({ data: { ...link, id: replacementId } });
      const unrelatedId = randomUUID(),
        staleId = "60000000-0000-4000-8000-999999999999";
      await prisma.crmRecord.createMany({ data: [unrelatedId, staleId].map((id) => ({ companyId, typeId, id })) });
      const counts = {
        fields: await prisma.recordFieldDefinition.count({ where: { companyId } }),
        links: await prisma.recordLink.count({ where: { companyId } }),
        histories: await prisma.auditLog.count({ where: { companyId } }),
        deliveries: await prisma.webhookDelivery.count({ where: { companyId } }),
      };
      await runSyntheticSeed(context);
      expect(
        await prisma.crmRecord.findUnique({ where: { companyId_typeId_id: { companyId, typeId, id: unrelatedId } } }),
      ).not.toBeNull();
      expect(
        await prisma.crmRecord.findUnique({ where: { companyId_typeId_id: { companyId, typeId, id: staleId } } }),
      ).toBeNull();
      expect(
        await prisma.recordLink.findUnique({
          where: { companyId_relationId_id: { companyId, relationId: link.relationId, id: replacementId } },
        }),
      ).not.toBeNull();
      expect(await prisma.recordFieldDefinition.count({ where: { companyId } })).toBe(counts.fields);
      expect(await prisma.recordLink.count({ where: { companyId } })).toBe(counts.links);
      expect(await prisma.auditLog.count({ where: { companyId } })).toBe(counts.histories);
      expect(await prisma.webhookDelivery.count({ where: { companyId } })).toBe(counts.deliveries);
      for (const kind of ["contact", "organization", "deal", "service", "task"] as const) {
        expect(await prisma.crmRecord.count({ where: { companyId, typeId: presetId(companyId, kind) } })).toBe(
          entities[`${kind}s`].length + (kind === "contact" ? 1 : 0),
        );
      }

      const hooks = await prisma.webhook.findMany({ where: { companyId } });
      expect(
        hooks.every((hook) => hook.events.every((event) => !/^(contact|organization|deal|service|task)\./.test(event))),
      ).toBe(true);
      const routines = await prisma.routine.findMany({ where: { companyId } });
      expect(
        routines.every((routine) =>
          routine.triggerEvents.every((event) => !/^(contact|organization|deal|service|task)\./.test(event)),
        ),
      ).toBe(true);
      expect(await prisma.recordEventSubscription.count({ where: { companyId } })).toBeGreaterThan(0);
      expect(
        (
          await fixture.client.query(
            "SELECT name,to_regclass(format('%I',name)) AS table FROM unnest($1::text[]) name",
            [LEGACY_CRM_TABLES],
          )
        ).rows.every((row) => row.table === null),
      ).toBe(true);
    } finally {
      await prisma?.$disconnect();
      await fixture.close();
    }
  });
});
