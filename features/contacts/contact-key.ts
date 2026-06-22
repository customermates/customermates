import type { MessagingProvider } from "@/generated/prisma";

import { z } from "zod";

import { MessagingProviderSchema } from "@/ee/messaging/messaging.schema";

const CHANNEL_PROVIDERS = new Set<string>(MessagingProviderSchema.options);

export const ContactKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(400)
  .describe(
    "Which contact to address. Must be ONE of: the contact's UUID (e.g. '3fa85f64-5717-4562-b3fc-2c963f66afa6'); " +
      "an email address (e.g. 'jane@example.com', matched across mail/Google/Outlook); " +
      "a phone number (e.g. '+491234567890', matched across WhatsApp/Telegram); " +
      "or 'provider:value' for a messaging handle where provider is one of linkedin, telegram, instagram " +
      "(e.g. 'linkedin:john-doe', 'telegram:jdoe', 'instagram:jane'). " +
      "The contact must already exist; unknown or malformed keys are rejected.",
  );

type ParsedContactKey =
  | { kind: "id"; id: string }
  | { kind: "channel"; provider: MessagingProvider; value: string }
  | { kind: "invalid" };

export function parseContactKey(raw: string): ParsedContactKey {
  const value = raw.trim();
  if (z.uuid().safeParse(value).success) return { kind: "id", id: value };

  const colon = value.indexOf(":");
  if (colon > 0 && CHANNEL_PROVIDERS.has(value.slice(0, colon))) {
    return {
      kind: "channel",
      provider: value.slice(0, colon) as MessagingProvider,
      value: value.slice(colon + 1).trim(),
    };
  }

  if (value.includes("@")) return { kind: "channel", provider: "mail", value };
  if (/^\+?[\d\s().-]{5,}$/.test(value)) return { kind: "channel", provider: "whatsapp", value };

  return { kind: "invalid" };
}
