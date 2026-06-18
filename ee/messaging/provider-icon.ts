import type { MessagingProvider } from "@/generated/prisma";

import { Google, Instagram, Linkedin, Mail, Outlook, Telegram, Whatsapp } from "@/components/icons/channel-icon";

export const EMAIL_PROVIDERS: ReadonlyArray<MessagingProvider> = ["mail", "google", "outlook"];

export function isEmailProvider(provider: MessagingProvider): boolean {
  return EMAIL_PROVIDERS.includes(provider);
}

const PHONE_PROVIDERS: ReadonlyArray<MessagingProvider> = ["whatsapp"];

export function isPhoneProvider(provider: MessagingProvider): boolean {
  return PHONE_PROVIDERS.includes(provider);
}

const DETERMINISTIC_PROVIDERS: ReadonlyArray<MessagingProvider> = ["mail", "google", "outlook", "whatsapp"];

export function isDeterministicProvider(provider: MessagingProvider): boolean {
  return DETERMINISTIC_PROVIDERS.includes(provider);
}

const HANDLE_PROVIDERS: ReadonlyArray<MessagingProvider> = ["linkedin", "telegram", "instagram"];

export const MANUAL_CHANNEL_PROVIDERS: ReadonlyArray<MessagingProvider> = [
  "mail",
  ...PHONE_PROVIDERS,
  ...HANDLE_PROVIDERS,
];

export function isHandleProvider(provider: MessagingProvider): boolean {
  return HANDLE_PROVIDERS.includes(provider);
}

export function isUsableSenderFor(
  account: { status: string; provider: MessagingProvider },
  provider: MessagingProvider,
): boolean {
  if (account.status !== "ok") return false;
  return isEmailProvider(provider) ? isEmailProvider(account.provider) : account.provider === provider;
}

export function getProviderProfileUrl(provider: MessagingProvider, value: string): string | null {
  if (!value) return null;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;

  const handle = value.replace(/^@/, "");

  switch (provider) {
    case "linkedin":
      return `https://www.linkedin.com/in/${handle}`;
    case "telegram":
      return `https://t.me/${handle}`;
    case "instagram":
      return `https://www.instagram.com/${handle}`;
    default:
      return null;
  }
}

export function getProviderIcon(provider: MessagingProvider) {
  switch (provider) {
    case "linkedin":
      return Linkedin;
    case "instagram":
      return Instagram;
    case "whatsapp":
      return Whatsapp;
    case "telegram":
      return Telegram;
    case "google":
      return Google;
    case "outlook":
      return Outlook;
    case "mail":
      return Mail;
    default:
      return Mail;
  }
}
