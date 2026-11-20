import type { NotificationKind } from "@/generated/prisma";

import { hmacSha256Hex, purposeSigningSecret, verifyHmacSha256Hex } from "@/core/utils/hmac";

import { NOTIFICATION_KINDS } from "./notification.schema";

export const NOTIFICATION_UNSUBSCRIBE_PURPOSE = "notification-unsubscribe";
export const NOTIFICATION_UNSUBSCRIBE_DAYS = 30;
export const NO_PREFERENCE_VERSION = 0;

const DAY_MS = 24 * 60 * 60 * 1000;
const TOKEN_PATTERN = /^(\d{1,12})\.([0-9a-f-]{36})\.([0-9a-f-]{36})\.([A-Za-z]{1,32})\.(\d{1,16})\.([0-9a-f]{64})$/u;

export type NotificationUnsubscribeClaims = {
  userId: string;
  companyId: string;
  kind: NotificationKind;
  preferenceVersion?: number;
};

export type NotificationUnsubscribeGrant =
  | ({ status: "valid" } & Required<NotificationUnsubscribeClaims>)
  | { status: "expired" | "invalid" };

export function notificationUnsubscribeSecret(authSecret: string | undefined): string | null {
  return purposeSigningSecret(NOTIFICATION_UNSUBSCRIBE_PURPOSE, authSecret);
}

export function preferenceVersionOf(updatedAt: Date | null | undefined): number {
  return updatedAt ? updatedAt.getTime() : NO_PREFERENCE_VERSION;
}

function signedMessage(expiresAt: string, claims: Required<NotificationUnsubscribeClaims>): string {
  return [
    NOTIFICATION_UNSUBSCRIBE_PURPOSE,
    expiresAt,
    claims.userId,
    claims.companyId,
    claims.kind,
    String(claims.preferenceVersion),
  ].join(".");
}

export function signNotificationUnsubscribe(
  secret: string,
  claims: NotificationUnsubscribeClaims,
  now = new Date(),
): string {
  const expiresAt = String(Math.floor((now.getTime() + NOTIFICATION_UNSUBSCRIBE_DAYS * DAY_MS) / 1000));
  const signed = { ...claims, preferenceVersion: claims.preferenceVersion ?? NO_PREFERENCE_VERSION };
  return [
    expiresAt,
    signed.userId,
    signed.companyId,
    signed.kind,
    String(signed.preferenceVersion),
    hmacSha256Hex(secret, signedMessage(expiresAt, signed)),
  ].join(".");
}

export function verifyNotificationUnsubscribe(
  secret: string,
  token: string,
  now = new Date(),
): NotificationUnsubscribeGrant {
  const match = TOKEN_PATTERN.exec(token);
  if (!match) return { status: "invalid" };
  const [, expiresAt, userId, companyId, kind, version, signature] = match;
  const knownKind = NOTIFICATION_KINDS.find((candidate) => candidate === kind);
  if (!knownKind) return { status: "invalid" };
  const claims = { userId, companyId, kind: knownKind, preferenceVersion: Number(version) };
  if (String(claims.preferenceVersion) !== version) return { status: "invalid" };
  if (!verifyHmacSha256Hex(secret, signedMessage(expiresAt, claims), signature)) return { status: "invalid" };
  if (Number(expiresAt) * 1000 <= now.getTime()) return { status: "expired" };
  return { status: "valid", ...claims };
}
