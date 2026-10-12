import {
  GetRoleEditorSchema,
  UpsertRoleSchema,
  DeleteRoleSchema,
  RoleApiEditorContextSchema,
  RoleApiMutationResultSchema,
} from "@/features/role/role-management.schema";
import { RecordSearchSchema, RecordSearchResultSchema } from "./record-search.schema";
import {
  ReadThreadRecordsSchema,
  MutateThreadRecordsSchema,
  ThreadRecordsResultSchema,
  ThreadRecordMutationResultSchema,
} from "@/ee/messaging/thread-records/thread-records.schema";
import {
  ResolveRecordIdentitiesSchema,
  ResolveRecordIdentitiesResultSchema,
} from "./resolve-record-identities.interactor";
import { ExportRecordsSchema } from "@/features/data-transfer/export/export-records.interactor";
import {
  ImportRecordsSchema,
  ImportRecordsResultSchema,
  RecordExportSchema,
} from "@/features/data-transfer/record-transfer.schema";
import {
  ReadRecordDetailLayoutSchema,
  SaveRecordDetailLayoutSchema,
  RecordDetailLayoutResultSchema,
} from "./record-detail-layout.schema";
import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { StructuredApiResponses } from "@/core/api/structured-interactor-handler";
import { GenericRecordWidgetInputSchema, GenericRecordWidgetDtoSchema } from "@/features/widget/record-widget.schema";
import { RecordWidgetReadSchema } from "@/features/widget/get-record-widgets.interactor";
import { RecordDtoSchema } from "./record-model.schema";
import { ConfigurationContractSchema, ConfigurationPreviewSchema } from "./configuration.schema";
import {
  RecordQuerySchema,
  MutateRecordRequestSchema,
  RecordOperationResultSchema,
  RecordReadSchema,
} from "./record-query.schema";
import { RecordQueryResultSchema } from "./record-query-result.schema";
import { RecordMeasureSchema, RecordMeasureResultSchema } from "./record-measure.schema";
import { RecordOperationInputSchema, RecordOperationStatusSchema } from "./record-operation.interactor";
import { PreviewRecordDeletionSchema, RecordDeletionPreviewSchema } from "./preview-record-deletion.interactor";
import {
  RecordActivitiesInputSchema,
  RecordActivitiesResultSchema,
} from "@/ee/messaging/activities/record-activities.schema";

import {
  DeleteTrashPermanentlySchema,
  EmptyTrashSchema,
  PreviewTrashDeletionSchema,
  QueryTrashSchema,
  RestoreTrashSchema,
  TrashDeletionPreviewSchema,
  TrashDeletionResultSchema,
  TrashPageSchema,
  TrashRestoreResultSchema,
} from "@/features/trash/trash.schema";

type OperationTag = "records" | "roles" | "widgets" | "trash" | "operations" | "record-links";

type OperationOptions = {
  requires: string;
  tag?: OperationTag;
  read?: boolean;
  description?: string;
  examples?: Record<string, { summary: string; value: unknown }>;
};

const RECORD_CONTRACT =
  "Configurable CRM record contract. Record references contain both typeId and recordId. Workspace scope comes from authentication. Decimal values are strings.";
const READ_DESCRIPTION = `${RECORD_CONTRACT} Reads change nothing and return only what the caller may read.`;
const WRITE_DESCRIPTION = `${RECORD_CONTRACT} Writes require their documented revision and idempotency preconditions; pending results refer to a durable operation.`;

function operation(
  operationId: string,
  summary: string,
  input: z.ZodType,
  output: z.ZodType,
  { requires, tag = "records", read = false, description, examples }: OperationOptions,
): ZodOpenApiOperationObject {
  return {
    operationId,
    summary,
    tags: [tag],
    security: [{ apiKeyAuth: [] }],
    description: `${description ?? (read ? READ_DESCRIPTION : WRITE_DESCRIPTION)}\n\nRequires: ${requires}`,
    requestBody: {
      required: true,
      content: { "application/json": { schema: input, ...(examples ? { examples } : {}) } },
    },
    responses: {
      "200": {
        description: read ? "The requested data." : "The operation was accepted or completed.",
        content: { "application/json": { schema: output } },
      },
      ...StructuredApiResponses,
    },
  };
}

const SPREADSHEET_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function withWorkbookResponse(operation: ZodOpenApiOperationObject): ZodOpenApiOperationObject {
  const ok = operation.responses?.["200"];
  if (!ok || !("content" in ok)) return operation;
  return {
    ...operation,
    responses: {
      ...operation.responses,
      "200": {
        ...ok,
        description: "The JSON export document, or the XLSX workbook when format is xlsx.",
        content: {
          ...ok.content,
          [SPREADSHEET_CONTENT_TYPE]: { schema: z.string().meta({ format: "binary" }) },
        },
      },
    },
  };
}

