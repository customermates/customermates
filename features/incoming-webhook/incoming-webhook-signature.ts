import { createHmac, timingSafeEqual } from "node:crypto";

function digestsEqual(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && timingSafeEqual(new Uint8Array(left), new Uint8Array(right));
}

export function incomingWebhookSignature(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

export function incomingWebhookSignatureValid(
  secret: string,
  body: string,
  header: string | null | undefined,
): boolean {
  if (!header) return false;
  const given = header
    .trim()
    .replace(/^sha256=/iu, "")
    .toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(given)) return false;
  return digestsEqual(Buffer.from(given, "utf8"), Buffer.from(incomingWebhookSignature(secret, body), "utf8"));
}
