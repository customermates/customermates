import {
  isRecordDataViewSurface,
  type AiManageableDataViewSurfaceKey,
  type BuiltinAiManageableDataViewSurfaceKey,
} from "@/core/data-view/ai-manageable-surfaces";
import type { EntityType } from "@/features/records/history/v1/legacy-enums";

import { SURFACE } from "@/core/data-view/data-view-keys";

const LOCATIONS: Record<BuiltinAiManageableDataViewSurfaceKey, { entity: EntityType } | { labelKey: string }> = {
  [SURFACE.users]: { labelKey: "NavigationBar.members" },
  [SURFACE.roles]: { labelKey: "RolesCard.title" },
  [SURFACE.webhooks]: { labelKey: "WebhooksCard.title" },
  [SURFACE.webhookDeliveries]: { labelKey: "WebhookDeliveriesCard.title" },
  [SURFACE.auditLogs]: { labelKey: "AuditLogsCard.title" },
  [SURFACE.messagingThreads]: { labelKey: "NavigationBar.inbox" },
  [SURFACE.entityTimeline]: { labelKey: "Common.actions.labelHistory" },
  [SURFACE.routines]: { labelKey: "NavigationBar.routines" },
};

export function viewAiTypeLabel(
  surfaceKey: AiManageableDataViewSurfaceKey,
  translate: (key: string, values?: Record<string, string>) => string,
  entitySingular: (entity: EntityType) => string,
  form: "embedded" | "standalone",
  recordLabel?: string,
): string {
  const t = translate;
  if (surfaceKey === SURFACE.entityTimeline) {
    return form === "standalone"
      ? t("AgentChat.context.timelineViewTypeStandalone")
      : t("AgentChat.context.timelineViewType");
  }
  if (isRecordDataViewSurface(surfaceKey)) {
    return t(
      form === "standalone" ? "AgentChat.context.surfaceViewTypeStandalone" : "AgentChat.context.surfaceViewType",
      { location: recordLabel ?? t("RecordModel.records") },
    );
  }

  const location = LOCATIONS[surfaceKey];
  const label = "entity" in location ? entitySingular(location.entity) : translate(location.labelKey);
  if (form === "standalone") {
    return t("AgentChat.context.surfaceViewTypeStandalone", {
      location: label,
    });
  }
  return t("AgentChat.context.surfaceViewType", { location: label });
}
