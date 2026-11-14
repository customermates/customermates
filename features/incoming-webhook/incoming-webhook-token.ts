import { timingSafeEqual } from "node:crypto";

import { hmacSha256Hex } from "@/core/utils/hmac";

export const INCOMING_WEBHOOK_TOKEN_PATTERN = /^[0-9a-f]{64}$/u;

const ID_LENGTH = 32;

function secretFor(authSecret: string | undefined): string {
  const trimmed = authSecret?.trim();
  if (!trimmed) throw new Error("BETTER_AUTH_SECRET is required to sign incoming webhook URLs");
  return `incoming-webhook:v1:${trimmed}`;
}

function signature(id: string, version: number, authSecret: string | undefined): string {
  return hmacSha256Hex(secretFor(authSecret), `${id}:${version}`).slice(0, 64 - ID_LENGTH);
}

function idOf(hex: string): string {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function incomingWebhookToken(id: string, version: number, authSecret: string | undefined): string {
  return `${id.replaceAll("-", "").toLowerCase()}${signature(id.toLowerCase(), version, authSecret)}`;
}

export function incomingWebhookIdFromToken(token: string): string | null {
  return INCOMING_WEBHOOK_TOKEN_PATTERN.test(token) ? idOf(token.slice(0, ID_LENGTH)) : null;
}

export function incomingWebhookTokenValid(
  token: string,
  id: string,
  version: number,
  authSecret: string | undefined,
): boolean {
  if (incomingWebhookIdFromToken(token) !== id) return false;
  const expected = Buffer.from(signature(id, version, authSecret), "utf8");
  const given = Buffer.from(token.slice(ID_LENGTH), "utf8");
  return given.length === expected.length && timingSafeEqual(new Uint8Array(given), new Uint8Array(expected));
}

export function incomingWebhookUrl(
  baseUrl: string,
  id: string,
  version: number,
  authSecret: string | undefined,
): string {
  return `${baseUrl.replace(/\/$/u, "")}/api/hooks/${incomingWebhookToken(id, version, authSecret)}`;
}
