import type { RecordRepo, StoredRecord } from "@/features/records/record.repo";
import type { RecordAccessPolicy } from "@/features/records/record-access";
import type { RecordWrite, RecordWriteService } from "@/features/records/record-write.service";
import type { CalculatedValue, RecordField, RecordScalar } from "@/features/records/record-model.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { INTERACTIVE_COMPANY_LOCK_WAIT_MS, runInTransaction } from "@/core/decorators/transaction-runner";
import {
  fail,
  failAuthorization,
  failConflict,
  failNotFound,
  unwoundFailure,
} from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import {
  ImportMarkedRecordsSchema,
  ImportRecordsResultSchema,
  RECORD_IMPORT_LIMIT,
  RECORD_IMPORT_LINK_LIMIT,
} from "@/features/data-transfer/record-transfer.schema";
import type {
  ImportMarkedRecordsInput,
  ImportRecordsInput,
  ImportRecordsResult,
} from "@/features/data-transfer/record-transfer.schema";
import type { RecordModel } from "@/features/records/record-model.schema";
import { recordDto } from "@/features/records/record-dto";
import { untrustedRecordText } from "@/features/mcp-tools/untrusted-record-content";
import { recordRequestHash } from "@/features/records/record-request-hash";
import { RecordJournal } from "@/features/records/record-journal";
import { decodeRecordValue } from "@/features/records/record-storage";
import { sameRecordResult } from "@/features/records/record-write.service";
import { valueResult } from "@/features/records/calculation";

type ImportRow = ImportRecordsInput["document"]["records"][number];
type MarkedImportRow = ImportMarkedRecordsInput["document"]["records"][number];
type MarkedResult = MarkedImportRow["fields"][number]["result"];
type MarkedRichText = { state: "value"; value: { kind: "richText"; markdown: string } };

function isMarkedRichText(result: MarkedResult): result is MarkedRichText {
  return (
    result.state === "value" && result.value !== null && typeof result.value === "object" && "markdown" in result.value
  );
}
type Assignment = { fieldId: string; value: RecordScalar | null };

type RowAssignments =
  | { ok: true; assignments: Assignment[]; captured: Array<{ field: RecordField; result: CalculatedValue }> }
  | { ok: false; path: Array<string | number> };

function inputAssignments(row: ImportRow, fields: RecordField[], mode: ImportRecordsInput["mode"]): RowAssignments {
  const definitions = new Map(fields.map((field) => [field.id, field]));
  const assignments: Assignment[] = [];
  const captured: Array<{ field: RecordField; result: CalculatedValue }> = [];
  const seen = new Set<string>();
  for (const [index, entry] of row.fields.entries()) {
    const field = definitions.get(entry.fieldId);
    if (!field || field.archived || field.valueType === "channels" || seen.has(field.id))
      return { ok: false, path: ["fields", index, "fieldId"] };
    seen.add(field.id);
    const unreadable = entry.result.state === "restricted" || entry.result.state === "error";
    if (field.behavior.kind === "snapshot") {
      if (unreadable) return { ok: false, path: ["fields", index, "result"] };
      if (entry.result.state === "value") {
        if (field.behavior.allowManualOverride) assignments.push({ fieldId: field.id, value: entry.result.value });
        else if (mode === "create") return { ok: false, path: ["fields", index, "result"] };
        else captured.push({ field, result: entry.result });
      }
      continue;
    }
    if (field.behavior.kind !== "input") continue;
    if (unreadable) return { ok: false, path: ["fields", index, "result"] };
    assignments.push({
      fieldId: field.id,
      value: entry.result.state === "value" ? entry.result.value : null,
    });
  }
  const missing = fields.find(
    (field) => field.behavior.kind === "input" && field.valueType !== "channels" && !seen.has(field.id),
  );
  if (missing) return { ok: false, path: ["fields", missing.id] };
  return { ok: true, assignments, captured };
}

function storedResult(record: StoredRecord, field: RecordField): CalculatedValue {
  return decodeRecordValue(
    record.values.find((value) => value.fieldId === field.id),
    field,
  );
}

