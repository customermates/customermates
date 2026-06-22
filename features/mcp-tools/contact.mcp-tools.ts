import { z } from "zod";

import {
  encodeToToon,
  forbidNullFields,
  runInteractor,
  CUSTOM_COLUMN_PREREQ,
  CUSTOM_FIELDS_MERGE_NOTE,
  IDEMPOTENT_NOTE,
  relationsViaLinkNote,
} from "./utils";

import { getCreateManyContactsInteractor, getUpdateManyContactsInteractor } from "@/core/di";
import { BaseCreateContactSchema } from "@/features/contacts/upsert/create-contact-base.schema";
import { BaseUpdateContactSchema } from "@/features/contacts/upsert/update-contact-base.schema";

const CreateContactsSchema = z.object({
  contacts: z.array(BaseCreateContactSchema).min(1).max(100),
});

const UpdateContactsSchema = z.object({
  contacts: z
    .array(
      forbidNullFields(
        BaseUpdateContactSchema.omit({ organizationIds: true, userIds: true, dealIds: true, taskIds: true }),
        ["customFieldValues"],
      ),
    )
    .min(1)
    .max(100),
});

export const createContactsTool = {
  name: "create_contacts",
  description:
    "Create up to 100 contacts in one call. " +
    "Required per item: firstName, lastName. " +
    "Optional per item: identifiers, notes, organizationIds, userIds, dealIds, taskIds, customFieldValues. " +
    "`identifiers` is the canonical place for messaging channels. Each item is { provider, value, messagingId?, displayName?, profileUrl? } with provider one of mail, google, outlook, whatsapp, linkedin, telegram, instagram (for the latter three, value is the handle and messagingId is the provider-internal id required for outbound messaging; without it the channel is view-only; the displayName/profileUrl fields are optional enrichment for the contact card). A channel can belong to only one contact: if a value is already linked elsewhere the call is rejected. Omit the field (or pass []) if the contact has no channels. " +
    "You can pass organizationIds/userIds/dealIds/taskIds directly in create so linked contacts are created in one call. " +
    CUSTOM_COLUMN_PREREQ +
    " Returns the list of created contact ids and names.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: false,
  },
  inputSchema: CreateContactsSchema,
  execute: (params: z.infer<typeof CreateContactsSchema>) =>
    runInteractor(getCreateManyContactsInteractor().invoke(params), (data) =>
      encodeToToon({
        items: data.map((item) => ({
          id: item.id,
          name: `${item.firstName ?? ""} ${item.lastName ?? ""}`.trim(),
        })),
      }),
    ),
};

export const updateContactsTool = {
  name: "update_contacts",
  description:
    "Partial update for up to 100 contacts in one call. " +
    "Address each contact by `id`: either the contact UUID, or a channel the contact already owns - an email or phone number (matched across providers), or 'provider:value' for a handle (e.g. 'linkedin:john-doe', 'telegram:jdoe'). The contact must already exist; this is an update, not an upsert, so unknown keys are rejected. " +
    "Optional per item: firstName, lastName, identifiers, notes, customFieldValues. " +
    relationsViaLinkNote("organizations, deals, users, tasks") +
    " `identifiers` REPLACES the contact's channel set: when provided, channels not listed are unlinked and their message history detached, so omit the field to leave channels untouched, or first read the current identifiers then write the full list plus the new channel. This is also how you assign an inbox conversation to a contact: adding a participant's channel here links that thread to the contact (and dropping it unlinks). Each item is { provider, value, messagingId?, displayName?, profileUrl? } with provider one of mail, google, outlook, whatsapp, linkedin, telegram, instagram (for the latter three, value is the handle and messagingId is the provider-internal id required for outbound messaging; without it the channel is view-only). A channel can belong to only one contact: if a value is already linked to a different contact the call is rejected. " +
    CUSTOM_FIELDS_MERGE_NOTE +
    " " +
    IDEMPOTENT_NOTE,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: UpdateContactsSchema,
  execute: (params: z.infer<typeof UpdateContactsSchema>) =>
    runInteractor(getUpdateManyContactsInteractor().invoke(params), (data) => `Updated ${data.length} contact(s)`),
};
