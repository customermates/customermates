import {
  isRecordDataViewSurface,
  type AiManageableDataViewSurfaceKey,
  type BuiltinAiManageableDataViewSurfaceKey,
} from "@/core/data-view/ai-manageable-surfaces";

import { SURFACE } from "@/core/data-view/data-view-keys";

const LOCATIONS: Record<BuiltinAiManageableDataViewSurfaceKey, string> = {
  [SURFACE.users]: "SettingsNav.members",
  [SURFACE.roles]: "SettingsNav.roles",
  [SURFACE.webhooks]: "SettingsNav.webhooks",
  [SURFACE.webhookDeliveries]: "SettingsNav.deliveries",
  [SURFACE.messagingThreads]: "NavigationBar.inbox",
  [SURFACE.entityTimeline]: "Common.actions.labelHistory",
  [SURFACE.activity]: "ActivityPage.title",
  [SURFACE.routines]: "NavigationBar.routines",
};

export function viewAiTypeLabel(
  surfaceKey: AiManageableDataViewSurfaceKey,
  translate: (key: string, values?: Record<string, string>) => string,
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

  const label = translate(LOCATIONS[surfaceKey]);
  if (form === "standalone") {
    return t("AgentChat.context.surfaceViewTypeStandalone", {
      location: label,
    });
  }
  return t("AgentChat.context.surfaceViewType", { location: label });
}
