import { timingSafeEqual } from "node:crypto";

import { hmacSha256Hex } from "@/core/utils/hmac";
import { buildLocalePath } from "@/i18n/locale-registry";

export const PUBLIC_FORM_TOKEN_PATTERN = /^[0-9a-f]{64}$/u;

const ID_LENGTH = 32;

function signingSecret(authSecret: string | undefined): string {
  const trimmed = authSecret?.trim();
  if (!trimmed) throw new Error("BETTER_AUTH_SECRET is required to sign public form links");
  return `public-form-link:v1:${trimmed}`;
}

function signature(formId: string, authSecret: string | undefined): string {
  return hmacSha256Hex(signingSecret(authSecret), formId).slice(0, 64 - ID_LENGTH);
}

function formIdOf(hex: string): string {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function publicFormToken(formId: string, authSecret: string | undefined): string {
  return `${formId.replaceAll("-", "").toLowerCase()}${signature(formId.toLowerCase(), authSecret)}`;
}

export function publicFormIdFromToken(token: string, authSecret: string | undefined): string | null {
  if (!PUBLIC_FORM_TOKEN_PATTERN.test(token)) return null;
  const formId = formIdOf(token.slice(0, ID_LENGTH));
  const expected = Buffer.from(signature(formId, authSecret), "utf8");
  const given = Buffer.from(token.slice(ID_LENGTH), "utf8");
  return given.length === expected.length && timingSafeEqual(new Uint8Array(given), new Uint8Array(expected))
    ? formId
    : null;
}

export function publicFormUrl(
  baseUrl: string,
  formId: string,
  authSecret: string | undefined,
  locale: string | null,
): string {
  const root = baseUrl.replace(/\/$/u, "");
  const path = `/f/${publicFormToken(formId, authSecret)}`;
  return `${root}${locale ? buildLocalePath(locale, path) : path}`;
}

export function publicFormEmbedSnippet(url: string, title: string): string {
  const safeTitle = title.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
  return `<iframe src="${url}${url.includes("?") ? "&" : "?"}embed=1" title="${safeTitle}" width="100%" height="720" style="border:0;max-width:640px" loading="lazy"></iframe>`;
}
