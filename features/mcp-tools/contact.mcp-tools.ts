import { z } from "zod";

import {
  CUSTOM_FIELDS_MERGE_NOTE,
  CreatedRecordsOutputSchema,
  toonResult,
  UpdatedRecordsOutputSchema,
  forbidNullFields,
  relationsViaLinkNote,
  runInteractor,
} from "./utils";

import { getCreateManyContactsInteractor, getUpdateManyContactsInteractor } from "@/core/di";
import { BaseCreateContactSchema } from "@/features/contacts/upsert/create-contact-base.schema";
import { BaseUpdateContactSchema } from "@/features/contacts/upsert/update-contact-base.schema";

const CreateContactsSchema = z.object({
  contacts: z.array(BaseCreateContactSchema.strict()).min(1).max(100),
});

const UpdateContactsSchema = z.object({
  contacts: z
    .array(
      forbidNullFields(
        BaseUpdateContactSchema.omit({ organizationIds: true, userIds: true, dealIds: true, taskIds: true }).strict(),
        ["customFieldValues"],
      ),
    )
    .min(1)
    .max(100),
});

export const createContactsTool = {
  name: "create_contacts",
  title: "Create contacts",
  description:
    "Create up to 100 contacts in one call. " +
    "Required per item: firstName, lastName. " +
    "Optional per item: identifiers, notes, organizationIds, userIds, dealIds, taskIds, customFieldValues. " +
    "`identifiers` is the canonical place for messaging channels; displayName and profileUrl are optional enrichment for the contact card. A channel can belong to only one contact: if a value is already linked elsewhere the call is rejected. Omit the field (or pass []) if the contact has no channels. " +
    "You can pass organizationIds/userIds/dealIds/taskIds directly in create so linked contacts are created in one call. " +
    "Returns the list of created contact ids and names.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  inputSchema: CreateContactsSchema,
  outputSchema: CreatedRecordsOutputSchema,
  execute: (params: z.infer<typeof CreateContactsSchema>) =>
    runInteractor(getCreateManyContactsInteractor().invoke(params), (data) =>
      toonResult({
        items: data.map((item) => ({
          id: item.id,
          name: `${item.firstName ?? ""} ${item.lastName ?? ""}`.trim(),
        })),
      }),
    ),
};

export const updateContactsTool = {
  name: "update_contacts",
  title: "Update contacts",
  description:
    "Partial update for up to 100 contacts in one call. " +
    "Address each contact by `id`: its UUID or a channel it already owns, as the id field describes. This is an update, not an upsert, so an id that resolves to no contact is rejected. " +
    "Optional per item: firstName, lastName, identifiers, notes, customFieldValues. " +
    relationsViaLinkNote("organizations, deals, users, tasks") +
    " `identifiers` REPLACES the contact's channel set: when provided, channels not listed are unlinked and their message history detached, so omit the field to leave channels untouched, or first read the current identifiers then write the full list plus the new channel. This is also how you assign an inbox conversation to a contact: adding a participant's channel here links that thread to the contact (and dropping it unlinks). For linkedin, telegram and instagram, value is the handle. A channel can belong to only one contact: if a value is already linked to a different contact the call is rejected. " +
    CUSTOM_FIELDS_MERGE_NOTE,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: UpdateContactsSchema,
  outputSchema: UpdatedRecordsOutputSchema,
  execute: (params: z.infer<typeof UpdateContactsSchema>) =>
    runInteractor(
      getUpdateManyContactsInteractor().invoke(params),
      (data) => `Updated ${data.length} contact(s)`,
      (data) => ({ updated: data.length }),
    ),
};
