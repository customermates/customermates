import type { RecordRepo } from "@/features/records/record.repo";
import type { QueryRecordsInteractor } from "@/features/records/query-records.interactor";
import type { ImportRecordsInteractor } from "@/features/data-transfer/import/import-records.interactor";
import type { Validated } from "@/core/validation/validation.utils";
import type { ImportSpreadsheetInput, ImportSpreadsheetResult } from "./spreadsheet.schema";
import type { SpreadsheetRelatedRecords } from "./spreadsheet-conversion";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { fail } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { RecordQuerySchema } from "@/features/records/record-query.schema";
import { ImportSpreadsheetSchema, SPREADSHEET_MAX_ROW_ERRORS } from "./spreadsheet.schema";
import { convertSpreadsheet, spreadsheetMappingIssues, spreadsheetRelatedNames } from "./spreadsheet-conversion";

const NAME_BATCH = 100;
const NAME_PAGE_SIZE = 500;

@TenantInteractor()
export class ImportSpreadsheetInteractor extends AuthenticatedInteractor<
  ImportSpreadsheetInput,
  ImportSpreadsheetResult
> {
  constructor(
    private records: RecordRepo,
    private query: QueryRecordsInteractor,
    private importer: ImportRecordsInteractor,
  ) {
    super();
  }

  @Validate(ImportSpreadsheetSchema)
  async invoke(input: ImportSpreadsheetInput): Validated<ImportSpreadsheetResult> {
    return runInTransaction(
      async () => {
        const model = await this.records.getModel();
        const [issue] = spreadsheetMappingIssues(input.table.headers, input.mapping, model);
        if (issue) return fail(CustomErrorCode.recordValueInvalid, ["mapping", ...issue.path]);
        const related: SpreadsheetRelatedRecords = new Map();
        for (const [relationId, names] of spreadsheetRelatedNames(input.table, input.mapping, model)) {
          const relation = model.relationships.find((candidate) => candidate.id === relationId);
          const target = model.types.find((candidate) => candidate.id === relation?.targetTypeId);
          const primaryFieldId = target?.primaryFieldId;
          if (!target || !primaryFieldId) return fail(CustomErrorCode.recordValueInvalid, ["mapping", "relationships"]);
          const matches = new Map<string, string[]>();
          for (let start = 0; start < names.length; start += NAME_BATCH) {
            const batch = names.slice(start, start + NAME_BATCH);
            for (let page = 1; ; page += 1) {
              const result = await this.query.invoke(
                RecordQuerySchema.parse({
                  typeId: target.id,
                  fields: [primaryFieldId],
                  filters: [
                    {
                      fieldId: primaryFieldId,
                      operator: "in",
                      value: null,
                      values: batch.map((name) => ({ kind: "text", value: name })),
                    },
                  ],
                  page,
                  pageSize: NAME_PAGE_SIZE,
                }),
              );
              if (!result.ok) return result;
              for (const record of result.data.records) {
                const title = record.fields.find((field) => field.fieldId === primaryFieldId)?.result;
                if (title?.state !== "value" || title.value.kind !== "text") continue;
                matches.set(title.value.value, [...(matches.get(title.value.value) ?? []), record.ref.recordId]);
              }
              if (page * NAME_PAGE_SIZE >= result.data.total) break;
            }
          }
          related.set(relationId, matches);
        }
        const conversion = convertSpreadsheet(input.table, input.mapping, model, {
          idempotencyKey: input.idempotencyKey,
          related,
        });
        let created = 0;
        let linked = 0;
        for (const [index, document] of conversion.documents.entries()) {
          const result = await this.importer.invoke({
            document,
            mode: "create",
            idempotencyKey: `${input.idempotencyKey}:${index}`,
          });
          if (!result.ok) return result;
          created += result.data.created;
          linked += result.data.linked;
        }
        return {
          ok: true as const,
          data: {
            rowCount: conversion.rowCount,
            created,
            linked,
            errorCount: conversion.errors.length,
            errors: conversion.errors.slice(0, SPREADSHEET_MAX_ROW_ERRORS),
            schemaRevision: model.revision,
          },
        };
      },
      { timeout: 300_000 },
    );
  }
}
