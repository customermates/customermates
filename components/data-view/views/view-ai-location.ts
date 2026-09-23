import type { EntityType } from "@/generated/prisma";

import { SURFACE, type DataViewSurfaceKey } from "@/core/data-view/data-view-keys";

const LOCATIONS: Record<DataViewSurfaceKey, { entity: EntityType } | { labelKey: string }> = {
  [SURFACE.contacts]: { entity: "contact" },
  [SURFACE.organizations]: { entity: "organization" },
  [SURFACE.deals]: { entity: "deal" },
  [SURFACE.services]: { entity: "service" },
  [SURFACE.tasks]: { entity: "task" },
  [SURFACE.users]: { labelKey: "NavigationBar.members" },
  [SURFACE.roles]: { labelKey: "RolesCard.title" },
  [SURFACE.webhooks]: { labelKey: "WebhooksCard.title" },
  [SURFACE.webhookDeliveries]: { labelKey: "WebhookDeliveriesCard.title" },
  [SURFACE.auditLogs]: { labelKey: "AuditLogsCard.title" },
  [SURFACE.messagingThreads]: { labelKey: "NavigationBar.inbox" },
  [SURFACE.entityTimeline]: { labelKey: "AgentChat.context.timelineLocation" },
  [SURFACE.operatorUsers]: { labelKey: "OperatorUsers.navigation" },
  [SURFACE.operatorWorkspaces]: { labelKey: "OperatorWorkspaces.navigation" },
  [SURFACE.operatorAudit]: { labelKey: "OperatorAudit.navigation" },
  [SURFACE.routines]: { labelKey: "NavigationBar.routines" },
};

export function viewAiLocation(
  surfaceKey: DataViewSurfaceKey,
  translate: (key: string) => string,
  entityPlural: (entity: EntityType) => string,
): string {
  const location = LOCATIONS[surfaceKey];
  if ("entity" in location) return entityPlural(location.entity);
  const label = translate(location.labelKey);
  return surfaceKey.startsWith("operator-") ? `${translate("NavigationBar.operator")} · ${label}` : label;
}
