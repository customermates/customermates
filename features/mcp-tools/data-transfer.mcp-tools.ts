import { z } from "zod";

import { recordToonResult, runInteractor, toonResult } from "./utils";

import { getExportRecordsInteractor, getImportRecordsInteractor } from "@/core/di";
import { ExportRecordsSchema } from "@/features/data-transfer/export/export-records.interactor";
import {
  ImportMarkedRecordsSchema,
  ImportRecordsResultSchema,
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

export const ImportCrmRecordsSchema = ImportMarkedRecordsSchema;
type ImportCrmRecordsInput = z.infer<typeof ImportCrmRecordsSchema>;

export const exportCrmRecordsTool = {
  name: "export_crm_records",
  title: "Export records",
  description:
    "Use this when the user wants a bulk copy of one list, the JSON export of the list page and POST /v1/records/export. " +
    `Pass typeId plus optional search, filters, relatedFilters, relationships and sort as in query_crm_records. Without page, the whole matching set is returned in one call, up to ${RECORD_EXPORT_LIMIT} records, otherwise the call is refused. ` +
    "For a large list pass page (from 1) and pageSize (up to 500): each call returns that page of top-level records with their sub-list rows and links, plus total and nextPage; repeat with the same query and sort until nextPage is null. " +
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
    "document has the shape export_crm_records returns: format customermates-records, version 1, typeId of a top-level list, the current schemaRevision from get_record_model, records, and optional links and unlinks. " +
    `At most ${RECORD_IMPORT_LIMIT} records and ${RECORD_IMPORT_LINK_LIMIT} links and unlinks together; a larger document, another schema revision or an invalid row rejects the whole call and nothing is written. ` +
    "Rows are sparse: each needs only ref and the fields to set. An omitted field stays empty on create and unchanged on update; state missing clears it. Optional per row: version (update: the row is refused if the record changed since that version), assignedUserIds (replaces the assignees; omitted keeps them on update and assigns you on create) and identities. Calculated fields are ignored on create. " +
    "mode create writes new records with the given new UUID recordIds; mode update changes the listed records, matched by ref, so one call can patch different values per record, and skips protected rows that are unchanged. links adds links; unlinks removes them and needs mode update. Changes apply permanently: earlier values stay readable in record history, but nothing restores them automatically. " +
    `For more than ${RECORD_IMPORT_LIMIT} records, send consecutive calls of up to ${RECORD_IMPORT_LIMIT} rows, each with its own idempotencyKey, and keep sub-list rows in the same call as their parent row. ` +
    "An export_crm_records result or page can be passed back as-is: its untrustedTextHandling note is ignored, and marked Formatted text is accepted only when it matches the stored value exactly; send new or changed Formatted text as documentJson. " +
    "Sub-list rows need a link to their parent row in the same document. Reuse idempotencyKey only to retry the exact same document. Returns created, updated, linked, unlinked and schemaRevision.",
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  inputSchema: ImportCrmRecordsSchema,
  outputSchema: ImportRecordsResultSchema,
  execute: (input: ImportCrmRecordsInput) => runInteractor(getImportRecordsInteractor().invoke(input), toonResult),
};
