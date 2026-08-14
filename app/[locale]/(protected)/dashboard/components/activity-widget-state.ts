import type { ConnectedAccountDto } from "@/ee/messaging/messaging.schema";
import type { ActivityKind } from "@/ee/messaging/activities/activities.schema";
import type { Filter } from "@/core/base/base-get.schema";

import { ACTIVITY_KINDS } from "@/ee/messaging/activities/activities.schema";
import { interpretFilters } from "@/ee/messaging/activities/timeline-filters";

export type ActivityWidgetState =
  | "content"
  | "error"
  | "loading"
  | "noAccount"
  | "noActivity"
  | "noMatches"
  | "noPermission"
  | "scopeTooBroad";

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
  scopeTruncated: boolean;
};

type ActivityWidgetSourcePlan = {
  availableRequestedSources: ActivityKind[];
  connectedAccountSources: Exclude<ActivityKind, "audit">[];
  requestedSources: ActivityKind[];
};

export function requestedActivitySources(filters: Filter[] | undefined): ActivityKind[] {
  const query = interpretFilters(filters);

  return ACTIVITY_KINDS.filter(
    (kind) => (!query.kindsIn || query.kindsIn.has(kind)) && (!query.kindsNotIn || !query.kindsNotIn.has(kind)),
  );
}

export function activityWidgetSourcePlan(
  filters: Filter[] | undefined,
  availableSources: readonly ActivityKind[],
): ActivityWidgetSourcePlan {
  const requestedSources = requestedActivitySources(filters);
  const available = new Set(availableSources);
  const availableRequestedSources = requestedSources.filter((source) => available.has(source));
  const connectedAccountSources = availableRequestedSources.filter(
    (source): source is Exclude<ActivityKind, "audit"> => source !== "audit",
  );

  return { availableRequestedSources, connectedAccountSources, requestedSources };
}

export function accountSupportsActivitySources(
  account: Pick<ConnectedAccountDto, "hasCalendar" | "hasMessaging">,
  sources: readonly Exclude<ActivityKind, "audit">[],
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

  const canReadAudit = input.availableRequestedSources.includes("audit");
  const needsConnectedAccount = input.availableRequestedSources.some((source) => source !== "audit");
  if (needsConnectedAccount && input.accountsError) return "error";
  if (needsConnectedAccount && !input.accountsReady) return "loading";
  if (input.scopeTruncated && input.itemCount === 0) return "scopeTooBroad";
  if (needsConnectedAccount && !canReadAudit && input.itemCount === 0 && input.connectedAccountCount === 0)
    return "noAccount";
  if (input.itemCount === 0) return input.constrained ? "noMatches" : "noActivity";
  return "content";
}
