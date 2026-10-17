import { hmacSha256Hex, verifyHmacSha256Hex } from "@/core/utils/hmac";

const SIGNATURE_PATTERN = /^[0-9a-f]{64}$/;

function signingSecret(authSecret: string | undefined): string {
  const trimmed = authSecret?.trim();
  if (!trimmed) throw new Error("BETTER_AUTH_SECRET is required to sign the workspace of a checkout");
  return `lemonsqueezy-checkout-workspace:v1:${trimmed}`;
}

export function signCheckoutWorkspace(companyId: string, authSecret: string | undefined): string {
  return hmacSha256Hex(signingSecret(authSecret), companyId);
}

export function isCheckoutWorkspaceSignature(
  companyId: string,
  signature: string,
  authSecret: string | undefined,
): boolean {
  return SIGNATURE_PATTERN.test(signature) && verifyHmacSha256Hex(signingSecret(authSecret), companyId, signature);
}
