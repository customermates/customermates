import type { RecordIdentityProvider } from "@/generated/prisma";

import { z } from "zod";

import { normalizePhoneNumber } from "@/core/utils/phone-number";
import { HANDLE_PROVIDERS, isEmailProvider, isPhoneProvider } from "@/ee/messaging/provider";

const HANDLE_URL_PATTERNS: Partial<Record<RecordIdentityProvider, RegExp>> = {
  linkedin: /linkedin\.com\/in\/([^/?#]+)/i,
  telegram: /t\.me\/([^/?#]+)/i,
  instagram: /instagram\.com\/([^/?#]+)/i,
};

const HANDLE_CHARSET = /^[\p{L}\p{N}\p{M}_.@+=-]{1,160}$/u;
const PHONE_CHARSET = /^\+?[\d\s\-–().\/]{6,}$/;
const WHATSAPP_JID = /^(\d{6,15})@(?:s\.whatsapp\.net|c\.us)$/i;
const INTERNATIONAL_DIGITS = /^[1-9][\d\s\-().\/]*$/;

export function parseChannelHandle(provider: RecordIdentityProvider, raw: string): string {
  const value = raw.trim();
  const pattern = HANDLE_URL_PATTERNS[provider];
  const match = pattern ? value.match(pattern) : null;
  const handle = (match ? match[1] : value).replace(/^@/, "").replace(/\/+$/, "");
  if (!handle.includes("%")) return handle;

  try {
    return decodeURIComponent(handle);
  } catch {
    return handle;
  }
}

function whatsappNumber(value: string): string {
  const jid = WHATSAPP_JID.exec(value);
  if (jid) return `+${jid[1]}`;
  return INTERNATIONAL_DIGITS.test(value) ? `+${value}` : value;
}

export function normalizeChannelValue(
  provider: RecordIdentityProvider,
  raw: string,
  region?: string | null,
): string | null {
  const value = raw.trim();
  if (!value) return null;

  if (isEmailProvider(provider)) return z.email().safeParse(value).success ? value.toLowerCase() : null;

  if (provider === "whatsapp") return normalizePhoneNumber(whatsappNumber(value));

  if (isPhoneProvider(provider)) return normalizePhoneNumber(value, region);

  const handle = parseChannelHandle(provider, value);
  return HANDLE_CHARSET.test(handle) ? handle : null;
}

export function inferChannelProviders(input: string, region?: string | null): RecordIdentityProvider[] {
  const value = input.trim();
  if (!value) return [];

  if (z.email().safeParse(value).success) return ["mail"];

  for (const [provider, pattern] of Object.entries(HANDLE_URL_PATTERNS))
    if (pattern.test(value)) return [provider as RecordIdentityProvider];

  if (PHONE_CHARSET.test(value) && normalizePhoneNumber(value, region)) return ["phone"];

  if (HANDLE_CHARSET.test(value.replace(/^@/, ""))) return [...HANDLE_PROVIDERS];

  return [];
}
