import type { ConnectedAccountDto } from "@/ee/messaging/messaging.schema";
import type { ActivityKind } from "@/ee/messaging/activities/activities.schema";

import { isChangeActivityKind } from "@/ee/messaging/activities/activities.schema";

export type ActivityWidgetState =
  | "content"
  | "error"
  | "loading"
  | "noAccount"
  | "noActivity"
  | "noMatches"
  | "noPermission";

type ActivityWidgetStateInput = {
  accountsError: boolean;
  accountsReady: boolean;
  availableRequestedSources: readonly ActivityKind[];
  constrained: boolean;
  connectedAccountCount: number;
  filtering: boolean;
  itemCount: number;
  loadError: boolean;
  ready: boolean;
  requestedSources: readonly ActivityKind[];
};

type AccountActivityKind = Exclude<ActivityKind, "record" | "audit" | "configuration">;

export function accountSupportsActivitySources(
  account: Pick<ConnectedAccountDto, "hasCalendar" | "hasMessaging">,
  sources: readonly AccountActivityKind[],
): boolean {
  return sources.some((source) => {
    if (source === "calendar_event") return account.hasCalendar;
    return account.hasMessaging;
  });
}

export function resolveActivityWidgetState(input: ActivityWidgetStateInput): ActivityWidgetState {
  if (input.filtering || !input.ready) return "loading";
  if (input.loadError && input.itemCount === 0) return "error";
  if (input.requestedSources.length === 0) return input.constrained ? "noMatches" : "noActivity";

  if (input.availableRequestedSources.length === 0) return "noPermission";

  const canReadAudit = input.availableRequestedSources.some(isChangeActivityKind);
  const needsConnectedAccount = input.availableRequestedSources.some((source) => !isChangeActivityKind(source));
  if (needsConnectedAccount && input.accountsError) return "error";
  if (needsConnectedAccount && !input.accountsReady) return "loading";
  if (needsConnectedAccount && !canReadAudit && input.itemCount === 0 && input.connectedAccountCount === 0)
    return "noAccount";
  if (input.itemCount === 0) return input.constrained ? "noMatches" : "noActivity";
  return "content";
}
