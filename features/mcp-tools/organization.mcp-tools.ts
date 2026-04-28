import { z } from "zod";

import { encodeToToon, forbidNullFields, NO_NULL_WIPE_WARNING } from "./utils";

import { getCreateManyOrganizationsInteractor, getUpdateManyOrganizationsInteractor } from "@/core/di";
import { BaseCreateOrganizationSchema } from "@/features/organizations/upsert/create-organization-base.schema";
import { BaseUpdateOrganizationSchema } from "@/features/organizations/upsert/update-organization-base.schema";

const ORGANIZATION_WIPE_GUARDED_FIELDS = ["contactIds", "userIds", "dealIds", "taskIds", "customFieldValues"] as const;

const CreateOrganizationsSchema = z.object({
  organizations: z.array(BaseCreateOrganizationSchema).min(1).max(100),
});

const UpdateOrganizationsSchema = z.object({
  organizations: z
    .array(forbidNullFields(BaseUpdateOrganizationSchema, ORGANIZATION_WIPE_GUARDED_FIELDS))
    .min(1)
    .max(100),
});

export const createOrganizationsTool = {
  name: "create_organizations",
  description:
    "Create up to 100 organizations in one call. " +
    "Required per item: name. " +
    "Optional per item: notes, contactIds, userIds, dealIds, taskIds, customFieldValues. " +
    "You can pass contactIds/userIds/dealIds/taskIds directly in create so linked orgs are created in one call. " +
    "Prereq: call get_entity_configuration for custom-column ids. " +
    "Returns the list of created organization ids and names.",
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  inputSchema: CreateOrganizationsSchema,
  execute: async (params: z.infer<typeof CreateOrganizationsSchema>) => {
    const result = await getCreateManyOrganizationsInteractor().invoke(params);
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return encodeToToon({
      items: result.data.map((item) => ({ id: item.id, name: item.name })),
    });
  },
};

export const updateOrganizationsTool = {
  name: "update_organizations",
  description:
    "Partial update for up to 100 organizations in one call. " +
    "Required per item: id. " +
    "Optional per item: name, notes, contactIds, userIds, dealIds, taskIds, customFieldValues. " +
    "WARNING: if you pass contactIds, userIds, dealIds, or taskIds, the array REPLACES existing links (any id not in the array is unlinked). " +
    "To ADD or REMOVE a single link without touching the rest, use link_entities or unlink_entities instead. " +
    NO_NULL_WIPE_WARNING +
    " Idempotent: same payload produces the same state.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: UpdateOrganizationsSchema,
  execute: async (params: z.infer<typeof UpdateOrganizationsSchema>) => {
    const result = await getUpdateManyOrganizationsInteractor().invoke(params);
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return `Updated ${result.data.length} organization(s)`;
  },
};
