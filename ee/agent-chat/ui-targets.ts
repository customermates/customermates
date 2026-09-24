import { z } from "zod";

import type { AppMode } from "@/core/config/environment";
import type { Resource } from "@/generated/prisma";

import {
  WORKSPACE_SECTIONS,
  visibleSubroutes,
  type WorkspaceSection,
} from "@/app/components/navigation/workspace-sections";

import {
  CONTROL_PAGES,
  FORM_PAGES,
  PRIMARY_NAV_PAGES,
  SCOPES_WITHOUT_FILTER,
  SCOPES_WITHOUT_SEARCH,
  STATIC_NAV_PAGES,
  TOOLBAR_PAGES_WITH_ADD,
  TOOLBAR_PAGES_WITHOUT_ADD,
  WORKSPACE_NAV_GROUPS,
  type AnchorPage,
  type ControlPage,
  TRANSFERABLE_SCOPES,
} from "./ui-anchors";

export type AgentUiTarget = {
  id: string;
  route: string;
  description: string;
  prerequisite?: string;
};

function navTargets(): AgentUiTarget[] {
  const workspace = WORKSPACE_NAV_GROUPS.flatMap((group) => [
    {
      id: `nav-${group.section}`,
      route: group.route,
      description: group.description,
    },
    ...WORKSPACE_SECTIONS[group.section].map((subroute) => ({
      id: `nav-${group.section}-${subroute.slug}`,
      route: `/${group.section}/${subroute.slug}`,
      description: `Sidebar link to ${group.section} ${subroute.slug.replace(/-/g, " ")}`,
      prerequisite: `nav-${group.section}`,
    })),
  ]);

  return [
    ...PRIMARY_NAV_PAGES.map((page) => ({
      id: `nav-${page.key}`,
      route: page.route,
      description: page.description,
    })),
    {
      id: "nav-search",
      route: "*",
      description: "Global search button in the sidebar (Cmd+K)",
    },
    ...workspace,
    ...STATIC_NAV_PAGES.map((page) => ({
      id: `nav-${page.key}`,
      route: page.route,
      description: page.description,
    })),
  ];
}

function toolbarTargets(page: AnchorPage, hasAdd: boolean): AgentUiTarget[] {
  return [
    ...(hasAdd
      ? [
          {
            id: `${page.scope}-add`,
            route: page.route,
            description: `Button that creates a new entry in ${page.label}`,
          },
        ]
      : []),
    ...(SCOPES_WITHOUT_SEARCH.has(page.scope)
      ? []
      : [
          {
            id: `${page.scope}-search`,
            route: page.route,
            description: `Search input over ${page.label}`,
          },
        ]),
    ...(TRANSFERABLE_SCOPES.has(page.scope)
      ? [
          {
            id: `${page.scope}-transfer`,
            route: page.route,
            description: `Menu that exports ${page.label} to a spreadsheet or adds them from one`,
          },
        ]
      : []),
    ...(SCOPES_WITHOUT_FILTER.has(page.scope)
      ? []
      : [
          {
            id: `${page.scope}-filter`,
            route: page.route,
            description: `Filter popover for ${page.label}`,
          },
        ]),
    {
      id: `${page.scope}-display-options`,
      route: page.route,
      description: `Display options (columns, sort) for ${page.label}`,
    },
    ...(["table", "board"] as const).map((layout) => ({
      id: `${page.scope}-layout-${layout}`,
      route: page.route,
      description: `${layout === "board" ? "board (kanban)" : layout} layout control for ${page.label} (open ${page.scope}-display-options first)`,
      prerequisite: `${page.scope}-display-options`,
    })),
  ];
}

function prerequisiteOf(opener: string | undefined) {
  return opener ? { prerequisite: opener } : {};
}

function formTargets(page: AnchorPage): AgentUiTarget[] {
  return [
    {
      id: `${page.scope}-save`,
      route: page.route,
      description: `Save button of the ${page.label}; ${page.hiddenUntilDirty ? "shown" : "enabled"} once something changed`,
      ...prerequisiteOf(page.opener),
    },
    {
      id: `${page.scope}-reset`,
      route: page.route,
      description: `Reset button that discards unsaved changes in the ${page.label}; shown once something changed`,
      ...prerequisiteOf(page.resetOpener ?? page.opener),
    },
  ];
}

function controlTargets(page: ControlPage): AgentUiTarget[] {
  return page.controls.map((control) => ({
    id: `${page.scope}-${control.control}`,
    route: page.route,
    description: control.description,
    ...prerequisiteOf(control.prerequisite),
  }));
}

export const AGENT_UI_TARGETS: AgentUiTarget[] = [
  ...navTargets(),
  {
    id: "profile-connected-accounts-connect",
    route: "/profile/connected-accounts",
    description: "Connected accounts page button for email, LinkedIn, WhatsApp, Instagram, and Telegram",
  },
  {
    id: "dashboard-add-widget",
    route: "/dashboard",
    description: "Button that adds a dashboard widget",
  },
  ...TOOLBAR_PAGES_WITH_ADD.flatMap((page) => toolbarTargets(page, true)),
  ...TOOLBAR_PAGES_WITHOUT_ADD.flatMap((page) => toolbarTargets(page, false)),
  ...FORM_PAGES.flatMap(formTargets),
  ...CONTROL_PAGES.flatMap(controlTargets),
];

export const AGENT_UI_TARGET_IDS = AGENT_UI_TARGETS.map((target) => target.id) as [string, ...string[]];

function exactTargetIdSchema(ids: readonly string[], label: string) {
  const allowedIds = new Set(ids);
  return z
    .string()
    .max(100)
    .refine((value) => allowedIds.has(value), `Unknown ${label} target id.`);
}

export const UiTargetIdSchema = exactTargetIdSchema(AGENT_UI_TARGET_IDS, "interface");

export const AGENT_NAV_TARGET_IDS = AGENT_UI_TARGETS.filter((target) => target.route.startsWith("/")).map(
  (target) => target.id,
) as [string, ...string[]];
export const NavigationUiTargetIdSchema = exactTargetIdSchema(AGENT_NAV_TARGET_IDS, "navigation");

export function findAgentUiTarget(targetId: string) {
  return AGENT_UI_TARGETS.find((target) => target.id === targetId) ?? null;
}

export function findAgentNavigationTarget(targetId: string) {
  const target = findAgentUiTarget(targetId);
  return target?.route.startsWith("/") ? target : null;
}

function routeSegments(path: string) {
  return path.split("?")[0].split("/").filter(Boolean);
}

function isWorkspaceSection(segment: string | undefined): segment is WorkspaceSection {
  return segment === "profile" || segment === "company";
}

function primaryNavPage(section: string | undefined) {
  return PRIMARY_NAV_PAGES.find((page) => page.route === `/${section}`);
}

export function agentUiPageLabelKey(route: string): string | null {
  const [section, slug] = routeSegments(route);
  if (isWorkspaceSection(section))
    return WORKSPACE_SECTIONS[section].find((subroute) => subroute.slug === slug)?.labelKey ?? null;
  return primaryNavPage(section)?.labelKey ?? null;
}

export function agentRouteVisible(path: string, appMode: AppMode, canAccess: (resource: Resource) => boolean) {
  const [section, slug] = routeSegments(path);
  if (isWorkspaceSection(section))
    return visibleSubroutes(section, appMode, canAccess).some((subroute) => subroute.slug === slug);
  const page = primaryNavPage(section);
  return !page || ((appMode !== "self-hosted" || !page.cloudOnly) && (!page.resource || canAccess(page.resource)));
}
