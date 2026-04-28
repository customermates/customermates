import { z } from "zod";

import { encodeToToon, forbidNullFields, NO_NULL_WIPE_WARNING } from "./utils";

import { getCreateManyDealsInteractor, getUpdateManyDealsInteractor } from "@/core/di";
import { BaseCreateDealSchema } from "@/features/deals/upsert/create-deal-base.schema";
import { BaseUpdateDealSchema } from "@/features/deals/upsert/update-deal-base.schema";

const DEAL_WIPE_GUARDED_FIELDS = [
  "organizationIds",
  "userIds",
  "contactIds",
  "services",
  "taskIds",
  "customFieldValues",
] as const;

const CreateDealsSchema = z.object({
  deals: z.array(BaseCreateDealSchema).min(1).max(100),
});

const UpdateDealsSchema = z.object({
  deals: z.array(forbidNullFields(BaseUpdateDealSchema, DEAL_WIPE_GUARDED_FIELDS)).min(1).max(100),
});

export const createDealsTool = {
  name: "create_deals",
  description:
    "Create up to 100 deals in one call. " +
    "Required per item: name. " +
    "Optional per item: notes, organizationIds, userIds, contactIds, services (array of { serviceId, quantity }), taskIds, customFieldValues. " +
    "You can pass organizationIds/userIds/contactIds/services/taskIds directly in create so linked deals are created in one call. " +
    "Prereq: call get_entity_configuration for custom-column ids. " +
    "Returns the list of created deal ids and names.",
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  inputSchema: CreateDealsSchema,
  execute: async (params: z.infer<typeof CreateDealsSchema>) => {
    const result = await getCreateManyDealsInteractor().invoke(params);
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return encodeToToon({
      items: result.data.map((item) => ({ id: item.id, name: item.name })),
    });
  },
};

export const updateDealsTool = {
  name: "update_deals",
  description:
    "Partial update for up to 100 deals in one call. " +
    "Required per item: id. " +
    "Optional per item: name, notes, organizationIds, userIds, contactIds, services (array of { serviceId, quantity }), taskIds, customFieldValues. " +
    "WARNING: if you pass organizationIds, userIds, contactIds, services, or taskIds, the array REPLACES existing links (any id not in the array is unlinked). " +
    "To ADD or REMOVE a single link without touching the rest, use link_entities or unlink_entities instead. " +
    NO_NULL_WIPE_WARNING +
    " Idempotent: same payload produces the same state.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: UpdateDealsSchema,
  execute: async (params: z.infer<typeof UpdateDealsSchema>) => {
    const result = await getUpdateManyDealsInteractor().invoke(params);
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return `Updated ${result.data.length} deal(s)`;
  },
};
