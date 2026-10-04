import { z } from "zod";

export const RecordIdentityInputSchema = z
  .object({
    provider: z.enum(["google", "outlook", "mail", "linkedin", "whatsapp", "instagram", "telegram"]),
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
    "Replaces identity channels on a person-identity bound type. Omit to preserve; [] clears. Ordinary email fields are separate.",
  );
