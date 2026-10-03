import type { PrismaClient } from "@/generated/prisma";
import { presetId } from "@/features/records/crm-preset";
import { RecordModelSchema, type RecordScalar } from "@/features/records/record-model.schema";
import { decodeRecordValue } from "@/features/records/record-storage";
import type { LegacyType } from "../record-migrations/v2/legacy-model";

function historicalValue(value: RecordScalar | null): string | null {
  if (!value) return null;
  if (value.kind === "richText") return value.documentJson;
  if (value.kind === "range") return `${value.start ?? ""},${value.end ?? ""}`;
  if (value.kind === "textList") return value.value.join(",");
  return String(value.value);
}

/** Synthetic v1 audit/webhook payloads are built from generic storage, never old tables. */
export async function historicalRecordFixtureRows(
  prisma: PrismaClient,
  companyId: string,
  kind: LegacyType,
  ids?: string[],
) {
  const state = await prisma.recordSchemaState.findUniqueOrThrow({ where: { companyId } });
  const revision = await prisma.recordSchemaRevision.findUniqueOrThrow({
    where: { companyId_revision: { companyId, revision: state.revision } },
  });
  const model = RecordModelSchema.parse(revision.snapshot),
    typeId = presetId(companyId, kind);
  const rows = await prisma.crmRecord.findMany({
    where: { companyId },
    include: {
      values: true,
      identities: { include: { identity: true } },
      assignments: {
        include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, email: true } } },
      },
    },
    orderBy: { id: "asc" },
  });
  const links = await prisma.recordLink.findMany({ where: { companyId } });
  const scalars = (row: (typeof rows)[number]) =>
    new Map(
      model.fields
        .filter((field) => field.typeId === row.typeId)
        .map((field) => {
          const result = decodeRecordValue(
            row.values.find((value) => value.fieldId === field.id),
            field,
          );
          if (result.state === "error" || result.state === "restricted")
            throw new Error("Synthetic history cannot encode an invalid calculation");
          return [field.id, result.state === "value" ? result.value : null];
        }),
    );
  const values = new Map(rows.map((row) => [JSON.stringify([row.typeId, row.id]), scalars(row)]));
  const scalar = (row: (typeof rows)[number], key: string) =>
    values.get(JSON.stringify([row.typeId, row.id]))?.get(presetId(companyId, key)) ?? null;
  const text = (row: (typeof rows)[number], key: string) => historicalValue(scalar(row, key)) ?? "";
  const number = (row: (typeof rows)[number], key: string) => {
    const value = scalar(row, key);
    return value?.kind === "decimal" ? Number(value.value) : 0;
  };
  const reference = (row: (typeof rows)[number], targetKind: string) => ({
    id: row.id,
    name: text(row, `${targetKind}.name`),
    firstName: text(row, "contact.firstName"),
    lastName: text(row, "contact.lastName"),
    avatarUrl: historicalValue(scalar(row, "contact.avatarUrl")),
    amount: number(row, "service.amount"),
    type: row.protectedKind === "membershipAuthorization" ? ("userPendingAuthorization" as const) : ("custom" as const),
  });
  const related = (row: (typeof rows)[number], targetKind: LegacyType) => {
    const matching = links.filter(
      (link) =>
        (link.sourceTypeId === row.typeId &&
          link.sourceId === row.id &&
          link.targetTypeId === presetId(companyId, targetKind)) ||
        (link.targetTypeId === row.typeId &&
          link.targetId === row.id &&
          link.sourceTypeId === presetId(companyId, targetKind)),
    );
    return matching.flatMap((link) => {
      const outgoing = link.sourceTypeId === row.typeId && link.sourceId === row.id,
        targetId = outgoing ? link.targetId : link.sourceId;
      const target = rows.find((row) => row.typeId === presetId(companyId, targetKind) && row.id === targetId);
      return target ? [reference(target, targetKind)] : [];
    });
  };
  return rows
    .filter((row) => row.typeId === typeId && (!ids || ids.includes(row.id)))
    .map((row) => {
      const notes = scalar(row, `${kind}.notes`);
      const serviceItems =
        kind === "deal"
          ? links
              .filter((link) => link.relationId === presetId(companyId, "lineItem.deal") && link.targetId === row.id)
              .flatMap((parent) => {
                const serviceLink = links.find(
                  (link) =>
                    link.relationId === presetId(companyId, "lineItem.service") && link.sourceId === parent.sourceId,
                );
                const line = rows.find(
                  (record) => record.typeId === parent.sourceTypeId && record.id === parent.sourceId,
                );
                const service = serviceLink
                  ? rows.find(
                      (record) => record.typeId === serviceLink.targetTypeId && record.id === serviceLink.targetId,
                    )
                  : null;
                return line && service
                  ? [{ service: reference(service, "service"), quantity: number(line, "lineItem.quantity") }]
                  : [];
              })
          : related(row, "service").map((service) => ({ service, quantity: 1 }));
      const linkedDeals =
        kind === "service"
          ? links
              .filter((link) => link.relationId === presetId(companyId, "lineItem.service") && link.targetId === row.id)
              .flatMap((serviceLink) => {
                const parent = links.find(
                  (link) =>
                    link.relationId === presetId(companyId, "lineItem.deal") && link.sourceId === serviceLink.sourceId,
                );
                const deal = parent
                  ? rows.find((record) => record.typeId === parent.targetTypeId && record.id === parent.targetId)
                  : null;
                return deal ? [{ deal: reference(deal, "deal") }] : [];
              })
          : related(row, "deal").map((deal) => ({ deal }));
      return {
        ...reference(row, kind),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        notes: notes?.kind === "richText" ? (JSON.parse(notes.documentJson) as unknown) : null,
        totalValue: number(row, "deal.totalValue"),
        totalQuantity: number(row, "deal.totalQuantity"),
        weightedValue: scalar(row, "deal.weightedValue") ? number(row, "deal.weightedValue") : null,
        identifiers: row.identities.map(
          ({ identity: { id, provider, value, messagingId, displayName, profileUrl } }) => ({
            id,
            provider,
            value,
            messagingId,
            displayName,
            profileUrl,
          }),
        ),
        users: row.assignments.map(({ user }) => ({ user })),
        contacts: related(row, "contact").map((contact) => ({ contact })),
        organizations: related(row, "organization").map((organization) => ({ organization })),
        deals: linkedDeals,
        services: serviceItems,
        tasks: related(row, "task").map((task) => ({ task })),
        customFieldValues: model.fields
          .filter((field) => field.typeId === typeId && field.id.startsWith("16000000-"))
          .map((field) => ({
            columnId: field.id,
            value: historicalValue(values.get(JSON.stringify([row.typeId, row.id]))?.get(field.id) ?? null),
          })),
      };
    });
}
