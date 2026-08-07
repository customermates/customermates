import { Resource } from "@/generated/prisma";
import type { AppMode } from "@/core/config/environment";

export type WorkspaceSection = "profile" | "company";

type WorkspaceSubroute = {
  slug: string;
  labelKey: string;
  resource?: Resource;
  cloudOnly?: boolean;
};

export const WORKSPACE_SECTIONS: Record<WorkspaceSection, WorkspaceSubroute[]> = {
  profile: [
    { slug: "settings", labelKey: "NavigationBar.settings" },
    {
      slug: "connected-accounts",
      labelKey: "NavigationBar.connectedAccounts",
      resource: Resource.inboxMessages,
      cloudOnly: true,
    },
    { slug: "api-keys", labelKey: "ApiKeysCard.title", resource: Resource.api },
  ],
  company: [
    { slug: "subscription", labelKey: "NavigationBar.subscription", resource: Resource.company, cloudOnly: true },
    { slug: "settings", labelKey: "NavigationBar.settings", resource: Resource.company },
    { slug: "members", labelKey: "NavigationBar.members", resource: Resource.users },
    { slug: "roles", labelKey: "RolesCard.title", resource: Resource.users },
    { slug: "audit-logs", labelKey: "AuditLogsCard.title", resource: Resource.auditLog },
    { slug: "webhooks", labelKey: "WebhooksCard.title", resource: Resource.api },
    { slug: "webhook-deliveries", labelKey: "WebhookDeliveriesCard.title", resource: Resource.api },
  ],
};

export function visibleSubroutes(
  section: WorkspaceSection,
  appMode: AppMode,
  canAccess: (resource: Resource) => boolean,
): WorkspaceSubroute[] {
  return WORKSPACE_SECTIONS[section].filter(
    (subroute) =>
      (appMode !== "self-hosted" || !subroute.cloudOnly) && (!subroute.resource || canAccess(subroute.resource)),
  );
}
