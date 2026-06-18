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
    "Optional per item: identifiers, notes, organizationIds, userIds, dealIds, taskIds, customFieldValues. " +
    "`identifiers` is the canonical place for messaging channels. Each item is { provider, value, messagingId? }: provider is one of mail, google, outlook (value is the email address), whatsapp (value is the phone number), linkedin, telegram, or instagram (value is the handle; messagingId is the provider-internal id required for outbound messaging, channels without it are view-only). A channel can belong to only one contact: if a value is already linked elsewhere the call is rejected. Omit the field (or pass []) if the contact has no channels. " +
    "You can pass organizationIds/userIds/dealIds/taskIds directly in create so linked contacts are created in one call. " +
    "Prereq: call get_entity_configuration for custom-column ids. " +
    "Returns the list of created contact ids and names.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: false,
  },
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
    "Optional per item: firstName, lastName, identifiers, notes, organizationIds, userIds, dealIds, taskIds, customFieldValues. " +
    "`identifiers` REPLACES the contact channel set (same semantics as the relation arrays below): when provided, channels not listed are unlinked and their message history detached, so round-trip the full current list when changing channels. Omit the field to leave channels untouched. Each item is { provider, value, messagingId? } with provider one of mail, google, outlook, whatsapp, linkedin, telegram, instagram (for the latter three, value is the handle and messagingId is the provider-internal id required for outbound messaging; without it the channel is view-only). A channel can belong to only one contact: if a value is already linked to a different contact the call is rejected. " +
    "WARNING: if you pass organizationIds, userIds, dealIds, or taskIds, the array REPLACES existing links (any id not in the array is unlinked). " +
    "To ADD or REMOVE a single link without touching the rest, use link_entities or unlink_entities instead. " +
    NO_NULL_WIPE_WARNING +
    " Idempotent: same payload produces the same state.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: UpdateContactsSchema,
  execute: async (params: z.infer<typeof UpdateContactsSchema>) => {
    const result = await getUpdateManyContactsInteractor().invoke(params);
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return `Updated ${result.data.length} contact(s)`;
  },
};
