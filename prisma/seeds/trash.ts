import { presetId } from "@/features/records/crm-preset";
import { encodeRecordValue } from "@/features/records/record-storage";
import { TRASH_RETENTION_DAYS } from "@/features/trash/trash-retention";
import { Prisma } from "@/generated/prisma";

import type { SeedContext } from "./context";
import { fixtureId } from "./helpers";
import { NORTHWIND_STORY_END_MS, northwindAt, northwindDataset } from "./northwind-data";
import { NORTHWIND_MEMBER_IDS } from "./northwind-model";

const DAY = 86_400_000;
const RECORD_PREFIX = "4d000000";
const VIEW_PREFIX = "4d100000";
const ITEM_PREFIX = "4d200000";
const BATCH_PREFIX = "4d300000";

/**
 * Trash of the demo: three records deleted last week (a duplicate organization from the trade fair import, a badge
 * scan contact and an obsolete task), a saved view and the retired "Legacy account ID" field. Everything is within
 * the retention period and restorable.
 */
export async function seedTrash(context: SeedContext): Promise<void> {
  const { prisma } = context;
  const companyId = context.ids.company;
  const id = (key: string) => presetId(companyId, key);
  const data = northwindDataset();
  const duplicateOf = data.organizations[0];
  if (!duplicateOf) throw new Error("Missing Northwind organization for the trashed duplicate");
  const deletedAt = (daysAgo: number) => northwindAt(NORTHWIND_STORY_END_MS - daysAgo * DAY);
  const expiresAt = (date: Date) => new Date(date.getTime() + TRASH_RETENTION_DAYS * DAY);
  const records = [
    {
      typeKey: "organization",
      name: `${duplicateOf.name} (duplicate)`,
      by: NORTHWIND_MEMBER_IDS.sofiaRossi,
      daysAgo: 2,
    },
    { typeKey: "contact", name: "Badge Scan", by: NORTHWIND_MEMBER_IDS.claraNeumann, daysAgo: 4 },
    { typeKey: "task", name: "Call back about the cancelled pilot", by: NORTHWIND_MEMBER_IDS.marcoSilva, daysAgo: 6 },
  ].map((record, index) => ({
    ...record,
    id: fixtureId(RECORD_PREFIX, index + 1),
    itemId: fixtureId(ITEM_PREFIX, index + 1),
    batchId: fixtureId(BATCH_PREFIX, index + 1),
    deletedAt: deletedAt(record.daysAgo),
  }));
  const view = {
    id: fixtureId(VIEW_PREFIX, 1),
    itemId: fixtureId(ITEM_PREFIX, 10),
    batchId: fixtureId(BATCH_PREFIX, 10),
    surfaceKey: `records:${id("deal")}`,
    name: "Q1 pipeline (old)",
    deletedAt: deletedAt(3),
  };
  const field = {
    itemId: fixtureId(ITEM_PREFIX, 20),
    batchId: fixtureId(BATCH_PREFIX, 20),
    deletedAt: deletedAt(5),
  };

  await prisma.$transaction(
    async (tx) => {
      await tx.trashItem.deleteMany({ where: { companyId, id: { startsWith: `${ITEM_PREFIX}-` } } });
      await tx.crmRecord.deleteMany({ where: { companyId, id: { startsWith: `${RECORD_PREFIX}-` } } });
      await tx.dataView.deleteMany({ where: { companyId, id: { startsWith: `${VIEW_PREFIX}-` } } });
      const state = await tx.recordSchemaState.findUniqueOrThrow({ where: { companyId } });

      for (const record of records) {
        const typeId = id(record.typeKey);
        const createdAt = new Date(record.deletedAt.getTime() - 20 * DAY);
        await tx.crmRecord.create({
          data: {
            companyId,
            typeId,
            id: record.id,
            createdAt,
            updatedAt: record.deletedAt,
            deletedAt: record.deletedAt,
            trashItemId: record.itemId,
          },
        });
        const values: Array<[string, string]> =
          record.typeKey === "contact"
            ? [
                ["contact.firstName", "Badge"],
                ["contact.lastName", "Scan"],
                ["contact.name", record.name],
              ]
            : [[`${record.typeKey}.name`, record.name]];
        for (const [fieldKey, text] of values) {
          const encoded = encodeRecordValue({ state: "value", value: { kind: "text", value: text } });
          await tx.recordValue.create({
            data: {
              companyId,
              typeId,
              recordId: record.id,
              fieldId: id(fieldKey),
              ...encoded,
              jsonValue: encoded.jsonValue ?? Prisma.DbNull,
              schemaRevision: state.revision,
            },
          });
        }
      }
      await tx.dataView.create({
        data: {
          id: view.id,
          companyId,
          userId: NORTHWIND_MEMBER_IDS.maxBergmann,
          surfaceKey: view.surfaceKey,
          name: view.name,
          position: 99,
          viewMode: "table",
          createdAt: new Date(view.deletedAt.getTime() - 120 * DAY),
          updatedAt: view.deletedAt,
          deletedAt: view.deletedAt,
        },
      });
      await tx.trashItem.createMany({
        data: [
          ...records.map((record) => ({
            companyId,
            id: record.itemId,
            kind: "record" as const,
            targetId: record.id,
            typeId: id(record.typeKey),
            label: record.name,
            deletedById: record.by,
            deletedAt: record.deletedAt,
            expiresAt: expiresAt(record.deletedAt),
            batchId: record.batchId,
          })),
          {
            companyId,
            id: view.itemId,
            kind: "view" as const,
            targetId: view.id,
            typeId: id("deal"),
            surfaceKey: view.surfaceKey,
            ownerUserId: NORTHWIND_MEMBER_IDS.maxBergmann,
            label: view.name,
            deletedById: NORTHWIND_MEMBER_IDS.maxBergmann,
            deletedAt: view.deletedAt,
            expiresAt: expiresAt(view.deletedAt),
            batchId: view.batchId,
          },
          {
            companyId,
            id: field.itemId,
            kind: "field" as const,
            targetId: id("organization.legacyAccountId"),
            typeId: id("organization"),
            label: "Legacy account ID",
            deletedById: NORTHWIND_MEMBER_IDS.maxBergmann,
            deletedAt: field.deletedAt,
            expiresAt: expiresAt(field.deletedAt),
            batchId: field.batchId,
          },
        ],
      });
    },
    { maxWait: 60000, timeout: 600000 },
  );
}
