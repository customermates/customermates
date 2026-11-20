import { hmacSha256Hex, verifyHmacSha256Hex } from "@/core/utils/hmac";
import { requireSigningSecret } from "@/core/utils/signed-id";

export const PUBLIC_FILL_MS = { min: 2_000, max: 24 * 60 * 60 * 1_000 } as const;

const NO_VISITOR = "-";

function visitorTag(visitor: string | null | undefined, authSecret: string | undefined): string {
  if (!visitor) return NO_VISITOR;
  return hmacSha256Hex(requireSigningSecret("public-form-render-visitor", authSecret), visitor).slice(0, 16);
}

function signedText(subjectId: string, issued: string, tag: string): string {
  return `${subjectId}:${issued}:${tag}`;
}

export function renderToken(
  subjectId: string,
  issuedAt: Date,
  authSecret: string | undefined,
  visitor?: string | null,
): string {
  const issued = String(issuedAt.getTime());
  const tag = visitorTag(visitor, authSecret);
  const secret = requireSigningSecret("public-form-render", authSecret);
  return `${issued}.${tag}.${hmacSha256Hex(secret, signedText(subjectId, issued, tag))}`;
}

export function renderTokenAgeMs(
  token: string,
  subjectId: string,
  now: Date,
  authSecret: string | undefined,
): number | null {
  const [issued, tag, signature, extra] = token.split(".");
  if (!issued || !tag || !signature || extra !== undefined || !/^\d{10,16}$/u.test(issued)) return null;
  const secret = requireSigningSecret("public-form-render", authSecret);
  return verifyHmacSha256Hex(secret, signedText(subjectId, issued, tag), signature)
    ? now.getTime() - Number(issued)
    : null;
}

export function renderTokenIssuedTo(
  token: string,
  visitor: string | null | undefined,
  authSecret: string | undefined,
): boolean {
  return token.split(".")[1] === visitorTag(visitor, authSecret);
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
