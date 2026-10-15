import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import {
  applyConfigurableRecordsMigration,
  createLegacyMigrationDatabase,
  LEGACY_CRM_TABLES,
} from "@/tests/helpers/legacy-migration-database";
import { createSeedContext, SEED_IDS } from "../seeds/context";
import { northwindDataset } from "../seeds/northwind-data";
import { northwindRecordFiles } from "../seeds/northwind-files";
import { northwindFileStorageKey } from "../seeds/record-files";
import { runSyntheticSeed } from "../seeds/run";
import { presetId } from "@/features/records/crm-preset";

const database = getLocalDatabaseTestUrl();
const suite = database ? describe : describe.skip;
suite("generic synthetic seed convergence", { timeout: 180000 }, () => {
  it("seeds twice after the configurable records migration, preserves recreated links and unrelated records, and removes only stale fixtures", async () => {
    const fixture = await createLegacyMigrationDatabase(database);
    let prisma: PrismaClient | undefined;
    try {
      await applyConfigurableRecordsMigration(fixture.client);
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
        histories: await prisma.eventLog.count({ where: { companyId } }),
        deliveries: await prisma.webhookDelivery.count({ where: { companyId } }),
        files: await prisma.recordFile.count({ where: { companyId } }),
        fileParts: await prisma.recordFileContent.count({ where: { companyId } }),
        fileChunks: await prisma.recordFileChunk.count({ where: { companyId } }),
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
      expect(await prisma.eventLog.count({ where: { companyId } })).toBe(counts.histories);
      expect(await prisma.webhookDelivery.count({ where: { companyId } })).toBe(counts.deliveries);
      expect(await prisma.recordFile.count({ where: { companyId } })).toBe(counts.files);
      expect(await prisma.recordFileContent.count({ where: { companyId } })).toBe(counts.fileParts);
      expect(await prisma.recordFileChunk.count({ where: { companyId } })).toBe(counts.fileChunks);
      const organizations = northwindDataset().organizations;
      for (const file of northwindRecordFiles()) {
        const stored = await prisma.recordFile.findUniqueOrThrow({ where: { id: file.id } });
        expect(stored).toMatchObject({
          companyId,
          recordId: organizations[file.organizationIndex].id,
          fieldId: presetId(companyId, "organization.documents"),
          status: "ready",
          storageDriver: "database",
          extractionStatus: "done",
        });
        const parts = await prisma.recordFileContent.findMany({
          where: { companyId, fileKey: northwindFileStorageKey(companyId, file.id) },
        });
        expect(parts.map(({ data }) => Buffer.from(data).toString("utf8"))).toEqual([file.content]);
        expect(Number(stored.size)).toBe(Buffer.byteLength(file.content));
        expect(await prisma.recordFileChunk.count({ where: { companyId, fileId: file.id } })).toBeGreaterThan(0);
        const value = await prisma.recordValue.findUniqueOrThrow({
          where: {
            companyId_typeId_recordId_fieldId: {
              companyId,
              typeId: presetId(companyId, "organization"),
              recordId: stored.recordId ?? "",
              fieldId: stored.fieldId,
            },
          },
        });
        expect(value.textListValue).toContain(file.id);
      }
      for (const kind of ["contact", "organization", "deal", "service", "task"] as const) {
        // Records in Trash (the seeded Trash fixtures) are not part of the live lists.
        expect(
          await prisma.crmRecord.count({ where: { companyId, typeId: presetId(companyId, kind), deletedAt: null } }),
        ).toBe(entities[`${kind}s`].length + (kind === "contact" ? 1 : 0));
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
