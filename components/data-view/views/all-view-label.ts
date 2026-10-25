import type { useTranslations } from "next-intl";

import { SURFACE } from "@/core/data-view/data-view-keys";

type Translate = ReturnType<typeof useTranslations>;

export function allViewLabel(
  t: Translate,
  { p13nId, recordPlural }: { p13nId: string | undefined; recordPlural: string | undefined },
): string {
  if (recordPlural) return t("DataView.views.allTab.records", { list: recordPlural });

  switch (p13nId) {
    case SURFACE.users:
      return t("DataView.views.allTab.members");
    case SURFACE.roles:
      return t("DataView.views.allTab.roles");
    case SURFACE.webhooks:
      return t("DataView.views.allTab.webhooks");
    case SURFACE.webhookDeliveries:
      return t("DataView.views.allTab.deliveries");
    case SURFACE.messagingThreads:
      return t("DataView.views.allTab.conversations");
    case SURFACE.entityTimeline:
    case SURFACE.activity:
      return t("DataView.views.allTab.activity");
    case SURFACE.operatorUsers:
      return t("DataView.views.allTab.users");
    case SURFACE.operatorWorkspaces:
      return t("DataView.views.allTab.workspaces");
    case SURFACE.operatorAudit:
      return t("DataView.views.allTab.auditEntries");
    case SURFACE.routines:
      return t("DataView.views.allTab.routines");
    default:
      return t("DataView.views.all");
  }
}
