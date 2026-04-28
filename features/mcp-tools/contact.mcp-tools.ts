import { z } from "zod";

import { encodeToToon, forbidNullFields, NO_NULL_WIPE_WARNING } from "./utils";

import { getCreateManyContactsInteractor, getUpdateManyContactsInteractor } from "@/core/di";
import { BaseCreateContactSchema } from "@/features/contacts/upsert/create-contact-base.schema";
import { BaseUpdateContactSchema } from "@/features/contacts/upsert/update-contact-base.schema";

const CONTACT_WIPE_GUARDED_FIELDS = ["organizationIds", "userIds", "dealIds", "taskIds", "customFieldValues"] as const;

const CreateContactsSchema = z.object({
  contacts: z.array(BaseCreateContactSchema).min(1).max(100),
});

const UpdateContactsSchema = z.object({
  contacts: z.array(forbidNullFields(BaseUpdateContactSchema, CONTACT_WIPE_GUARDED_FIELDS)).min(1).max(100),
});

export const createContactsTool = {
  name: "create_contacts",
  description:
    "Create up to 100 contacts in one call. " +
    "Required per item: firstName, lastName. " +
    "Optional per item: emails (array of email strings), notes, organizationIds, userIds, dealIds, taskIds, customFieldValues. " +
    "`emails` is the canonical place for any email address belonging to the contact. The FIRST item in the array is the primary email used for default outbound drafts. Integrations resolving by email match against any element of the array. Pass an empty array (or omit the field) if the contact has no email. " +
    "You can pass organizationIds/userIds/dealIds/taskIds directly in create so linked contacts are created in one call. " +
    "Prereq: call get_entity_configuration for custom-column ids. " +
    "Returns the list of created contact ids and names.",
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  inputSchema: CreateContactsSchema,
  execute: async (params: z.infer<typeof CreateContactsSchema>) => {
    const result = await getCreateManyContactsInteractor().invoke(params);
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return encodeToToon({
      items: result.data.map((item) => ({
        id: item.id,
        name: `${item.firstName ?? ""} ${item.lastName ?? ""}`.trim(),
      })),
    });
  },
};

export const updateContactsTool = {
  name: "update_contacts",
  description:
    "Partial update for up to 100 contacts in one call. " +
    "Required per item: id. " +
    "Optional per item: firstName, lastName, emails, notes, organizationIds, userIds, dealIds, taskIds, customFieldValues. " +
    "`emails` REPLACES the contact's email list. Pass an array of valid emails (first item is primary), pass [] to clear all emails, or omit the field to leave existing emails untouched. To add a single email without re-sending the full list, fetch the contact first and append. " +
    "WARNING: if you pass organizationIds, userIds, dealIds, or taskIds, the array REPLACES existing links (any id not in the array is unlinked). " +
    "To ADD or REMOVE a single link without touching the rest, use link_entities or unlink_entities instead. " +
    NO_NULL_WIPE_WARNING +
    " Idempotent: same payload produces the same state.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: UpdateContactsSchema,
  execute: async (params: z.infer<typeof UpdateContactsSchema>) => {
    const result = await getUpdateManyContactsInteractor().invoke(params);
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return `Updated ${result.data.length} contact(s)`;
  },
};
