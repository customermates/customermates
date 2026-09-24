import type { AiManageableDataViewSurfaceKey } from "@/core/data-view/ai-manageable-surfaces";
import type { EntityType } from "@/generated/prisma";

import { SURFACE } from "@/core/data-view/data-view-keys";

const LOCATIONS: Record<
  Exclude<AiManageableDataViewSurfaceKey, typeof SURFACE.entityTimeline>,
  { entity: EntityType } | { labelKey: string }
> = {
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
  [SURFACE.routines]: { labelKey: "NavigationBar.routines" },
};

export function viewAiTypeLabel(
  surfaceKey: AiManageableDataViewSurfaceKey,
  translate: (key: string, values?: Record<string, string>) => string,
  entitySingular: (entity: EntityType) => string,
  form: "embedded" | "standalone",
): string {
  const t = translate;
  if (surfaceKey === SURFACE.entityTimeline) {
    if (form === "standalone") return t("AgentChat.context.timelineViewTypeStandalone");
    return t("AgentChat.context.timelineViewType");
  }

  const location = LOCATIONS[surfaceKey];
  const label = "entity" in location ? entitySingular(location.entity) : translate(location.labelKey);
  if (form === "standalone") return t("AgentChat.context.surfaceViewTypeStandalone", { location: label });
  return t("AgentChat.context.surfaceViewType", { location: label });
}
