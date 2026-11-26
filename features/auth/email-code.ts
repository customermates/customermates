export const EMAIL_CODE_LENGTH = 6;

export const EMAIL_CODE_EXPIRES_IN_SECONDS = 15 * 60;

export const EMAIL_CODE_EXPIRES_IN_MINUTES = EMAIL_CODE_EXPIRES_IN_SECONDS / 60;

export const EMAIL_CODE_ALLOWED_ATTEMPTS = 5;

export const EMAIL_CODE_SENDS_PER_HOUR = 5;

export const EMAIL_CODE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

export const EMAIL_CODE_PATTERN = /^\d{6}$/;

export const RETIRED_VERIFICATION_LINK_PARAM = "link";

export const RETIRED_VERIFICATION_LINK_VALUE = "retired";

export type EmailCodeFailure = "invalid" | "expired" | "tooManyAttempts" | "signedOut";

export type VerifyEmailCodeResult = { ok: true } | { ok: false; error: EmailCodeFailure };

export type SendEmailCodeFailure = "signedOut" | "rateLimited" | "failed";

export type SendEmailCodeResult = { ok: true } | { ok: false; error: SendEmailCodeFailure };

export function emailCodeSentIdentifier(email: string): string {
  return `email-code-sent:${email.trim().toLowerCase()}`;
}

export function emailCodeDigits(input: string): string {
  return input.replace(/\D/g, "").slice(0, EMAIL_CODE_LENGTH);
}
