import { hmacSha256Hex, verifyHmacSha256Hex } from "@/core/utils/hmac";

export const RECORD_FILE_LINK_SECONDS = 15 * 60;

const TOKEN_PATTERN = /^(\d{1,12})\.([0-9a-f-]{36})\.([0-9a-f]{64})$/u;

export type RecordFileGrantPurpose = "download" | "upload";

export type RecordFileGrant = { status: "valid"; userId: string } | { status: "expired" | "invalid" };

export function recordFileGrantSecret(secret: string | undefined): string | null {
  const trimmed = secret?.trim();
  return trimmed ? `record-file-grant:v1:${trimmed}` : null;
}

export function signRecordFileGrant(
  secret: string,
  purpose: RecordFileGrantPurpose,
  fileId: string,
  userId: string,
  expiresAt: Date,
): string {
  const claims = `${Math.floor(expiresAt.getTime() / 1000)}.${userId}`;
  return `${claims}.${hmacSha256Hex(secret, `${purpose}.${fileId}.${claims}`)}`;
}

export function verifyRecordFileGrant(
  secret: string,
  purpose: RecordFileGrantPurpose,
  fileId: string,
  token: string,
  now = new Date(),
): RecordFileGrant {
  const match = TOKEN_PATTERN.exec(token);
  if (!match) return { status: "invalid" };
  const [, expiresAt, userId, signature] = match;
  if (!verifyHmacSha256Hex(secret, `${purpose}.${fileId}.${expiresAt}.${userId}`, signature))
    return { status: "invalid" };
  if (Number(expiresAt) * 1000 <= now.getTime()) return { status: "expired" };
  return { status: "valid", userId };
}
