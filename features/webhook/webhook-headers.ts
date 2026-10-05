import { z } from "zod";

import { CustomErrorCode } from "@/core/validation/validation.types";

import { allowsPrivateWebhookDestinations } from "./webhook-destination";

export const WEBHOOK_HEADER_MAX_COUNT = 20;
export const WEBHOOK_HEADER_NAME_MAX_CHARS = 128;
export const WEBHOOK_HEADER_VALUE_MAX_CHARS = 2048;
export const WEBHOOK_HEADER_TOTAL_MAX_CHARS = 8192;

export const WEBHOOK_RESERVED_HEADERS = [
  "connection",
  "content-length",
  "content-type",
  "host",
  "transfer-encoding",
  "x-webhook-signature",
] as const;

const RESERVED = new Set<string>(WEBHOOK_RESERVED_HEADERS);
const HEADER_NAME_PATTERN = /^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/;
const HEADER_VALUE_PATTERN = /^[\t\u0020-\u007E\u00A0-\u00FF]*$/;

export function isReservedWebhookHeader(name: string): boolean {
  return RESERVED.has(name.trim().toLowerCase());
}

function isUsableHeader(name: string, value: unknown): value is string {
  return (
    typeof value === "string" &&
    HEADER_NAME_PATTERN.test(name) &&
    !isReservedWebhookHeader(name) &&
    HEADER_VALUE_PATTERN.test(value)
  );
}

export const WebhookHeadersSchema = z.record(z.string(), z.string()).superRefine((headers, ctx) => {
  const names = Object.keys(headers);

  if (names.length > WEBHOOK_HEADER_MAX_COUNT)
    ctx.addIssue({ code: "custom", params: { error: CustomErrorCode.webhookHeadersTooMany } });

  const seen = new Set<string>();
  let total = 0;

  for (const name of names) {
    const value = headers[name];
    total += name.length + value.length;

    if (name.length === 0 || name.length > WEBHOOK_HEADER_NAME_MAX_CHARS || !HEADER_NAME_PATTERN.test(name)) {
      ctx.addIssue({ code: "custom", params: { error: CustomErrorCode.webhookHeaderNameInvalid } });
      continue;
    }

    if (isReservedWebhookHeader(name)) {
      ctx.addIssue({ code: "custom", params: { error: CustomErrorCode.webhookHeaderNameReserved } });
      continue;
    }

    const lowered = name.toLowerCase();
    if (seen.has(lowered)) ctx.addIssue({ code: "custom", params: { error: CustomErrorCode.duplicateWebhookHeaders } });
    seen.add(lowered);

    if (value.length > WEBHOOK_HEADER_VALUE_MAX_CHARS || !HEADER_VALUE_PATTERN.test(value))
      ctx.addIssue({ code: "custom", params: { error: CustomErrorCode.webhookHeaderValueInvalid } });
  }

  if (total > WEBHOOK_HEADER_TOTAL_MAX_CHARS)
    ctx.addIssue({ code: "custom", params: { error: CustomErrorCode.webhookHeadersTooLarge } });
});

export function parseStoredWebhookHeaders(value: unknown): Record<string, string> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};

  const entries = Object.entries(value as Record<string, unknown>).filter(([name, headerValue]) =>
    isUsableHeader(name, headerValue),
  );

  return Object.fromEntries(entries) as Record<string, string>;
}

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function allowsCredentialedHeaders(url: string): boolean {
  try {
    const parsed = new URL(url);

    if (parsed.protocol === "https:") return true;

    return parsed.protocol === "http:" && LOOPBACK_HOSTNAMES.has(parsed.hostname) && allowsPrivateWebhookDestinations();
  } catch {
    return false;
  }
}
