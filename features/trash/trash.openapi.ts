import { structuredOperation } from "@/core/openapi/structured-operation";
import { RecordRefSchema } from "@/features/records/record-model.schema";

import { TrashedRecordSchema } from "./trash.schema";

export const trashApiPaths = {
  "/v1/trash/read": {
    post: structuredOperation({
      operationId: "readTrashedRecord",
      summary: "Read a record in Trash",
      description:
        "Reads one deleted record read only, as the Trash preview in the app shows it: its field values and related records as they were when it was deleted, the configuration of its type, and its Trash item with deletion and expiry dates, who deleted it and whether the caller can restore it. Find records with /v1/trash/query, where an item of kind record carries the typeId and its targetId is the recordId, and restore them with /v1/trash/restore. A record that is not in the caller's Trash answers 404.",
      requires:
        "delete on the record's type and read all on it, or read own when the record is assigned to the caller: the rule that shows the record in Trash. Field values stay filtered by the caller's field access.",
      tag: "records",
      input: RecordRefSchema,
      output: TrashedRecordSchema,
      outputDescription: "The trashed record, its type configuration and its Trash item.",
      example: {
        typeId: "0b8c7d6e-5f4a-4b3c-9d2e-1f0a9b8c7d6e",
        recordId: "5c6d7e8f-9a0b-4c1d-8e2f-3a4b5c6d7e8f",
      },
    }),
  },
};
