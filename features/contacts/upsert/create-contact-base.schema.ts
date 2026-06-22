import { z } from "zod";

import { CustomFieldValueInputSchema, NotesSchema } from "@/core/base/base-entity.schema";
import { zx } from "@/core/validation/validation.utils";

import { IdentifierInputSchema } from "../contact.schema";

export const BaseCreateContactSchema = z.object({
  firstName: zx.nonBlankText(255),
  lastName: z.string(),
  notes: NotesSchema,
  organizationIds: z.array(z.uuid()).optional().default([]),
  userIds: z.array(z.uuid()).optional().default([]),
  dealIds: z.array(z.uuid()).optional().default([]),
  taskIds: z.array(z.uuid()).optional().default([]),
  customFieldValues: z.array(CustomFieldValueInputSchema).optional().default([]),
  identifiers: z
    .array(IdentifierInputSchema)
    .optional()
    .describe(
      "Messaging channels for this contact. Each item is { provider, value, messagingId? }. provider is one of mail, google, outlook, whatsapp, linkedin, telegram, instagram. value is the email address, phone number, or handle. messagingId is the provider-internal id needed to start chats for linkedin, telegram and instagram; without it the channel is view-only.",
    ),
});
