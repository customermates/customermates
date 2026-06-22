import { z } from "zod";

import {
  encodeToToon,
  forbidNullFields,
  NO_NULL_WIPE_WARNING,
  runInteractor,
  CUSTOM_COLUMN_PREREQ,
  CUSTOM_FIELDS_MERGE_NOTE,
  IDEMPOTENT_NOTE,
  relationsViaLinkNote,
} from "./utils";

import { getCreateManyDealsInteractor, getUpdateManyDealsInteractor } from "@/core/di";
import { BaseCreateDealSchema } from "@/features/deals/upsert/create-deal-base.schema";
import { BaseUpdateDealSchema } from "@/features/deals/upsert/update-deal-base.schema";

const CreateDealsSchema = z.object({
  deals: z.array(BaseCreateDealSchema).min(1).max(100),
});

const UpdateDealsSchema = z.object({
  deals: z
    .array(
      forbidNullFields(
        BaseUpdateDealSchema.omit({ organizationIds: true, userIds: true, contactIds: true, taskIds: true }),
        ["services", "customFieldValues"],
      ),
    )
    .min(1)
    .max(100),
});

export const createDealsTool = {
  name: "create_deals",
  description:
    "Create up to 100 deals in one call. " +
    "Required per item: name. " +
    "Optional per item: notes, organizationIds, userIds, contactIds, services (array of { serviceId, quantity }), taskIds, customFieldValues. " +
    "You can pass organizationIds/userIds/contactIds/services/taskIds directly in create so linked deals are created in one call. " +
    CUSTOM_COLUMN_PREREQ +
    " Returns the list of created deal ids and names.",
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  inputSchema: CreateDealsSchema,
  execute: (params: z.infer<typeof CreateDealsSchema>) =>
    runInteractor(getCreateManyDealsInteractor().invoke(params), (data) =>
      encodeToToon({ items: data.map((item) => ({ id: item.id, name: item.name })) }),
    ),
};

export const updateDealsTool = {
  name: "update_deals",
  description:
    "Partial update for up to 100 deals in one call. " +
    "Required per item: id. " +
    "Optional per item: name, notes, services (array of { serviceId, quantity }), customFieldValues. " +
    relationsViaLinkNote("organizations, users, contacts, tasks") +
    " `services` REPLACES the deal's full service set and is the only place to set quantities: when provided, services not listed are removed, so omit the field to leave services untouched, or read the current services then write the full list. Use link_entities / unlink_entities to add or remove a service (added with quantity 1) without touching the rest. " +
    NO_NULL_WIPE_WARNING +
    " " +
    CUSTOM_FIELDS_MERGE_NOTE +
    " " +
    IDEMPOTENT_NOTE,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: UpdateDealsSchema,
  execute: (params: z.infer<typeof UpdateDealsSchema>) =>
    runInteractor(getUpdateManyDealsInteractor().invoke(params), (data) => `Updated ${data.length} deal(s)`),
};
