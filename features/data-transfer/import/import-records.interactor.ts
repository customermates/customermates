import type { RecordRepo, StoredRecord } from "@/features/records/record.repo";
import type { RecordAccessPolicy } from "@/features/records/record-access";
import type { RecordWriteService } from "@/features/records/record-write.service";
import type { CalculatedValue, RecordField, RecordScalar } from "@/features/records/record-model.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { fail, failAuthorization, failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import {
  ImportRecordsSchema,
  ImportRecordsResultSchema,
  RECORD_IMPORT_LIMIT,
  RECORD_IMPORT_LINK_LIMIT,
} from "@/features/data-transfer/record-transfer.schema";
import type { ImportRecordsInput, ImportRecordsResult } from "@/features/data-transfer/record-transfer.schema";
import { recordRequestHash, recordWriteFailure } from "@/features/records/mutate-record.interactor";
import { RecordJournal } from "@/features/records/record-journal";
import { decodeRecordValue } from "@/features/records/record-storage";
import { sameRecordResult } from "@/features/records/record-write.service";
import { valueResult } from "@/features/records/calculation";

type ImportRow = ImportRecordsInput["document"]["records"][number];
type Assignment = { fieldId: string; value: RecordScalar | null };

function inputAssignments(
  row: ImportRow,
  fields: RecordField[],
): { assignments: Assignment[]; captured: Array<{ field: RecordField; result: CalculatedValue }> } | null {
  const definitions = new Map(fields.map((field) => [field.id, field]));
  const assignments: Assignment[] = [];
  const captured: Array<{ field: RecordField; result: CalculatedValue }> = [];
  const seen = new Set<string>();
  for (const entry of row.fields) {
    const field = definitions.get(entry.fieldId);
    if (!field || field.archived || seen.has(field.id)) return null;
    seen.add(field.id);
    if (field.behavior.kind === "snapshot") {
      if (entry.result.state === "restricted" || entry.result.state === "error") return null;
      if (entry.result.state === "value") {
        if (field.behavior.allowManualOverride) assignments.push({ fieldId: field.id, value: entry.result.value });
        else captured.push({ field, result: entry.result });
      }
      continue;
    }
    if (field.behavior.kind !== "input") continue;
    if (entry.result.state === "restricted" || entry.result.state === "error") return null;
    assignments.push({
      fieldId: field.id,
      value: entry.result.state === "value" ? entry.result.value : null,
    });
  }
  if (fields.some((field) => field.behavior.kind === "input" && !seen.has(field.id))) return null;
  return { assignments, captured };
}

function storedResult(record: StoredRecord, field: RecordField): CalculatedValue {
  return decodeRecordValue(
    record.values.find((value) => value.fieldId === field.id),
    field,
  );
}

