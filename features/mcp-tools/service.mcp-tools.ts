import { z } from "zod";

import { encodeToToon, forbidNullFields, NO_NULL_WIPE_WARNING } from "./utils";

import { getCreateManyServicesInteractor, getUpdateManyServicesInteractor } from "@/core/di";
import { BaseCreateServiceSchema } from "@/features/services/upsert/create-service-base.schema";
import { BaseUpdateServiceSchema } from "@/features/services/upsert/update-service-base.schema";

const SERVICE_WIPE_GUARDED_FIELDS = ["userIds", "dealIds", "taskIds", "customFieldValues"] as const;

const CreateServicesSchema = z.object({
  services: z.array(BaseCreateServiceSchema).min(1).max(100),
});

const UpdateServicesSchema = z.object({
  services: z.array(forbidNullFields(BaseUpdateServiceSchema, SERVICE_WIPE_GUARDED_FIELDS)).min(1).max(100),
});

export const createServicesTool = {
  name: "create_services",
  description:
    "Create up to 100 services in one call. " +
    "Required per item: name, amount (must be > 0). " +
    "Optional per item: notes, userIds, dealIds, taskIds, customFieldValues. " +
    "You can pass userIds/dealIds/taskIds directly in create so linked services are created in one call. " +
    "Prereq: call get_entity_configuration for custom-column ids. " +
    "Returns the list of created service ids and names.",
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  inputSchema: CreateServicesSchema,
  execute: async (params: z.infer<typeof CreateServicesSchema>) => {
    const result = await getCreateManyServicesInteractor().invoke(params);
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return encodeToToon({
      items: result.data.map((item) => ({ id: item.id, name: item.name })),
    });
  },
};

export const updateServicesTool = {
  name: "update_services",
  description:
    "Partial update for up to 100 services in one call. " +
    "Required per item: id. " +
    "Optional per item: name, amount, notes, userIds, dealIds, taskIds, customFieldValues. " +
    "WARNING: if you pass userIds, dealIds, or taskIds, the array REPLACES existing links (any id not in the array is unlinked). " +
    "To ADD or REMOVE a single link without touching the rest, use link_entities or unlink_entities instead. " +
    NO_NULL_WIPE_WARNING +
    " Idempotent: same payload produces the same state.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: UpdateServicesSchema,
  execute: async (params: z.infer<typeof UpdateServicesSchema>) => {
    const result = await getUpdateManyServicesInteractor().invoke(params);
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return `Updated ${result.data.length} service(s)`;
  },
};
