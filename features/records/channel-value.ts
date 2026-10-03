import type { MessagingProvider } from "@/generated/prisma";

import { z } from "zod";

import { HANDLE_PROVIDERS, isEmailProvider, isPhoneProvider } from "@/ee/messaging/provider";

const HANDLE_URL_PATTERNS: Partial<Record<MessagingProvider, RegExp>> = {
  linkedin: /linkedin\.com\/in\/([^/?#]+)/i,
  telegram: /t\.me\/([^/?#]+)/i,
  instagram: /instagram\.com\/([^/?#]+)/i,
};

const HANDLE_CHARSET = /^[\p{L}\p{N}\p{M}_.@+=-]{1,160}$/u;
const PHONE_CHARSET = /^\+?[\d\s\-()]{6,}$/;

export function looksLikePhoneText(raw: string): boolean {
  return PHONE_CHARSET.test(raw.trim());
}

export function parseChannelHandle(provider: MessagingProvider, raw: string): string {
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

export function normalizeChannelValue(provider: MessagingProvider, raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  if (isEmailProvider(provider)) return z.email().safeParse(value).success ? value.toLowerCase() : null;

  if (isPhoneProvider(provider)) {
    const e164 = `+${value.replace(/[^\d]/g, "")}`;
    return z.e164().safeParse(e164).success ? e164 : null;
  }

  const handle = parseChannelHandle(provider, value);
  return HANDLE_CHARSET.test(handle) ? handle : null;
}

export function inferChannelProviders(input: string): MessagingProvider[] {
  const value = input.trim();
  if (!value) return [];

  if (z.email().safeParse(value).success) return ["mail"];

  for (const [provider, pattern] of Object.entries(HANDLE_URL_PATTERNS))
    if (pattern.test(value)) return [provider as MessagingProvider];

  if (PHONE_CHARSET.test(value) && z.e164().safeParse(`+${value.replace(/[^\d]/g, "")}`).success) return ["whatsapp"];

  if (HANDLE_CHARSET.test(value.replace(/^@/, ""))) return [...HANDLE_PROVIDERS];

  return [];
}
