import { z } from "zod";

import { CustomFieldValueSchema, NotesSchema } from "@/core/base/base-entity.schema";

import { IdentifierInputSchema } from "../contact.schema";

export const BaseUpdateContactSchema = z.object({
  id: z.uuid(),
  firstName: z.string().min(1).max(255).optional(),
  lastName: z.string().min(1).max(255).optional(),
  notes: NotesSchema,
  organizationIds: z.array(z.uuid()).nullish(),
  userIds: z.array(z.uuid()).nullish(),
  dealIds: z.array(z.uuid()).nullish(),
  taskIds: z.array(z.uuid()).nullish(),
  customFieldValues: z.array(CustomFieldValueSchema).nullish(),
  identifiers: z
    .array(IdentifierInputSchema)
    .optional()
    .describe(
      "Messaging channels for this contact. REPLACE semantics like the relation arrays: when provided, this array becomes the complete channel set (channels not listed are unlinked, their message history detached). Omit the field to leave channels untouched. Each item is { provider, value, messagingId? }; messagingId is the provider-internal id needed to start chats for linkedin, telegram and instagram; without it the channel is view-only.",
    ),
});
