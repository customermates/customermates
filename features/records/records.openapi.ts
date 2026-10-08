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
import { RecordModelViewSchema, RecordDtoSchema } from "./record-model.schema";
import { GetModelSchema } from "./configure-records.interactor";
import { ConfigurationContractSchema, ConfigurationPreviewSchema } from "./configuration.schema";
import { ReadRecentlyDeletedSchema, RecentlyDeletedSchema } from "./get-recently-deleted.interactor";
import {
  RecordQuerySchema,
  MutateRecordSchema,
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

function operation(
  operationId: string,
  summary: string,
  input: z.ZodType,
  output: z.ZodType,
): ZodOpenApiOperationObject {
  return {
    operationId,
    summary,
    tags: ["records"],
    security: [{ apiKeyAuth: [] }],
    description:
      "Configurable CRM record contract. Record references contain both typeId and recordId. Workspace scope comes from authentication. Decimal values are strings. Writes require their documented revision and idempotency preconditions; pending results refer to a durable operation.",
    requestBody: {
      required: true,
      content: { "application/json": { schema: input } },
    },
    responses: {
      "200": {
        description: "The operation was accepted or completed.",
        content: { "application/json": { schema: output } },
      },
      ...StructuredApiResponses,
    },
  };
}

export const recordApiPaths = {
  "/v1/messaging/record-links/read": {
    post: operation(
      "readConversationRecords",
      "Read accessible conversation records",
      ReadThreadRecordsSchema,
      ThreadRecordsResultSchema,
    ),
  },
  "/v1/messaging/record-links/mutate": {
    post: operation(
      "mutateConversationRecords",
      "Link or unlink one conversation record",
      MutateThreadRecordsSchema,
      ThreadRecordMutationResultSchema,
    ),
  },
  "/v1/records/identities/resolve": {
    post: operation(
      "resolveRecordIdentifiers",
      "Resolve exact channel identifiers to every accessible linked record",
      ResolveRecordIdentitiesSchema,
      ResolveRecordIdentitiesResultSchema,
    ),
  },
  "/v1/roles/read": {
    post: operation(
      "readRoleConfiguration",
      "Read role permissions and the record type catalog",
      GetRoleEditorSchema,
      RoleApiEditorContextSchema,
    ),
  },
  "/v1/roles/save": {
    post: operation(
      "saveRoleConfiguration",
      "Save system and record type permissions atomically",
      UpsertRoleSchema,
      RoleApiMutationResultSchema,
    ),
  },
  "/v1/roles/delete": {
    post: operation("deleteRoleConfiguration", "Delete an unused custom role", DeleteRoleSchema, z.string()),
  },
  "/v1/records/detail-layout/read": {
    post: operation(
      "readRecordDetailLayout",
      "Read personal record detail layout",
      ReadRecordDetailLayoutSchema,
      RecordDetailLayoutResultSchema,
    ),
  },
  "/v1/records/detail-layout/save": {
    post: operation(
      "saveRecordDetailLayout",
      "Save or reset personal record detail layout",
      SaveRecordDetailLayoutSchema,
      RecordDetailLayoutResultSchema,
    ),
  },
  "/v1/records/activities": {
    post: operation(
      "queryRecordActivities",
      "Read the activity timeline through declared record paths",
      RecordActivitiesInputSchema,
      RecordActivitiesResultSchema,
    ),
  },
  "/v1/records/search": {
    post: operation("searchRecords", "Search accessible record types", RecordSearchSchema, RecordSearchResultSchema),
  },
  "/v1/records/export": {
    post: {
      ...operation(
        "exportRecords",
        "Export accessible records and their embedded children",
        ExportRecordsSchema,
        RecordExportSchema,
      ),
      description:
        "Exports the selected type's filtered records, readable embedded descendants and readable outbound links from one consistent workspace snapshot. Maximum 5,000 records and 50,000 candidate links. The document carries stable type, field, relationship and record IDs plus the current schema revision; restricted values remain marked restricted. Incoming links from records outside the selection are not included.",
    },
  },
  "/v1/records/import": {
    post: {
      ...operation(
        "importRecords",
        "Import a same-workspace record document",
        ImportRecordsSchema,
        ImportRecordsResultSchema,
      ),
      description:
        "Creates records with their exported IDs or updates matching IDs in one transaction. Embedded descendants are created after their parents, saved-price snapshots are preserved, and readable outbound links are merged. The document must match the current workspace's type IDs and schema revision. Maximum 100 records and 500 links per request. Create rejects existing IDs; update checks each exported record version. Retries of the identical request use its idempotency key.",
    },
  },
  "/v1/records/preview-deletion": {
    post: operation(
      "previewRecordDeletion",
      "Preview record deletion and cascading effects",
      PreviewRecordDeletionSchema,
      RecordDeletionPreviewSchema,
    ),
  },
  "/v1/widgets/save": {
    post: operation(
      "saveRecordWidget",
      "Save a schema-aware widget",
      GenericRecordWidgetInputSchema,
      GenericRecordWidgetDtoSchema,
    ),
  },
  "/v1/widgets/read": {
    post: operation(
      "readRecordWidget",
      "Read a widget with current authorized results",
      RecordWidgetReadSchema,
      GenericRecordWidgetDtoSchema,
    ),
  },
  "/v1/widgets/list": {
    post: operation(
      "listRecordWidgets",
      "Read personal widgets",
      z.object({}).strict(),
      z.object({ widgets: z.array(GenericRecordWidgetDtoSchema) }),
    ),
  },
  "/v1/model/discover": {
    post: operation(
      "discoverRecordModel",
      "Discover record types and their configuration",
      GetModelSchema,
      RecordModelViewSchema,
    ),
  },
  "/v1/model/deleted": {
    post: operation(
      "readRecentlyDeletedConfiguration",
      "Read lists, fields, relationships and activity connections in Recently deleted",
      ReadRecentlyDeletedSchema,
      RecentlyDeletedSchema,
    ),
  },
  "/v1/model/preview": {
    post: operation(
      "previewRecordConfiguration",
      "Preview a configuration change",
      ConfigurationContractSchema,
      ConfigurationPreviewSchema,
    ),
  },
  "/v1/model/apply": {
    post: operation(
      "applyRecordConfiguration",
      "Apply a configuration change",
      ConfigurationContractSchema,
      RecordOperationResultSchema,
    ),
  },
  "/v1/records/read": {
    post: operation("readRecord", "Read one record", RecordReadSchema, RecordDtoSchema),
  },
  "/v1/records/query": {
    post: operation("queryRecords", "Query records", RecordQuerySchema, RecordQueryResultSchema),
  },
  "/v1/records/mutate": {
    post: operation(
      "mutateRecord",
      "Create, update, delete or link records",
      MutateRecordSchema,
      RecordOperationResultSchema,
    ),
  },
  "/v1/reports/query": {
    post: operation(
      "queryRecordMeasure",
      "Aggregate record values at an explicit grain",
      RecordMeasureSchema,
      RecordMeasureResultSchema,
    ),
  },
  "/v1/operations/status": {
    post: operation(
      "readRecordOperation",
      "Read the status of a staged operation",
      RecordOperationInputSchema,
      RecordOperationStatusSchema,
    ),
  },
  "/v1/operations/cancel": {
    post: operation(
      "cancelRecordOperation",
      "Cancel an operation before publication",
      RecordOperationInputSchema,
      z.object({ cancelled: z.boolean() }),
    ),
  },
  "/v1/operations/resume": {
    post: operation(
      "resumeRecordOperation",
      "Resume an interrupted operation",
      RecordOperationInputSchema,
      z.object({ resumed: z.boolean() }),
    ),
  },
};
