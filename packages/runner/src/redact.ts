export const REDACTED = "[redacted]";

const TOKEN_PATTERNS = [/cmr_[A-Za-z0-9_-]{20,}/gu, /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/giu];

export function redactText(text: string, secrets: readonly string[] = []): string {
  let result = text;
  for (const secret of secrets) if (secret.length >= 6) result = result.split(secret).join(REDACTED);
  for (const pattern of TOKEN_PATTERNS) result = result.replace(pattern, REDACTED);
  return result;
}

export function redactValue(value: unknown, secrets: readonly string[] = []): unknown {
  if (typeof value === "string") return redactText(value, secrets);
  if (Array.isArray(value)) return value.map((entry) => redactValue(entry, secrets));
  if (value !== null && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, redactValue(entry, secrets)]));
  return value;
}
