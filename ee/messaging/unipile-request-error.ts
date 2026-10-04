export const EMAIL_LIKE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const MAX_ERROR_BODY = 500;
const TRAILING_PARTIAL_EMAIL = /[\w.+-]{1,64}@[\w.-]{0,64}$/;

export function redactUnipileBody(bodyText: string): string {
  return bodyText
    .slice(0, MAX_ERROR_BODY)
    .replace(EMAIL_LIKE, "[redacted]")
    .replace(TRAILING_PARTIAL_EMAIL, "[redacted]");
}

export class UnipileRequestError extends Error {
  constructor(
    readonly status: number,
    readonly errorType: string | null,
    readonly bodyText: string,
    readonly retryAfterSeconds: number | null = null,
    readonly url: string | null = null,
  ) {
    super(`Unipile v2 request failed: ${status} ${redactUnipileBody(bodyText)}`);
    this.name = "UnipileRequestError";
  }
}
