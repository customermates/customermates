import { z } from "zod";

import { recordToonResult, runInteractor, toonResult } from "./utils";

import { getExportRecordsInteractor, getImportRecordsInteractor } from "@/core/di";
import { ExportRecordsSchema } from "@/features/data-transfer/export/export-records.interactor";
import {
  ImportRecordsResultSchema,
  ImportRecordsSchema,
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

export const exportCrmRecordsTool = {
  name: "export_crm_records",
  title: "Export records",
  description:
    "Use this when the user wants a bulk copy of one list, the JSON export of the list page and POST /v1/records/export. " +
    `Pass typeId plus optional search, filters, relatedFilters, relationships and sort as in query_crm_records; the whole matching set is returned in one call, with no pagination, up to ${RECORD_EXPORT_LIMIT} records, otherwise the call is refused, so narrow it with filters. ` +
    "Returns the schema-aware document import_crm_records accepts: format, version, typeId, schemaRevision, exportedAt, every readable record of the list and its sub-lists with typed values, assignments and channel identities, and the links between them. " +
    "Restricted values stay restricted. Formatted text arrives as Markdown between untrusted-content markers; replace those values with documentJson before importing the document again. " +
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
    "mode create writes new records with the given new UUID recordIds; mode update overwrites the listed records, matched by ref, and skips protected rows that are unchanged. " +
    "Sub-list rows need a link to their parent row in the same document. Reuse idempotencyKey only to retry the exact same document. Returns created, updated, linked and schemaRevision.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: ImportRecordsSchema,
  outputSchema: ImportRecordsResultSchema,
  execute: (input: z.infer<typeof ImportRecordsSchema>) =>
    runInteractor(getImportRecordsInteractor().invoke(input), toonResult),
};
