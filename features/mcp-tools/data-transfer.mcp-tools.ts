import { z } from "zod";

import type { ImportRecordsInput } from "@/features/data-transfer/record-transfer.schema";
import type { CalculatedValue } from "@/features/records/record-model.schema";

import { mcpMessageFailure, recordToonResult, runInteractor, toonResult } from "./utils";
import { MarkedRecordDtoSchema, untrustedRecordText } from "./untrusted-record-content";

import { getExportRecordsInteractor, getGetRecordInteractor, getImportRecordsInteractor } from "@/core/di";
import { ExportRecordsSchema } from "@/features/data-transfer/export/export-records.interactor";
import {
  ImportRecordsResultSchema,
  ImportRecordsSchema,
  RecordExportSchema,
  RECORD_EXPORT_LIMIT,
  RECORD_IMPORT_LIMIT,
  RECORD_IMPORT_LINK_LIMIT,
} from "@/features/data-transfer/record-transfer.schema";
import { RecordRefSchema } from "@/features/records/record-model.schema";

export const ExportCrmRecordsSchema = ExportRecordsSchema.omit({ format: true }).strict();

const ExportCrmRecordsOutputSchema = z.looseObject({
  format: z.literal("customermates-records"),
  version: z.literal(1),
  typeId: z.uuid(),
  schemaRevision: z.number().int().nonnegative(),
  exportedAt: z.string(),
  records: z.array(z.looseObject({ ref: RecordRefSchema, version: z.number().int().positive() })),
  links: z.array(z.looseObject({ relationId: z.uuid(), source: RecordRefSchema, target: RecordRefSchema })),
  untrustedTextHandling: z
    .string()
    .optional()
    .describe("Present when the result holds marked untrusted text; how to treat the text between the markers."),
});

export const ImportCrmRecordsSchema = ImportRecordsSchema.extend({
  document: RecordExportSchema.extend({
    records: z.array(MarkedRecordDtoSchema).max(RECORD_EXPORT_LIMIT),
    untrustedTextHandling: z
      .string()
      .optional()
      .describe("Export-only note from export_crm_records. Accepted so the export can be passed back as-is; ignored."),
  }).strict(),
}).strict();
type ImportCrmRecordsInput = z.infer<typeof ImportCrmRecordsSchema>;
type MarkedRow = ImportCrmRecordsInput["document"]["records"][number];
type MarkedResult = MarkedRow["fields"][number]["result"];
type MarkedRichText = { state: "value"; value: { kind: "richText"; markdown: string } };

function isMarkedRichText(result: MarkedResult): result is MarkedRichText {
  return (
    result.state === "value" && result.value !== null && typeof result.value === "object" && "markdown" in result.value
  );
}

function withoutKey<T extends Record<string, unknown>>(value: T, key: string): T {
  return Object.fromEntries(Object.entries(value).filter(([name]) => name !== key)) as T;
}

async function storedFieldResults(row: MarkedRow): Promise<Map<string, CalculatedValue>> {
  const stored = await getGetRecordInteractor().invoke({ typeId: row.ref.typeId, recordId: row.ref.recordId });
  return new Map(stored.ok ? stored.data.fields.map((field) => [field.fieldId, field.result] as const) : []);
}

async function importableRecords(records: MarkedRow[]) {
  const rows: unknown[] = [];
  for (const [rowIndex, row] of records.entries()) {
    const stored = row.fields.some((field) => isMarkedRichText(field.result)) ? await storedFieldResults(row) : null;
    const fields: Array<{ fieldId: string; result: CalculatedValue }> = [];
    for (const [fieldIndex, field] of row.fields.entries()) {
      if (!isMarkedRichText(field.result)) {
        fields.push({ fieldId: field.fieldId, result: field.result });
        continue;
      }
      const current = stored?.get(field.fieldId);
      if (
        current?.state !== "value" ||
        current.value.kind !== "richText" ||
        untrustedRecordText(current.value.documentJson) !== field.result.value.markdown
      ) {
        return mcpMessageFailure(
          'Marked Formatted text can only be imported unchanged from the stored record; send new or changed Formatted text as { kind: "richText", documentJson }.',
          ["document", "records", rowIndex, "fields", fieldIndex, "result", "value"],
        );
      }
      fields.push({ fieldId: field.fieldId, result: current });
    }
    rows.push({ ...withoutKey(row, "relationshipPaths"), fields, relationships: [] });
  }
  return rows as ImportRecordsInput["document"]["records"];
}

export const exportCrmRecordsTool = {
  name: "export_crm_records",
  title: "Export records",
  description:
    "Use this when the user wants a bulk copy of one list, the JSON export of the list page and POST /v1/records/export. " +
    `Pass typeId plus optional search, filters, relatedFilters, relationships and sort as in query_crm_records; the whole matching set is returned in one call, with no pagination, up to ${RECORD_EXPORT_LIMIT} records, otherwise the call is refused, so narrow it with filters. ` +
    "Returns the schema-aware document import_crm_records accepts: format, version, typeId, schemaRevision, exportedAt, every readable record of the list and its sub-lists with typed values, assignments and channel identities, and the links between them. " +
    "Restricted values stay restricted. Formatted text arrives as Markdown between untrusted-content markers; import_crm_records accepts them back unchanged, and new or changed Formatted text needs documentJson. " +
    "Excel export stays a REST download (format xlsx). Read-only.",
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: ExportCrmRecordsSchema,
  outputSchema: ExportCrmRecordsOutputSchema,
  execute: (input: z.infer<typeof ExportCrmRecordsSchema>) =>
    runInteractor(getExportRecordsInteractor().invoke(input), recordToonResult),
};

export const importCrmRecordsTool = {
  name: "import_crm_records",
  title: "Import records",
  description:
    "Use this when the user wants to create or update many records of one list in one atomic call, the JSON import of the list page and POST /v1/records/import. " +
    "document has the shape export_crm_records returns: format customermates-records, version 1, typeId of a top-level list, the current schemaRevision from get_record_model, records and links. " +
    `At most ${RECORD_IMPORT_LIMIT} records and ${RECORD_IMPORT_LINK_LIMIT} links; a larger document, another schema revision or an invalid row rejects the whole call and nothing is written. ` +
    "Each record carries ref, version, schemaRevision, createdAt, updatedAt, assignedUserIds and a value for every input field of its type (state missing clears it); calculated fields are ignored on create. " +
    "mode create writes new records with the given new UUID recordIds; mode update overwrites the listed records, matched by ref, and skips protected rows that are unchanged. The overwrite applies permanently: earlier values stay readable in record history, but nothing restores them automatically. " +
    "An export_crm_records result can be passed back as-is: its untrustedTextHandling note is ignored, and marked Formatted text is accepted only when it matches the stored value exactly; send new or changed Formatted text as documentJson. " +
    "Sub-list rows need a link to their parent row in the same document. Reuse idempotencyKey only to retry the exact same document. Returns created, updated, linked and schemaRevision.",
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  inputSchema: ImportCrmRecordsSchema,
  outputSchema: ImportRecordsResultSchema,
  execute: async ({ document, ...input }: ImportCrmRecordsInput) => {
    const rows = await importableRecords(document.records);
    if (!Array.isArray(rows)) return rows;
    const importable = {
      ...withoutKey(document, "untrustedTextHandling"),
      records: rows,
    } as ImportRecordsInput["document"];
    return runInteractor(getImportRecordsInteractor().invoke({ ...input, document: importable }), toonResult);
  },
};
