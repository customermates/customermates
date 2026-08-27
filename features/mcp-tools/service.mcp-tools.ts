import { z } from "zod";

import {
  CUSTOM_COLUMN_PREREQ,
  CUSTOM_FIELDS_MERGE_NOTE,
  CreatedRecordsOutputSchema,
  toonResult,
  IDEMPOTENT_NOTE,
  UpdatedRecordsOutputSchema,
  forbidNullFields,
  relationsViaLinkNote,
  runInteractor,
} from "./utils";

import { getCreateManyServicesInteractor, getUpdateManyServicesInteractor } from "@/core/di";
import { BaseCreateServiceSchema } from "@/features/services/upsert/create-service-base.schema";
import { BaseUpdateServiceSchema } from "@/features/services/upsert/update-service-base.schema";

const CreateServicesSchema = z.object({
  services: z.array(BaseCreateServiceSchema.strict()).min(1).max(100),
});

const UpdateServicesSchema = z.object({
  services: z
    .array(
      forbidNullFields(BaseUpdateServiceSchema.omit({ userIds: true, dealIds: true, taskIds: true }).strict(), [
        "customFieldValues",
      ]),
    )
    .min(1)
    .max(100),
});

export const createServicesTool = {
  name: "create_services",
  title: "Create services",
  description:
    "Create up to 100 services in one call. " +
    "Required per item: name, amount (must be > 0). " +
    "Optional per item: notes, userIds, dealIds, taskIds, customFieldValues. " +
    "You can pass userIds/dealIds/taskIds directly in create so linked services are created in one call. " +
    CUSTOM_COLUMN_PREREQ +
    " Returns the list of created service ids and names.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  inputSchema: CreateServicesSchema,
  outputSchema: CreatedRecordsOutputSchema,
  execute: (params: z.infer<typeof CreateServicesSchema>) =>
    runInteractor(getCreateManyServicesInteractor().invoke(params), (data) =>
      toonResult({ items: data.map((item) => ({ id: item.id, name: item.name })) }),
    ),
};

export const updateServicesTool = {
  name: "update_services",
  title: "Update services",
  description:
    "Partial update for up to 100 services in one call. " +
    "Required per item: id. " +
    "Optional per item: name, amount, notes, customFieldValues. " +
    relationsViaLinkNote("users, deals, tasks") +
    " " +
    CUSTOM_FIELDS_MERGE_NOTE +
    " " +
    IDEMPOTENT_NOTE,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: UpdateServicesSchema,
  outputSchema: UpdatedRecordsOutputSchema,
  execute: (params: z.infer<typeof UpdateServicesSchema>) =>
    runInteractor(
      getUpdateManyServicesInteractor().invoke(params),
      (data) => `Updated ${data.length} service(s)`,
      (data) => ({ updated: data.length }),
    ),
};
