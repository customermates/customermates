import { timingSafeEqual } from "node:crypto";

import { hmacSha256Hex } from "@/core/utils/hmac";

import { PUBLIC_LINK_TOKEN_PATTERN } from "./public-link.schema";

const ID_LENGTH = 32;

function signingSecret(authSecret: string | undefined): string {
  const trimmed = authSecret?.trim();
  if (!trimmed) throw new Error("BETTER_AUTH_SECRET is required to sign public view links");
  return `public-view-link:v1:${trimmed}`;
}

function signature(linkId: string, authSecret: string | undefined): string {
  return hmacSha256Hex(signingSecret(authSecret), linkId).slice(0, 64 - ID_LENGTH);
}

function linkIdOf(hex: string): string {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function publicLinkToken(linkId: string, authSecret: string | undefined): string {
  return `${linkId.replaceAll("-", "").toLowerCase()}${signature(linkId.toLowerCase(), authSecret)}`;
}

export function publicLinkIdFromToken(token: string, authSecret: string | undefined): string | null {
  if (!PUBLIC_LINK_TOKEN_PATTERN.test(token)) return null;
  const linkId = linkIdOf(token.slice(0, ID_LENGTH));
  const expected = Buffer.from(signature(linkId, authSecret), "utf8");
  const given = Buffer.from(token.slice(ID_LENGTH), "utf8");
  return given.length === expected.length && timingSafeEqual(new Uint8Array(given), new Uint8Array(expected))
    ? linkId
    : null;
}

export function publicLinkUrl(baseUrl: string, linkId: string, authSecret: string | undefined): string {
  return `${baseUrl.replace(/\/$/u, "")}/p/${publicLinkToken(linkId, authSecret)}`;
}