@TenantInteractor()
export class ImportRecordsInteractor extends AuthenticatedInteractor<ImportRecordsInput, ImportRecordsResult> {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
    private writer: RecordWriteService,
    private company: { getDetails(): Promise<{ currency: string }> },
  ) {
    super();
  }

  @Validate(ImportRecordsSchema)
  async invoke(input: ImportRecordsInput): Validated<ImportRecordsResult> {
    const hash = recordRequestHash(input);
    return runInTransaction(
      async () => {
        const policy = await this.policy.load();
        if (!policy.actor) return failAuthorization(CustomErrorCode.permissionDenied);
        const receipt = await this.records.receipt(input.idempotencyKey, this.userId);
        if (receipt) {
          return receipt.requestHash === hash
            ? {
                ok: true as const,
                data: ImportRecordsResultSchema.parse(receipt.result),
              }
            : failConflict(CustomErrorCode.recordIdempotencyConflict);
        }
        const state = await this.records.getState();
        if (state?.activeOperationId) return failConflict(CustomErrorCode.recordWritePaused);
        const model = await this.records.getModel();
        const document = input.document;
        if (model.revision !== document.schemaRevision) return failConflict(CustomErrorCode.recordSchemaChanged);
        if (document.records.length > RECORD_IMPORT_LIMIT || document.links.length > RECORD_IMPORT_LINK_LIMIT)
          return fail(CustomErrorCode.recordCalculationBudget);
        const type = model.types.find((candidate) => candidate.id === document.typeId && !candidate.archived);
        if (!type || type.embedded) return failNotFound(CustomErrorCode.recordTypeNotFound);
        if (!policy.allowed(type.id, input.mode === "create" ? "create" : "update"))
          return failAuthorization(CustomErrorCode.permissionDenied);
        const types = new Map(model.types.filter((item) => !item.archived).map((item) => [item.id, item]));
        const recordKey = (ref: { typeId: string; recordId: string }) => `${ref.typeId}:${ref.recordId}`;
        const depth = (typeId: string): number | null => {
          let current = types.get(typeId);
          let steps = 0;
          while (current?.parentRelationshipId && steps <= 12) {
            const relation = model.relationships.find(
              (candidate) => candidate.id === current?.parentRelationshipId && !candidate.archived,
            );
            if (!relation) return null;
            current = types.get(relation.targetTypeId);
            steps += 1;
          }
          return current?.id === type.id && steps <= 12 ? steps : null;
        };
        const assignments = new Map<string, Assignment[]>();
        const captured = new Map<string, Array<{ field: RecordField; result: CalculatedValue }>>();
        const rows = new Map<string, ImportRow>();
        for (const row of document.records) {
          if (
            depth(row.ref.typeId) === null ||
            row.schemaRevision !== model.revision ||
            (row.protectedKind && input.mode === "create")
          )
            return fail(CustomErrorCode.recordValueInvalid);
          const key = recordKey(row.ref);
          if (assignments.has(key)) return fail(CustomErrorCode.recordValueInvalid);
          const fields = model.fields.filter((field) => field.typeId === row.ref.typeId && !field.archived);
          const values = inputAssignments(row, fields);
          if (!values || (values.captured.length && input.mode === "create"))
            return fail(CustomErrorCode.recordValueInvalid);
          assignments.set(key, values.assignments);
          captured.set(key, values.captured);
          rows.set(key, row);
        }
        const links = new Set<string>();
        const parentLinks = new Map<string, (typeof document.links)[number]>();
        for (const link of document.links) {
          const key = `${link.relationId}:${link.source.typeId}:${link.source.recordId}:${link.target.typeId}:${link.target.recordId}`;
          if (
            !assignments.has(recordKey(link.source)) ||
            links.has(key) ||
            !model.relationships.some(
              (relation) =>
                relation.id === link.relationId &&
                !relation.archived &&
                relation.sourceTypeId === link.source.typeId &&
                relation.targetTypeId === link.target.typeId,
            )
          )
            return fail(CustomErrorCode.recordRelationConflict);
          links.add(key);
          const sourceType = types.get(link.source.typeId);
          if (sourceType?.parentRelationshipId === link.relationId) {
            const sourceKey = recordKey(link.source);
            if (parentLinks.has(sourceKey) || !rows.has(recordKey(link.target)))
              return fail(CustomErrorCode.recordRelationConflict);
            parentLinks.set(sourceKey, link);
          }
        }
        for (const row of document.records) {
          const itemType = types.get(row.ref.typeId);
          if (itemType?.parentRelationshipId && !parentLinks.has(recordKey(row.ref)))
            return fail(CustomErrorCode.recordRelationConflict);
        }
        const orderedRows = [...document.records].sort(
          (left, right) => (depth(left.ref.typeId) ?? 0) - (depth(right.ref.typeId) ?? 0),
        );
        try {
          const currency = (await this.company.getDetails()).currency;
          const journal = new RecordJournal(this.records, model);
          const writer = this.writer.withRepository(journal.repository);
          let skipped = 0;
          for (const row of orderedRows) {
            const existing = await this.records.getRecordCompanyWide(row.ref);
            const parent = parentLinks.get(recordKey(row.ref));
            if (input.mode === "create") {
              if (existing) return failConflict(CustomErrorCode.recordVersionChanged);
              if (await this.records.hasRecordHistoryCompanyWide(row.ref)) {
                return failConflict(CustomErrorCode.recordIdUnavailable, [
                  "document",
                  "records",
                  document.records.indexOf(row),
                  "ref",
                  "recordId",
                ]);
              }
              await writer.apply(
                {
                  action: "create",
                  typeId: row.ref.typeId,
                  fields: assignments.get(recordKey(row.ref)) ?? [],
                  assignedUserIds: row.assignedUserIds,
                  ...(parent
                    ? {
                        links: [
                          { relationId: parent.relationId, direction: "outgoing" as const, record: parent.target },
                        ],
                      }
                    : {}),
                  identities: row.identities?.map(({ provider, value, messagingId, displayName, profileUrl }) => ({
                    provider,
                    value,
                    messagingId,
                    displayName,
                    profileUrl,
                  })),
                },
                model,
                policy,
                currency,
                undefined,
                { createRecordId: row.ref.recordId },
              );
            } else {
              if (!existing) return failNotFound(CustomErrorCode.recordNotFound);
              const key = recordKey(row.ref);
              if (
                (captured.get(key) ?? []).some(
                  ({ field, result }) => !sameRecordResult(storedResult(existing, field), result),
                )
              )
                return fail(CustomErrorCode.recordReadOnlyField);
              if (row.protectedKind || existing.protectedKind) {
                if (!(await this.unchanged(row, existing, assignments.get(key) ?? [], model.fields)))
                  return failAuthorization(CustomErrorCode.recordProtected);
                skipped += 1;
                continue;
              }
              await writer.apply(
                {
                  action: "update",
                  ref: row.ref,
                  expectedVersion: row.version,
                  fields: assignments.get(recordKey(row.ref)) ?? [],
                  assignedUserIds: row.assignedUserIds,
                  identities: row.identities?.map(({ provider, value, messagingId, displayName, profileUrl }) => ({
                    provider,
                    value,
                    messagingId,
                    displayName,
                    profileUrl,
                  })),
                },
                model,
                policy,
                currency,
              );
            }
          }
          let linked = 0;
          for (const link of document.links) {
            const existing = await this.records.linkedRecordsCompanyWide(link.source, link.relationId, "outgoing");
            if (
              existing.some(
                (target) => target.typeId === link.target.typeId && target.recordId === link.target.recordId,
              )
            )
              continue;
            await writer.apply({ action: "link", ...link }, model, policy, currency);
            linked += 1;
          }
          await journal.flush(model, this.userId, input.idempotencyKey, {
            kind: "mutation",
          });
          const data: ImportRecordsResult = {
            created: input.mode === "create" ? document.records.length : 0,
            updated: input.mode === "update" ? document.records.length - skipped : 0,
            linked,
            schemaRevision: model.revision,
          };
          await this.records.saveReceipt(input.idempotencyKey, this.userId, hash, data);
          return { ok: true as const, data };
        } catch (error) {
          return recordWriteFailure(error);
        }
      },
      { timeout: 120_000 },
    );
  }

  private async unchanged(
    row: ImportRow,
    existing: StoredRecord,
    assignments: Assignment[],
    fields: RecordField[],
  ): Promise<boolean> {
    const sorted = (values: string[]) => JSON.stringify([...values].sort());
    if (sorted(row.assignedUserIds) !== sorted(existing.assignments.map((assignment) => assignment.userId)))
      return false;
    for (const assignment of assignments) {
      const field = fields.find((candidate) => candidate.id === assignment.fieldId);
      if (!field) return false;
      if (!sameRecordResult(storedResult(existing, field), valueResult(assignment.value))) return false;
    }
    if (row.identities) {
      const keys = (identities: Array<{ provider: string; value: string }>) =>
        sorted(identities.map((identity) => `${identity.provider}:${identity.value}`));
      if (keys(row.identities) !== keys(await this.records.getIdentitiesCompanyWide(row.ref))) return false;
    }
    return true;
  }
}
