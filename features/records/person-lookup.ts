import type { Validated } from "@/core/validation/validation.utils";
import type { RecordRef, RecordRelationship } from "./record-model.schema";
import type { MutateRecordInput, RecordOperationResult } from "./record-query.schema";
import type { RecordRepo } from "./record.repo";

export type RecordWriter = { invoke(input: MutateRecordInput): Validated<RecordOperationResult> };

export type PersonLookup = Pick<RecordRepo, "getIdentityOwnersCompanyWide">;

export type PersonLink = { typeId: string; relationshipId: string; nameFieldId: string | null };

export type RecordLink = { relationId: string; direction: "outgoing" | "incoming"; record: RecordRef };

export function linkDirection(
  model: {
    relationships: ReadonlyArray<Pick<RecordRelationship, "id" | "sourceTypeId" | "targetTypeId" | "archived">>;
  },
  person: Pick<PersonLink, "typeId" | "relationshipId">,
  typeId: string,
): RecordLink["direction"] | null {
  const relation = model.relationships.find((entry) => entry.id === person.relationshipId && !entry.archived);
  if (!relation || typeId === person.typeId) return null;
  if (relation.sourceTypeId === typeId && relation.targetTypeId === person.typeId) return "outgoing";
  if (relation.targetTypeId === typeId && relation.sourceTypeId === person.typeId) return "incoming";
  return null;
}

export async function findPersonByEmail(
  lookup: PersonLookup,
  typeId: string,
  email: string,
): Promise<RecordRef | null> {
  const owners = await lookup.getIdentityOwnersCompanyWide([{ channelClass: "email", value: email }], [typeId], {
    limitPerKey: 1,
  });
  return owners[0]?.ref ?? null;
}

export async function createPerson(
  writer: RecordWriter,
  revision: number,
  person: Pick<PersonLink, "typeId" | "nameFieldId">,
  email: string,
  name: string | null,
  idempotencyKey: string,
): Promise<RecordRef | null> {
  const result = await writer.invoke({
    expectedRevision: revision,
    idempotencyKey,
    mutation: {
      action: "create",
      typeId: person.typeId,
      fields: name && person.nameFieldId ? [{ fieldId: person.nameFieldId, value: { kind: "text", value: name } }] : [],
      identities: [{ provider: "mail", value: email, ...(name ? { displayName: name } : {}) }],
    },
  });
  if (!result.ok || result.data.status !== "completed") return null;
  return result.data.refs.find((ref) => ref.typeId === person.typeId) ?? null;
}