const TYPE_ID = "0b6f3c1e-8a52-4c39-9d7e-2f4a6b8c1d01";
const RECORD_ID = "5d2e9a47-1c3b-4f6a-8e0d-7b9c2a4f6e11";
const NAME_FIELD_ID = "9a4c2e61-3b5d-4f7a-8c9e-1d2b3a4c5e21";
const AMOUNT_FIELD_ID = "c7e1a3b5-2d4f-4a6c-9e8b-0f1a2b3c4d31";
const TRASH_ITEM_ID = "e3b5c7d9-4f6a-4b8c-9d0e-1a2b3c4d5e41";
const TRASH_BATCH_ID = "f4c6d8e0-5a7b-4c9d-8e1f-2a3b4c5d6e51";

export const recordApiExamples = {
  export: {
    workbook: {
      summary: "Export a sorted list as an Excel workbook",
      value: {
        typeId: TYPE_ID,
        search: "Acme",
        filters: [],
        relationships: [],
        sort: [{ fieldId: NAME_FIELD_ID, direction: "asc" }],
        format: "xlsx",
      },
    },
    document: {
      summary: "Export a list as a JSON document for import",
      value: { typeId: TYPE_ID, filters: [], relationships: [], sort: [], format: "json" },
    },
  },
  query: {
    filtered: {
      summary: "Query records with a filter and sort",
      value: {
        typeId: TYPE_ID,
        fields: [NAME_FIELD_ID, AMOUNT_FIELD_ID],
        filters: [{ fieldId: NAME_FIELD_ID, operator: "contains", value: { kind: "text", value: "Acme" } }],
        sort: [{ fieldId: "system:updatedAt", direction: "desc" }],
        page: 1,
        pageSize: 25,
      },
    },
  },
  mutate: {
    create: {
      summary: "Create a record",
      value: {
        expectedRevision: 42,
        idempotencyKey: "create-acme-renewal-2026",
        mutation: {
          action: "create",
          typeId: TYPE_ID,
          fields: [
            { fieldId: NAME_FIELD_ID, value: { kind: "text", value: "Acme renewal" } },
            { fieldId: AMOUNT_FIELD_ID, value: { kind: "decimal", value: "12000.00", currency: "EUR" } },
          ],
        },
      },
    },
    update: {
      summary: "Update a record at its current version",
      value: {
        expectedRevision: 42,
        idempotencyKey: "update-acme-renewal-amount",
        mutation: {
          action: "update",
          ref: { typeId: TYPE_ID, recordId: RECORD_ID },
          expectedVersion: 3,
          fields: [{ fieldId: AMOUNT_FIELD_ID, value: { kind: "decimal", value: "15000.00", currency: "EUR" } }],
        },
      },
    },
    delete: {
      summary: "Move a record to Trash",
      value: {
        expectedRevision: 42,
        idempotencyKey: "delete-acme-renewal",
        mutation: {
          action: "delete",
          ref: { typeId: TYPE_ID, recordId: RECORD_ID },
          expectedVersion: 4,
        },
      },
    },
  },
  discover: {
    all: { summary: "Discover every readable list", value: {} },
    selected: { summary: "Discover selected lists", value: { typeIds: [TYPE_ID] } },
  },
  apply: {
    createList: {
      summary: "Create a list",
      value: {
        expectedRevision: 42,
        idempotencyKey: "create-projects-list",
        operations: [
          {
            operation: "createType",
            reference: "$projects",
            label: "Project",
            pluralLabel: "Projects",
            description: "Client projects",
            icon: "folder",
            embedded: false,
            accessPresetId: null,
          },
        ],
      },
    },
  },
  restore: {
    items: { summary: "Restore Trash items", value: { itemIds: [TRASH_ITEM_ID] } },
    batch: { summary: "Restore everything one delete moved to Trash", value: { batchId: TRASH_BATCH_ID } },
  },
};

const TRASH_ACCESS =
  "delete access to each item: to its list for records, data-model management for lists, fields and relationships, Knowledge Base delete access for pages, an administrator role for routines, and ownership for personal views and widgets.";

