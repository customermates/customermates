import { z } from "zod";

import type { RecordAddress } from "@/features/records/record-model.schema";

import { hmacSha256Hex, verifyHmacSha256Hex } from "@/core/utils/hmac";
import { RecordAddressSchema } from "@/features/records/record-model.schema";
import { verifiedRecordAddress } from "@/features/records/record-address";

export const ADDRESS_CANDIDATE_TTL_MS = 24 * 60 * 60 * 1_000;
export const ADDRESS_CANDIDATE_TOKEN_MAX_LENGTH = 4_096;

const CandidatePayloadSchema = z
  .object({
    expiresAt: z.number().int().positive(),
    address: RecordAddressSchema.omit({ formatted: true, verification: true }).extend({
      provider: z.string().min(1).max(64),
      checkedAt: z.iso.datetime({ offset: true }),
    }),
  })
  .strict();

export function addressCandidateSigningSecret(secret: string | undefined): string | null {
  const trimmed = secret?.trim();
  return trimmed ? `address-candidate:v1:${trimmed}` : null;
}

function signedMessage(companyId: string, payload: string): string {
  return `${companyId}.${payload}`;
}

export function encodeAddressCandidate(
  address: RecordAddress,
  companyId: string,
  secret: string,
  now = new Date(),
): string | null {
  if (address.verification.status !== "verified" || !address.verification.provider || !address.verification.checkedAt)
    return null;
  const payload = Buffer.from(
    JSON.stringify(
      CandidatePayloadSchema.parse({
        expiresAt: now.getTime() + ADDRESS_CANDIDATE_TTL_MS,
        address: {
          street: address.street,
          line2: address.line2,
          postalCode: address.postalCode,
          city: address.city,
          region: address.region,
          countryCode: address.countryCode,
          location: address.location,
          provider: address.verification.provider,
          checkedAt: address.verification.checkedAt,
        },
      }),
    ),
  ).toString("base64url");
  const token = `${payload}.${hmacSha256Hex(secret, signedMessage(companyId, payload))}`;
  return token.length <= ADDRESS_CANDIDATE_TOKEN_MAX_LENGTH ? token : null;
}

export function decodeAddressCandidate(
  token: string,
  companyId: string,
  secret: string,
  now = new Date(),
): RecordAddress | null {
  if (!token || token.length > ADDRESS_CANDIDATE_TOKEN_MAX_LENGTH) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  if (!payload || !/^[0-9a-f]{64}$/u.test(signature)) return null;
  try {
    if (!verifyHmacSha256Hex(secret, signedMessage(companyId, payload), signature)) return null;
    const parsed = CandidatePayloadSchema.safeParse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    if (!parsed.success) return null;
    const { expiresAt, address } = parsed.data;
    if (expiresAt <= now.getTime() || expiresAt > now.getTime() + ADDRESS_CANDIDATE_TTL_MS) return null;
    return verifiedRecordAddress(address, {
      provider: address.provider,
      checkedAt: address.checkedAt,
      location: address.location,
    });
  } catch {
    return null;
  }
}
