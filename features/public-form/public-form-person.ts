import type { MutateRecordInput, RecordOperationResult } from "@/features/records/record-query.schema";
import type { RecordModel, RecordRef } from "@/features/records/record-model.schema";
import type { RecordRepo } from "@/features/records/record.repo";
import type { Validated } from "@/core/validation/validation.utils";
import type { PublicFormPerson } from "./public-form.schema";

export type FormRecordWriter = { invoke(input: MutateRecordInput): Validated<RecordOperationResult> };

export type PersonLookup = Pick<RecordRepo, "getIdentityOwnersCompanyWide">;

export type ResolvedPerson = { ref: RecordRef; created: boolean };

export function linkDirection(
  model: Pick<RecordModel, "relationships">,
  person: PublicFormPerson,
  typeId: string,
): "outgoing" | "incoming" | null {
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
  writer: FormRecordWriter,
  revision: number,
  person: PublicFormPerson,
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
      fields:
        name && person.nameFieldId ? [{ fieldId: person.nameFieldId, value: { kind: "text", value: name } }] : [],
      identities: [{ provider: "mail", value: email }],
    },
  });
  if (!result.ok || result.data.status !== "completed") return null;
  return result.data.refs.find((ref) => ref.typeId === person.typeId) ?? null;
}
