import type { UnipileAccount } from "./unipile.schema";
import { parseAccountConnectionDetails, type AccountConnectionDetails } from "./account-connection.schema";

import { ConnectedAccountStatus } from "@/generated/prisma";

import { deriveAccountFeatures, mapUnipileStatus } from "./unipile.mappers";

export type AccountConnectionUpdate = {
  status: ConnectedAccountStatus;
  hasMessaging: boolean;
  hasCalendar: boolean;
  connectionDetails: AccountConnectionDetails;
  statusCheckedAt: Date;
};

function providerReason(value: unknown): string | null {
  if (typeof value === "string") {
    return (
      value
        .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
        .replace(
          /\b(access_token|refresh_token|api_key|password|client_secret)["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,}]+)/gi,
          "$1=[redacted]",
        )
        .trim()
        .slice(0, 1000) || null
    );
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const reason = value as Record<string, unknown>;
  return (
    [reason.type, reason.code, reason.description, reason.message]
      .map((part) => (typeof part === "string" ? providerReason(part) : null))
      .filter((part, index, parts) => part && parts.indexOf(part) === index)
      .join(": ") || null
  );
}

export function deriveAccountConnection(
  account: UnipileAccount,
  reason?: unknown,
  storedDetails?: unknown,
  checkedAt = new Date(),
): AccountConnectionUpdate {
  const previous = parseAccountConnectionDetails(storedDetails);
  const features = deriveAccountFeatures(account);
  const products = account.metadata?.products_connection_status ?? {};
  const provider = account.provider?.toLowerCase();
  const calendarProvider = provider === "google" || provider === "outlook";
  const partlyRunning = account.status === "running" || account.status === "partial" || account.status === "degraded";
  const operational =
    partlyRunning &&
    (calendarProvider
      ? (features.hasMessaging || features.hasCalendar) && Object.values(products).includes("running")
      : provider === "facebook" && products.messaging === "running");
  const status = operational ? ConnectedAccountStatus.ok : mapUnipileStatus(account.status);
  const sameProducts =
    previous &&
    Object.keys(previous.products).length === Object.keys(products).length &&
    Object.entries(products).every(([product, productStatus]) => previous.products[product] === productStatus);

  return {
    status:
      calendarProvider && status === "ok" && !features.hasMessaging && !features.hasCalendar
        ? ConnectedAccountStatus.permissions
        : status,
    ...features,
    connectionDetails: {
      status: account.status ?? null,
      products,
      reason:
        providerReason(reason) ??
        providerReason(account.reason) ??
        providerReason(account.status_reason) ??
        providerReason(account.error) ??
        providerReason(account.metadata?.status_reason) ??
        providerReason(account.metadata?.error) ??
        (previous?.status === account.status && sameProducts ? previous.reason : null),
    },
    statusCheckedAt: checkedAt,
  };
}
