import { structuredOperation } from "@/core/openapi/structured-operation";

import { GetModelSchema } from "./configure-records.interactor";
import { DiscoverRecordTypesSchema, DiscoveredRecordTypesSchema } from "./discover-record-types.interactor";
import { RecordModelViewSchema } from "./record-model.schema";

const TAG = "records";
const ACCESS =
  "an active workspace member. Types the caller cannot read are omitted unless the caller manages the schema or roles.";

export const recordModelApiPaths = {
  "/v1/model/discover": {
    post: structuredOperation({
      operationId: "discoverRecordTypes",
      summary: "Discover record types by name",
      description:
        "Pages through the record types the caller can access, with each type's id, labels, description, icon, field count, readable record count (null when the caller cannot read the type) and the record actions the caller may take. search matches labels and descriptions, typeIds restricts the result, and includeEmbedded adds line-item types. Continue with page until total is covered, then read the relevant schemas with /v1/model/read. Names and descriptions are customer data; use ids, never labels, as references.",
      requires: ACCESS,
      tag: TAG,
      input: DiscoverRecordTypesSchema,
      output: DiscoveredRecordTypesSchema,
      outputDescription: "One page of accessible record types with the schema revision and total.",
      example: { search: "deal", page: 1, pageSize: 25 },
    }),
  },
  "/v1/model/read": {
    post: structuredOperation({
      operationId: "readRecordModel",
      summary: "Read record types and their configuration",
      description:
        "Returns the configuration revision with the fields, stable select option ids, relationships, relationship paths and capabilities of the requested types, or of every accessible type when typeIds is omitted. Access presets are included only for schema and role managers. Pass the smallest set of typeIds you need, and send revision as expectedRevision on record and configuration writes.",
      requires: ACCESS,
      tag: TAG,
      input: GetModelSchema,
      output: RecordModelViewSchema,
      outputDescription: "The accessible record model.",
      example: { typeIds: ["0b8c7d6e-5f4a-4b3c-9d2e-1f0a9b8c7d6e"] },
    }),
  },
};