export const recordApiPaths = {
  "/v1/messaging/record-links/read": {
    post: operation(
      "readConversationRecords",
      "Read accessible conversation records",
      ReadThreadRecordsSchema,
      ThreadRecordsResultSchema,
      {
        tag: "record-links",
        read: true,
        requires: "read access to inbox messages; only records of readable lists are returned.",
      },
    ),
  },
  "/v1/messaging/record-links/mutate": {
    post: operation(
      "mutateConversationRecords",
      "Link or unlink one conversation record",
      MutateThreadRecordsSchema,
      ThreadRecordMutationResultSchema,
      {
        tag: "record-links",
        requires: "read and edit access to inbox messages, and edit access to the record's list.",
      },
    ),
  },
  "/v1/records/identities/resolve": {
    post: operation(
      "resolveRecordIdentifiers",
      "Resolve exact channel identifiers to every accessible linked record",
      ResolveRecordIdentitiesSchema,
      ResolveRecordIdentitiesResultSchema,
      { read: true, requires: "read access to the lists; records the caller cannot read are omitted." },
    ),
  },
  "/v1/roles/read": {
    post: operation(
      "readRoleConfiguration",
      "Read role permissions and the record type catalog",
      GetRoleEditorSchema,
      RoleApiEditorContextSchema,
      {
        tag: "roles",
        read: true,
        requires: "role management (edit access to users), or read or create access to users.",
      },
    ),
  },
  "/v1/roles/save": {
    post: operation(
      "saveRoleConfiguration",
      "Save system and record type permissions atomically",
      UpsertRoleSchema,
      RoleApiMutationResultSchema,
      {
        tag: "roles",
        requires: "role management: create access to users for a new role, edit access for an existing one.",
      },
    ),
  },
  "/v1/roles/delete": {
    post: operation(
      "deleteRoleConfiguration",
      "Delete an unused custom role",
      DeleteRoleSchema,
      z.object({ deletedId: z.uuid().describe("The id of the deleted role.") }).strict(),
      { tag: "roles", requires: "role management: delete access to users." },
    ),
  },
  "/v1/records/detail-layout/read": {
    post: operation(
      "readRecordDetailLayout",
      "Read personal record detail layout",
      ReadRecordDetailLayoutSchema,
      RecordDetailLayoutResultSchema,
      { read: true, requires: "read access to the list." },
    ),
  },
  "/v1/records/detail-layout/save": {
    post: operation(
      "saveRecordDetailLayout",
      "Save or reset personal record detail layout",
      SaveRecordDetailLayoutSchema,
      RecordDetailLayoutResultSchema,
      { requires: "read access to the list; the layout applies only to the caller." },
    ),
  },
  "/v1/records/activities": {
    post: operation(
      "queryRecordActivities",
      "Read the activity timeline through declared record paths",
      RecordActivitiesInputSchema,
      RecordActivitiesResultSchema,
      {
        read: true,
        requires: "read access to the record's list; change history also requires read access to the audit log.",
      },
    ),
  },
  "/v1/records/search": {
    post: operation("searchRecords", "Search accessible record types", RecordSearchSchema, RecordSearchResultSchema, {
      read: true,
      requires: "read access to the list; only readable records are returned.",
    }),
  },
  "/v1/records/export": {
    post: withWorkbookResponse(
      operation(
        "exportRecords",
        "Export accessible records as a JSON document or an Excel workbook",
        ExportRecordsSchema,
        RecordExportSchema,
        {
          read: true,
          requires: "read access to the list.",
          description:
            "Exports the selected type's filtered and sorted records with their readable embedded descendants from one consistent workspace snapshot. Maximum 5,000 records and 50,000 candidate links. format json (default) returns a document with stable type, field, relationship and record IDs, readable outbound links and the current schema revision; restricted values remain marked restricted, and import accepts it. format xlsx returns an Excel workbook with one sheet per exported list: readable fields in field order headed by their labels, then relationship columns with linked record names, assignees, timestamps and a hidden record ID. Dates are spreadsheet dates, numbers and money are numbers with the currency in the header, multiple choice and links are comma-separated names, and formatted text is plain text. A field the caller cannot read on any exported record is left out. Incoming links from records outside the selection are not included.",
          examples: recordApiExamples.export,
        },
      ),
    ),
  },
  "/v1/records/import": {
    post: operation(
      "importRecords",
      "Import a same-workspace record document",
      ImportRecordsSchema,
      ImportRecordsResultSchema,
      {
        requires: "create access to the list in create mode, edit access in update mode.",
        description:
          "Creates records with their exported IDs or updates matching IDs in one transaction. Embedded descendants are created after their parents, saved-price snapshots are preserved, and readable outbound links are merged. The document must match the current workspace's type IDs and schema revision. Maximum 100 records and 500 links per request. Create rejects existing IDs; update checks each exported record version. Retries of the identical request use its idempotency key.",
      },
    ),
  },
  "/v1/records/preview-deletion": {
    post: operation(
      "previewRecordDeletion",
      "Preview record deletion and cascading effects",
      PreviewRecordDeletionSchema,
      RecordDeletionPreviewSchema,
      { read: true, requires: "delete access to the list." },
    ),
  },
  "/v1/widgets/save": {
    post: operation(
      "saveRecordWidget",
      "Save a schema-aware widget",
      GenericRecordWidgetInputSchema,
      GenericRecordWidgetDtoSchema,
      { tag: "widgets", requires: "an active workspace member; widgets are personal and show only readable values." },
    ),
  },
  "/v1/widgets/read": {
    post: operation(
      "readRecordWidget",
      "Read a widget with current authorized results",
      RecordWidgetReadSchema,
      GenericRecordWidgetDtoSchema,
      { tag: "widgets", read: true, requires: "read access to the widget's lists; restricted values stay hidden." },
    ),
  },
  "/v1/model/preview": {
    post: operation(
      "previewRecordConfiguration",
      "Preview a configuration change",
      ConfigurationContractSchema,
      ConfigurationPreviewSchema,
      {
        read: true,
        requires:
          "data-model management; role management suffices when every operation is setTypeGrants or putAccessPreset.",
      },
    ),
  },
  "/v1/model/apply": {
    post: operation(
      "applyRecordConfiguration",
      "Apply a configuration change",
      ConfigurationContractSchema,
      RecordOperationResultSchema,
      {
        requires:
          "data-model management; role management suffices when every operation is setTypeGrants or putAccessPreset.",
        examples: recordApiExamples.apply,
      },
    ),
  },
  "/v1/records/read": {
    post: operation("readRecord", "Read one record", RecordReadSchema, RecordDtoSchema, {
      read: true,
      requires: "read access to the list and to the record.",
    }),
  },
  "/v1/records/query": {
    post: operation("queryRecords", "Query records", RecordQuerySchema, RecordQueryResultSchema, {
      read: true,
      requires: "read access to the list; only readable records and values are returned.",
      examples: recordApiExamples.query,
    }),
  },
  "/v1/records/mutate": {
    post: operation(
      "mutateRecord",
      "Create, update, delete or link records",
      MutateRecordRequestSchema,
      RecordOperationResultSchema,
      {
        requires:
          "create access to the list for create; edit access for update, updateMany, link and unlink (on the source record's list); delete access for delete and deleteMany. Every referenced record must be readable.",
        examples: recordApiExamples.mutate,
      },
    ),
  },
  "/v1/trash/query": {
    post: operation(
      "queryTrash",
      "List items in Trash (deleted records, lists, fields, relationships, views, widgets, routines, Knowledge Base pages)",
      QueryTrashSchema,
      TrashPageSchema,
      { tag: "trash", read: true, requires: `${TRASH_ACCESS} Items without access are not listed.` },
    ),
  },
  "/v1/trash/restore": {
    post: operation(
      "restoreTrash",
      "Restore Trash items, or every item of one delete by batchId",
      RestoreTrashSchema,
      TrashRestoreResultSchema,
      { tag: "trash", requires: TRASH_ACCESS, examples: recordApiExamples.restore },
    ),
  },
  "/v1/trash/preview": {
    post: operation(
      "previewTrashDeletion",
      "Preview exactly what deleting Trash items permanently removes",
      PreviewTrashDeletionSchema,
      TrashDeletionPreviewSchema,
      { tag: "trash", read: true, requires: TRASH_ACCESS },
    ),
  },
  "/v1/trash/delete-permanently": {
    post: operation(
      "deleteTrashPermanently",
      "Delete Trash items permanently and erase their values from history",
      DeleteTrashPermanentlySchema,
      TrashDeletionResultSchema,
      { tag: "trash", requires: TRASH_ACCESS },
    ),
  },
  "/v1/trash/empty": {
    post: operation("emptyTrash", "Empty Trash (administrators)", EmptyTrashSchema, TrashDeletionResultSchema, {
      tag: "trash",
      requires: "an administrator.",
    }),
  },
  "/v1/reports/query": {
    post: operation(
      "queryRecordMeasure",
      "Aggregate record values at an explicit grain",
      RecordMeasureSchema,
      RecordMeasureResultSchema,
      { read: true, requires: "read access to the source list; restricted inputs are hidden." },
    ),
  },
  "/v1/operations/status": {
    post: operation(
      "readRecordOperation",
      "Read the status of a staged operation",
      RecordOperationInputSchema,
      RecordOperationStatusSchema,
      { tag: "operations", read: true, requires: "the user who started the operation, or an administrator." },
    ),
  },
  "/v1/operations/cancel": {
    post: operation(
      "cancelRecordOperation",
      "Cancel an operation before publication",
      RecordOperationInputSchema,
      z.object({ cancelled: z.boolean() }),
      { tag: "operations", requires: "the user who started the operation, or an administrator." },
    ),
  },
  "/v1/operations/resume": {
    post: operation(
      "resumeRecordOperation",
      "Resume an interrupted operation",
      RecordOperationInputSchema,
      z.object({ resumed: z.boolean() }),
      { tag: "operations", requires: "the user who started the operation." },
    ),
  },
};
