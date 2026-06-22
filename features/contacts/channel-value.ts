import type { MessagingProvider } from "@/generated/prisma";

import { z } from "zod";

import { isEmailProvider, isPhoneProvider } from "@/ee/messaging/provider";

const HANDLE_URL_PATTERNS: Partial<Record<MessagingProvider, RegExp>> = {
  linkedin: /linkedin\.com\/in\/([^/?#]+)/i,
  telegram: /t\.me\/([^/?#]+)/i,
  instagram: /instagram\.com\/([^/?#]+)/i,
};

const HANDLE_CHARSET = /^[\w.@+=-]{1,160}$/;

export function parseChannelHandle(provider: MessagingProvider, raw: string): string {
  const value = raw.trim();
  const pattern = HANDLE_URL_PATTERNS[provider];
  const match = pattern ? value.match(pattern) : null;
  return (match ? match[1] : value).replace(/^@/, "").replace(/\/+$/, "");
}

export function normalizeChannelValue(provider: MessagingProvider, raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  if (isEmailProvider(provider)) return z.email().safeParse(value).success ? value.toLowerCase() : null;

  if (isPhoneProvider(provider)) {
    const digits = value.replace(/[^\d]/g, "");
    return z.e164().safeParse(`+${digits}`).success ? digits : null;
  }

  const handle = parseChannelHandle(provider, value);
  return HANDLE_CHARSET.test(handle) ? handle : null;
}
