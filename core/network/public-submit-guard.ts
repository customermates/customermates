import { hmacSha256Hex, verifyHmacSha256Hex } from "@/core/utils/hmac";
import { requireSigningSecret } from "@/core/utils/signed-id";

export const PUBLIC_FILL_MS = { min: 2_000, max: 24 * 60 * 60 * 1_000 } as const;

export function renderToken(subjectId: string, issuedAt: Date, authSecret: string | undefined): string {
  const issued = String(issuedAt.getTime());
  return `${issued}.${hmacSha256Hex(requireSigningSecret("public-form-render", authSecret), `${subjectId}:${issued}`)}`;
}

export function renderTokenAgeMs(
  token: string,
  subjectId: string,
  now: Date,
  authSecret: string | undefined,
): number | null {
  const [issued, signature, extra] = token.split(".");
  if (!issued || !signature || extra !== undefined || !/^\d{10,16}$/u.test(issued)) return null;
  const secret = requireSigningSecret("public-form-render", authSecret);
  return verifyHmacSha256Hex(secret, `${subjectId}:${issued}`, signature) ? now.getTime() - Number(issued) : null;
}

export function visitorHash(visitor: string | null | undefined, authSecret: string | undefined): string | null {
  if (!visitor) return null;
  return hmacSha256Hex(requireSigningSecret("public-form-visitor", authSecret), visitor).slice(0, 32);
}

export function looksAutomated(input: {
  honeypot: string | undefined;
  renderToken: string;
  subjectId: string;
  now: Date;
  authSecret: string | undefined;
}): boolean {
  if (input.honeypot) return true;
  const age = renderTokenAgeMs(input.renderToken, input.subjectId, input.now, input.authSecret);
  return age === null || age < PUBLIC_FILL_MS.min || age > PUBLIC_FILL_MS.max;
}
