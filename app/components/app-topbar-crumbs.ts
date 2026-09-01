import type { AppMode } from "@/core/config/environment";
import type { RuntimeIdentity } from "@/components/layout/layout.store";
import type { Resource } from "@/generated/prisma";

import { OPERATOR_SUBROUTES } from "./navigation/operator-sections";
import { WORKSPACE_SECTIONS, visibleSubroutes, type WorkspaceSection } from "./navigation/workspace-sections";

type Sibling = { slug: string; label: string };

export type AppTopbarCrumb = {
  label: string;
  href?: string;
  siblings?: Sibling[];
  pictureUrl?: string | null;
  isEntity?: boolean;
  isLoading?: boolean;
  showAvatarPlaceholder?: boolean;
};

const GROUP_MAP: Record<string, { group: "overview" | "crm" | "settings" | null; labelKey: string }> = {
  dashboard: { group: "overview", labelKey: "dashboard" },
  inbox: { group: "overview", labelKey: "inbox" },
  tasks: { group: "overview", labelKey: "tasks" },
  contacts: { group: "crm", labelKey: "contacts" },
  organizations: { group: "crm", labelKey: "organizations" },
  deals: { group: "crm", labelKey: "deals" },
  services: { group: "crm", labelKey: "services" },
  settings: { group: "settings", labelKey: "settings" },
  profile: { group: "settings", labelKey: "profile" },
  company: { group: "settings", labelKey: "company" },
  operator: { group: null, labelKey: "operator" },
};

function isWorkspaceSection(segment: string): segment is WorkspaceSection {
  return segment === "profile" || segment === "company";
}

export function buildAppTopbarCrumbs(
  pathname: string,
  t: (key: string) => string,
  entityLabels: Record<string, string>,
  runtimeIdentity: RuntimeIdentity | null,
  appMode: AppMode,
  canAccess: (resource: Resource) => boolean,
  inboxThreadId: string | null = null,
  operatorConsoleVisible = false,
): { crumbs: AppTopbarCrumb[]; section: string | null } {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length <= 1) return { crumbs: [], section: null };
  const parts = segments.slice(1);

  const first = parts[0];
  if (first === "operator" && !operatorConsoleVisible) return { crumbs: [], section: null };

  const entry = GROUP_MAP[first];
  if (!entry) return { crumbs: [], section: null };

  const workspaceSection = isWorkspaceSection(first) ? first : null;
  const sectionSubroutes = workspaceSection ? visibleSubroutes(workspaceSection, appMode, canAccess) : [];

  const crumbs: AppTopbarCrumb[] = [];
  const leafKey = entry.group === "settings" ? `UserAvatar.${entry.labelKey}` : `NavigationBar.${entry.labelKey}`;
  const sectionHref = workspaceSection
    ? `/${first}/${sectionSubroutes[0]?.slug ?? "settings"}`
    : first === "operator"
      ? "/operator/overview"
      : `/${first}`;
  crumbs.push({ label: entityLabels[first] ?? t(leafKey), href: sectionHref });

  if (parts.length > 1) {
    const leaf = parts[1];
    const subroute = workspaceSection
      ? WORKSPACE_SECTIONS[workspaceSection].find((route) => route.slug === leaf)
      : null;

    const operatorSubroute = first === "operator" ? OPERATOR_SUBROUTES.find((route) => route.slug === leaf) : undefined;

    if (operatorSubroute) {
      crumbs.push({
        label: t(operatorSubroute.labelKey),
        siblings: OPERATOR_SUBROUTES.map((route) => ({ slug: route.slug, label: t(route.labelKey) })),
      });
    } else if (subroute) {
      const siblings: Sibling[] = sectionSubroutes.map((route) => ({
        slug: route.slug,
        label: t(route.labelKey),
      }));
      crumbs.push({ label: t(subroute.labelKey), siblings });
    } else {
      const matchingIdentity =
        runtimeIdentity?.scope === "entity" && runtimeIdentity.key === `${first}:${leaf}` ? runtimeIdentity : null;
      crumbs.push({
        label: matchingIdentity?.title ?? t("PageState.loading"),
        pictureUrl: matchingIdentity?.pictureUrl,
        isEntity: matchingIdentity?.avatarKind != null,
        isLoading: matchingIdentity === null,
        showAvatarPlaceholder: first === "contacts" || first === "organizations",
      });
    }
  }

  if (first === "inbox" && inboxThreadId) {
    const matchingIdentity =
      runtimeIdentity?.scope === "inbox" && runtimeIdentity.key === inboxThreadId ? runtimeIdentity : null;
    crumbs.push({
      label: matchingIdentity?.title ?? t("PageState.loading"),
      pictureUrl: matchingIdentity?.pictureUrl,
      isEntity: matchingIdentity?.avatarKind != null,
      isLoading: matchingIdentity === null,
      showAvatarPlaceholder: true,
    });
  }

  return { crumbs, section: first === "operator" ? "operator" : workspaceSection };
}
