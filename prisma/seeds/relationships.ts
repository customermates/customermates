import { channelClass } from "@/ee/messaging/provider";
import { presetId } from "@/features/records/crm-preset";
import { identityKeys, normalizedIdentity } from "@/features/records/record-identity";
import type { Prisma } from "@/generated/prisma";
import type { ContactSeedData } from "./contacts";
import type { SeedContext } from "./context";
import type { DealSeedData } from "./deals";
import { NORTHWIND_LINK_PREFIXES, buildNorthwindIdentities, buildNorthwindRecords } from "./northwind-records";
import type { OrganizationSeedData } from "./organizations";
import type { ServiceSeedData } from "./services";
import type { TaskSeedData } from "./tasks";

export type RelationshipSeedInput = ContactSeedData &
  DealSeedData &
  OrganizationSeedData &
  ServiceSeedData &
  TaskSeedData;

const CHUNK = 2000;

/** Channels (mail, LinkedIn), relationship links and record assignments of the demo records. */
export async function seedRelationships(context: SeedContext, entities: RelationshipSeedInput): Promise<void> {
  const companyId = context.ids.company;
  const id = (key: string) => presetId(companyId, key);
  const { links, assignments, records } = buildNorthwindRecords(companyId);
  await context.prisma.$transaction(
    async (prisma) => {
      await prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${companyId}, 0))`;
      const state = await prisma.recordSchemaState.findUniqueOrThrow({ where: { companyId } });
      if (state.activeOperationId) throw new Error("Cannot seed links during a CRM operation");

      await prisma.recordIdentity.deleteMany({ where: { companyId, id: { startsWith: "b0000000-" } } });
      const identities = buildNorthwindIdentities().flatMap((identity) => {
        const normalized = normalizedIdentity({ provider: identity.provider, value: identity.value });
        return normalized
          ? [{ ...identity, value: normalized.value, channelClass: channelClass(identity.provider) }]
          : [];
      });
      await prisma.recordIdentity.createMany({
        data: identities.map(({ id: identityId, provider, value, channelClass: identityClass }) => ({
          companyId,
          id: identityId,
          provider,
          channelClass: identityClass,
          value,
        })),
      });
      await prisma.recordIdentityKey.createMany({
        data: identities.flatMap(({ id: identityId, value, channelClass: identityClass }) =>
          identityKeys({ value }).map((key) => ({ companyId, identityId, channelClass: identityClass, value: key })),
        ),
        skipDuplicates: true,
      });
      await prisma.recordIdentityLink.createMany({
        data: identities.map(({ id: identityId, typeKey, recordId }) => ({
          companyId,
          identityId,
          typeId: id(typeKey),
          recordId,
        })),
        skipDuplicates: true,
      });

      await prisma.recordLink.deleteMany({
        where: {
          companyId,
          OR: Object.entries(NORTHWIND_LINK_PREFIXES).map(([relationKey, prefix]) => ({
            relationId: id(relationKey),
            id: { startsWith: `${prefix}-` },
          })),
        },
      });
      const rows: Prisma.RecordLinkCreateManyInput[] = links.map((link) => ({
        companyId,
        id: link.prefix,
        relationId: id(link.relationKey),
        sourceTypeId: id(link.sourceKey),
        sourceId: link.sourceId,
        targetTypeId: id(link.targetKey),
        targetId: link.targetId,
      }));
      for (let start = 0; start < rows.length; start += CHUNK)
        await prisma.recordLink.createMany({ data: rows.slice(start, start + CHUNK), skipDuplicates: true });

      const fixtureRecords = [
        ...records.filter((record) => record.typeKey !== "lineItem"),
        ...(["contact", "organization", "deal", "service", "task"] as const).flatMap((kind) =>
          entities[`${kind}s`].map((row) => ({ typeKey: kind as string, id: row.id })),
        ),
      ];
      for (const typeKey of new Set(fixtureRecords.map((record) => record.typeKey))) {
        await prisma.recordAssignment.deleteMany({
          where: {
            companyId,
            typeId: id(typeKey),
            recordId: { in: fixtureRecords.filter((record) => record.typeKey === typeKey).map((record) => record.id) },
          },
        });
      }
      await prisma.recordAssignment.createMany({
        data: assignments.map(({ typeKey, recordId, userId }) => ({
          companyId,
          typeId: id(typeKey),
          recordId,
          userId,
        })),
        skipDuplicates: true,
      });
    },
    { maxWait: 60000, timeout: 600000 },
  );
}
