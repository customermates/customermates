import { channelClass } from "@/ee/messaging/provider";
import { presetId } from "@/features/records/crm-preset";
import { identityKeys } from "@/features/records/record-identity";
import type { Prisma } from "@/generated/prisma";
import type { ContactSeedData } from "./contacts";
import type { SeedContext } from "./context";
import { SYNTHETIC_SERVICE_DEAL_LINKS, type DealSeedData } from "./deals";
import { fixtureId } from "./helpers";
import type { OrganizationSeedData } from "./organizations";
import { syntheticCalculationRepo } from "./records";
import type { ServiceSeedData } from "./services";
import { SYNTHETIC_ASSIGNED_TASK_INDEXES, type TaskSeedData } from "./tasks";

export type RelationshipSeedInput = ContactSeedData &
  DealSeedData &
  OrganizationSeedData &
  ServiceSeedData &
  TaskSeedData;

export async function seedRelationships(context: SeedContext, entities: RelationshipSeedInput): Promise<void> {
  const { ids } = context,
    companyId = ids.company;
  const id = (key: string) => presetId(companyId, key);
  const { contacts, contactDefinitions, organizations, deals, dealDefinitions, services, tasks, taskDefinitions } =
    entities;
  await context.prisma.$transaction(
    async (prisma) => {
      await prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${companyId}, 0))`;
      const state = await prisma.recordSchemaState.findUniqueOrThrow({
        where: { companyId },
      });
      if (state.activeOperationId) throw new Error("Cannot seed links during a CRM operation");
      const records = syntheticCalculationRepo(prisma, companyId);
      await prisma.recordIdentity.deleteMany({
        where: { companyId, id: { startsWith: "b0000000-" } },
      });
      for (const [index, contact] of contacts.entries()) {
        const key = { companyId, id: fixtureId("b0000000", index + 1) },
          value = contactDefinitions[index][2];
        await prisma.recordIdentity.create({
          data: {
            ...key,
            provider: "mail",
            channelClass: channelClass("mail"),
            value,
            keys: {
              create: identityKeys({ value }).map((value) => ({ value })),
            },
            records: {
              create: { typeId: id("contact"), recordId: contact.id },
            },
          },
        });
      }
      const links: Prisma.RecordLinkCreateManyInput[] = [];
      const link = (
        prefix: string,
        number: number,
        relationship: string,
        source: string,
        sourceId: string,
        target: string,
        targetId: string,
      ) =>
        links.push({
          companyId,
          id: fixtureId(prefix, number),
          relationId: id(relationship),
          sourceTypeId: id(source),
          sourceId,
          targetTypeId: id(target),
          targetId,
        });
      for (const [index, contact] of contacts.entries()) {
        link(
          "c0000000",
          index + 1,
          "contact.organizations",
          "contact",
          contact.id,
          "organization",
          organizations[contactDefinitions[index][3]].id,
        );
      }
      for (const [index, deal] of deals.entries()) {
        link(
          "f0000000",
          index + 1,
          "deal.organizations",
          "deal",
          deal.id,
          "organization",
          organizations[dealDefinitions[index][1]].id,
        );
        for (const [relationIndex, contactIndex] of dealDefinitions[index][2].entries()) {
          link(
            "19000000",
            index * 10 + relationIndex + 1,
            "deal.contacts",
            "deal",
            deal.id,
            "contact",
            contacts[contactIndex].id,
          );
        }
      }
      for (const [index, tuple] of SYNTHETIC_SERVICE_DEAL_LINKS.entries()) {
        const [dealIndex, serviceIndex, quantity] = tuple,
          recordId = fixtureId("12000000", index + 1),
          typeId = id("lineItem"),
          key = { companyId, typeId, id: recordId };
        const times = {
          createdAt: deals[dealIndex].createdAt,
          updatedAt: deals[dealIndex].updatedAt,
        };
        await prisma.crmRecord.upsert({
          where: { companyId_typeId_id: key },
          create: { ...key, ...times },
          update: times,
        });
        const ref = { typeId, recordId };
        await records.setValue(
          ref,
          id("lineItem.name"),
          { state: "value", value: { kind: "text", value: "Line item" } },
          state.revision,
        );
        await records.setValue(
          ref,
          id("lineItem.quantity"),
          {
            state: "value",
            value: { kind: "decimal", value: String(quantity), currency: null },
          },
          state.revision,
        );
        await records.setValue(
          ref,
          id("lineItem.pricingMode"),
          { state: "value", value: { kind: "select", value: "live" } },
          state.revision,
        );
        link("12000000", index + 1, "lineItem.deal", "lineItem", recordId, "deal", deals[dealIndex].id);
        link("12000000", index + 1, "lineItem.service", "lineItem", recordId, "service", services[serviceIndex].id);
      }
      for (const [taskIndex, definition] of taskDefinitions.entries()) {
        for (const [kind, indices, prefix] of [
          ["contact", definition[1], "1a000000"],
          ["organization", definition[2], "1b000000"],
          ["deal", definition[3], "1c000000"],
          ["service", definition[4], "1d000000"],
        ] as const) {
          for (const [relationIndex, targetIndex] of indices.entries()) {
            link(
              prefix,
              taskIndex * 10 + relationIndex + 1,
              `task.${kind}s`,
              "task",
              tasks[taskIndex].id,
              kind,
              entities[`${kind}s`][targetIndex].id,
            );
          }
        }
      }
      const namespaces = [
        ...new Map(
          links.map((row) => [
            `${row.relationId}:${String(row.id).slice(0, 9)}`,
            {
              relationId: row.relationId,
              id: { startsWith: String(row.id).slice(0, 9) },
            },
          ]),
        ).values(),
      ];
      await prisma.recordLink.deleteMany({
        where: { companyId, OR: namespaces },
      });
      for (const row of links) {
        const key = {
          companyId,
          relationId: row.relationId,
          sourceId: row.sourceId,
          targetId: row.targetId,
        };
        const data = Object.fromEntries(Object.entries(row).filter(([key]) => key !== "id"));
        await prisma.recordLink.upsert({
          where: { companyId_relationId_sourceId_targetId: key },
          create: row,
          update: data,
        });
      }
      const taskAssigned = new Set<number>(SYNTHETIC_ASSIGNED_TASK_INDEXES);
      for (const kind of ["contact", "organization", "deal", "service", "task"] as const) {
        const rows = entities[`${kind}s`],
          typeId = id(kind);
        for (const [index, row] of rows.entries()) {
          const key = { companyId, typeId, recordId: row.id, userId: ids.user };
          if (kind === "task" && !taskAssigned.has(index)) await prisma.recordAssignment.deleteMany({ where: key });
          else {
            await prisma.recordAssignment.upsert({
              where: { companyId_typeId_recordId_userId: key },
              create: key,
              update: {},
            });
          }
        }
      }
    },
    { timeout: 60000 },
  );
}
