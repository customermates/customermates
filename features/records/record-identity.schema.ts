import { z } from "zod";

export const RecordIdentityInputSchema = z
  .object({
    provider: z
      .enum(["google", "outlook", "mail", "linkedin", "whatsapp", "instagram", "telegram", "phone"])
      .describe(
        "mail is an email address, stored in lowercase; google and outlook mark an address synced from Gmail or Outlook, and one address is one identity whichever you send. phone is a plain phone number: send E.164 or a national number of the acting user's country; it is stored in E.164 and matches WhatsApp chats from the same number. whatsapp marks a number synced from WhatsApp. One number is one identity whichever of the two you send.",
      ),
    value: z.string().trim().min(1).max(2000),
    messagingId: z.string().trim().min(1).max(2000).nullable().optional(),
    displayName: z.string().max(500).nullable().optional(),
    profileUrl: z
      .url({ protocol: /^https?$/ })
      .max(2000)
      .nullable()
      .optional(),
  })
  .strict();
export type RecordIdentityInput = z.infer<typeof RecordIdentityInputSchema>;

export const RecordIdentitySchema = RecordIdentityInputSchema.extend({
  id: z.uuid(),
  aliases: z.array(z.string()).optional(),
  channelClass: z.string(),
  messagingId: z.string().nullable(),
  displayName: z.string().nullable(),
  profileUrl: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type RecordIdentity = z.infer<typeof RecordIdentitySchema>;

export const RecordIdentityInputsSchema = z
  .array(RecordIdentityInputSchema)
  .max(100)
  .describe(
    "Replaces this record's contact details (phone numbers, email addresses and social profiles) on a list with a channels field. Omit to preserve; [] unlinks this record. Existing shared identities remain unchanged.",
  );
