import { timingSafeEqual } from "node:crypto";

import { hmacSha256Hex, purposeSigningSecret } from "./hmac";

export const SIGNED_ID_TOKEN_PATTERN = /^[0-9a-f]{64}$/u;

const ID_LENGTH = 32;

export function requireSigningSecret(purpose: string, authSecret: string | undefined): string {
  const secret = purposeSigningSecret(purpose, authSecret);
  if (!secret) throw new Error("BETTER_AUTH_SECRET is required to sign public links");
  return secret;
}

function signature(purpose: string, id: string, authSecret: string | undefined, salt: string | number | undefined) {
  const data = salt === undefined ? id : `${id}:${salt}`;
  return hmacSha256Hex(requireSigningSecret(purpose, authSecret), data).slice(0, 64 - ID_LENGTH);
}

function uuidOf(hex: string): string {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function signedIdToken(
  purpose: string,
  id: string,
  authSecret: string | undefined,
  salt?: string | number,
): string {
  const lower = id.toLowerCase();
  return `${lower.replaceAll("-", "")}${signature(purpose, lower, authSecret, salt)}`;
}

export function unverifiedIdOfSignedToken(token: string): string | null {
  return SIGNED_ID_TOKEN_PATTERN.test(token) ? uuidOf(token.slice(0, ID_LENGTH)) : null;
}

export function signedTokenValid(
  purpose: string,
  token: string,
  id: string,
  authSecret: string | undefined,
  salt?: string | number,
): boolean {
  if (unverifiedIdOfSignedToken(token) !== id) return false;
  const expected = Buffer.from(signature(purpose, id, authSecret, salt), "utf8");
  const given = Buffer.from(token.slice(ID_LENGTH), "utf8");
  return given.length === expected.length && timingSafeEqual(new Uint8Array(given), new Uint8Array(expected));
}

export function idOfSignedToken(purpose: string, token: string, authSecret: string | undefined): string | null {
  const id = unverifiedIdOfSignedToken(token);
  return id && signedTokenValid(purpose, token, id, authSecret) ? id : null;
}
