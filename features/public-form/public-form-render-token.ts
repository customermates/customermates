import { hmacSha256Hex, verifyHmacSha256Hex } from "@/core/utils/hmac";

function secretFor(purpose: string, authSecret: string | undefined): string {
  const trimmed = authSecret?.trim();
  if (!trimmed) throw new Error("BETTER_AUTH_SECRET is required to sign public form tokens");
  return `${purpose}:v1:${trimmed}`;
}

export function renderToken(formId: string, issuedAt: Date, authSecret: string | undefined): string {
  const issued = String(issuedAt.getTime());
  return `${issued}.${hmacSha256Hex(secretFor("public-form-render", authSecret), `${formId}:${issued}`)}`;
}

export function renderTokenAgeMs(
  token: string,
  formId: string,
  now: Date,
  authSecret: string | undefined,
): number | null {
  const [issued, signature, extra] = token.split(".");
  if (!issued || !signature || extra !== undefined || !/^\d{10,16}$/u.test(issued)) return null;
  const valid = verifyHmacSha256Hex(secretFor("public-form-render", authSecret), `${formId}:${issued}`, signature);
  return valid ? now.getTime() - Number(issued) : null;
}

export function visitorHash(visitor: string | null | undefined, authSecret: string | undefined): string | null {
  if (!visitor) return null;
  return hmacSha256Hex(secretFor("public-form-visitor", authSecret), visitor).slice(0, 32);
}
