export const MAGIC_LINK_REQUESTS_PER_HOUR = 5;

export const MAGIC_LINK_LIMIT_WINDOW_MS = 60 * 60 * 1000;

export const MAGIC_LINK_RATE_LIMITED_CODE = "MAGIC_LINK_RATE_LIMITED";

export const DISPOSABLE_EMAIL_CODE = "DISPOSABLE_EMAIL";

export function magicLinkIssuedIdentifier(email: string): string {
  return `magic-link-issued:${email.trim().toLowerCase()}`;
}