@TenantInteractor()
export class ImportRecordsInteractor extends AuthenticatedInteractor<ImportMarkedRecordsInput, ImportRecordsResult> {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
    private writer: RecordWriteService,
  ) {
    super();
  }

  @Validate(ImportMarkedRecordsSchema)
  async invoke(input: ImportMarkedRecordsInput): Validated<ImportRecordsResult> {
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
        if (model.revision !== input.document.schemaRevision) return failConflict(CustomErrorCode.recordSchemaChanged);
        const resolved = await this.resolveMarkedText(input.document.records, model, policy);
        if (!resolved.ok)
          return fail(CustomErrorCode.recordMarkedTextChanged, ["document", "records", ...resolved.path]);
        const document = { ...input.document, records: resolved.rows };
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
        for (const [index, row] of document.records.entries()) {
          const rowPath = ["document", "records", index];
          if (depth(row.ref.typeId) === null)
            return fail(CustomErrorCode.recordValueInvalid, [...rowPath, "ref", "typeId"]);
          if (row.schemaRevision !== model.revision)
            return fail(CustomErrorCode.recordValueInvalid, [...rowPath, "schemaRevision"]);
          if (row.protectedKind && input.mode === "create")
            return fail(CustomErrorCode.recordValueInvalid, [...rowPath, "protectedKind"]);
          const key = recordKey(row.ref);
          if (assignments.has(key)) return fail(CustomErrorCode.recordValueInvalid, [...rowPath, "ref", "recordId"]);
          const fields = model.fields.filter((field) => field.typeId === row.ref.typeId && !field.archived);
          const values = inputAssignments(row, fields, input.mode);
          if (!values.ok) return fail(CustomErrorCode.recordValueInvalid, [...rowPath, ...values.path]);
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
        const journal = new RecordJournal(this.records, model);
        const writer = this.writer.withRepository(journal.repository);
        let skipped = 0;
        const writes: RecordWrite[] = [];
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
            const write = await writer.apply(
              {
                action: "create",
                typeId: row.ref.typeId,
                fields: assignments.get(recordKey(row.ref)) ?? [],
                assignedUserIds: row.assignedUserIds,
                ...(parent
                  ? {
                      links: [{ relationId: parent.relationId, direction: "outgoing" as const, record: parent.target }],
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
              undefined,
              { createRecordId: row.ref.recordId, skipCalculations: true },
            );
            writes.push(write);
          } else {
            if (!existing || !(await policy.canRead(existing))) return failNotFound(CustomErrorCode.recordNotFound);
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
            const write = await writer.apply(
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
              undefined,
              { skipCalculations: true },
            );
            writes.push(write);
          }
        }
        let linked = 0;
        for (const link of document.links) {
          const existing = await this.records.linkedRecordsCompanyWide(link.source, link.relationId, "outgoing");
          if (
            existing.some((target) => target.typeId === link.target.typeId && target.recordId === link.target.recordId)
          )
            continue;
          writes.push(
            await writer.apply({ action: "link", ...link }, model, policy, undefined, { skipCalculations: true }),
          );
          linked += 1;
        }
        await writer.recalculateWrites(model, writes);
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
      },
      { timeout: 120_000, companyLockWait: INTERACTIVE_COMPANY_LOCK_WAIT_MS },
    ).catch(unwoundFailure);
  }

  private async resolveMarkedText(
    rows: MarkedImportRow[],
    model: RecordModel,
    policy: Awaited<ReturnType<RecordAccessPolicy["load"]>>,
  ): Promise<{ ok: true; rows: ImportRow[] } | { ok: false; path: Array<string | number> }> {
    const resolved: ImportRow[] = [];
    const access = policy.access(model.types.filter((type) => !type.archived).map((type) => type.id));
    for (const [rowIndex, row] of rows.entries()) {
      const marked = row.fields.some((field) => isMarkedRichText(field.result));
      const existing = marked ? await this.records.getRecordCompanyWide(row.ref) : null;
      const stored =
        existing && (await policy.canRead(existing))
          ? new Map(
              recordDto(
                existing,
                model,
                await this.records.getVisibleFields(row.ref, model, access),
                policy.memberScope,
              ).fields.map((field) => [field.fieldId, field.result] as const),
            )
          : new Map<string, CalculatedValue>();
      const fields: ImportRow["fields"] = [];
      for (const [fieldIndex, field] of row.fields.entries()) {
        if (!isMarkedRichText(field.result)) {
          fields.push({ fieldId: field.fieldId, result: field.result });
          continue;
        }
        const current = stored.get(field.fieldId);
        if (
          current?.state !== "value" ||
          current.value.kind !== "richText" ||
          untrustedRecordText(current.value.documentJson) !== field.result.value.markdown
        )
          return { ok: false, path: [rowIndex, "fields", fieldIndex, "result", "value"] };
        fields.push({ fieldId: field.fieldId, result: current });
      }
      resolved.push({ ...row, fields, relationships: [], relationshipPaths: undefined });
    }
    return { ok: true, rows: resolved };
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
