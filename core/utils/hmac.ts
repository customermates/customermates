import { createHmac, timingSafeEqual } from "node:crypto";

export function purposeSigningSecret(purpose: string, secret: string | undefined): string | null {
  const trimmed = secret?.trim();
  return trimmed ? `${purpose}:v1:${trimmed}` : null;
}

export function hmacSha256Hex(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data).digest("hex");
}

export function verifyHmacSha256Hex(secret: string, data: string, signatureHex: string): boolean {
  const expected = hmacSha256Hex(secret, data);
  if (expected.length === 0 || signatureHex.length !== expected.length) return false;

  return timingSafeEqual(
    new Uint8Array(Buffer.from(signatureHex, "utf8")),
    new Uint8Array(Buffer.from(expected, "utf8")),
  );
}
