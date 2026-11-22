import type { ConnectedAccountDto } from "@/ee/messaging/messaging.schema";

import { isEmailProvider } from "@/ee/messaging/provider";

type ActionAccount = Pick<ConnectedAccountDto, "status" | "connectionDetails" | "isOwner">;

type Permissions = { canUpdate: boolean; canDelete: boolean };

export type ConnectedAccountActions = { reconnect: boolean; resync: boolean; disconnect: boolean };

export function connectedAccountActions(
  account: ActionAccount,
  { canUpdate, canDelete }: Permissions,
): ConnectedAccountActions {
  const canReconnect =
    canUpdate &&
    (account.status === "credentials" ||
      account.status === "permissions" ||
      account.status === "error" ||
      account.connectionDetails?.status === "partial" ||
      account.status === "stopped");
  const canResync = canUpdate && (account.status === "ok" || account.status === "connecting");

  return {
    reconnect: account.isOwner && canReconnect,
    resync: account.isOwner && canResync,
    disconnect: account.isOwner && canDelete,
  };
}

export type ConnectedAccountCapability = "email" | "calendar" | "messages" | "posts";

export function connectedAccountCapabilities(
  account: Pick<ConnectedAccountDto, "provider" | "hasMessaging" | "hasCalendar">,
): ConnectedAccountCapability[] {
  const capabilities: ConnectedAccountCapability[] = [];
  if (account.hasMessaging) capabilities.push(isEmailProvider(account.provider) ? "email" : "messages");
  if (account.hasCalendar) capabilities.push("calendar");
  if (account.provider === "linkedin") capabilities.push("posts");
  return capabilities;
}
