import { z } from "zod";
import { recordUiTarget } from "./record-ui-targets";

import type { AppMode } from "@/core/config/environment";
import type { Resource } from "@/generated/prisma";

import {
  SETTINGS_SECTIONS,
  settingsSectionOf,
  visibleSubroutes,
  type SettingsSection,
} from "@/app/components/navigation/settings-sections";
import { settingsHref } from "@/app/components/navigation/settings-routes";

import {
  CONTROL_PAGES,
  FORM_PAGES,
  PRIMARY_NAV_PAGES,
  SCOPES_WITHOUT_FILTER,
  SCOPES_WITHOUT_SEARCH,
  MENU_NAV_TARGETS,
  SETTINGS_NAV_DESCRIPTIONS,
  TOOLBAR_PAGES_WITH_ADD,
  TOOLBAR_PAGES_WITHOUT_ADD,
  type AnchorPage,
  type FormAnchorPage,
  type ControlPage,
} from "./ui-anchors";

export type AgentUiTarget = {
  id: string;
  elementId?: string;
  route: string;
  description: string;
  prerequisite?: string;
  labelKey?: string;
};

export const SETTINGS_MENU_TARGET = "nav-workspace-menu";

function navTargets(): AgentUiTarget[] {
  const settings = (Object.keys(SETTINGS_SECTIONS) as SettingsSection[]).flatMap((section) =>
    SETTINGS_SECTIONS[section].map((subroute) => ({
      id: `nav-settings-${subroute.slug}`,
      route: settingsHref(subroute.slug),
      description: `${SETTINGS_NAV_DESCRIPTIONS[subroute.slug]} (${section} settings); outside Settings, open the workspace menu and choose Settings first`,
    })),
  );

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
      labelKey: "NavigationBar.search",
    },
    ...MENU_NAV_TARGETS.map((menu) => ({
      id: `nav-${menu.key}`,
      route: "*",
      description: menu.description,
      labelKey: menu.labelKey,
    })),
    ...settings,
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

function formTargets(page: FormAnchorPage): AgentUiTarget[] {
  const discard =
    page.discard === "cancel"
      ? {
          id: `${page.scope}-cancel`,
          description: `Cancel button that closes the ${page.label} without saving and asks before discarding changes`,
          ...prerequisiteOf(page.opener),
        }
      : {
          id: `${page.scope}-reset`,
          description: `Reset button that discards unsaved changes in the ${page.label}; shown once something changed`,
          ...prerequisiteOf(page.resetOpener ?? page.opener),
        };
  return [
    {
      id: `${page.scope}-save`,
      route: page.route,
      description: `Save button of the ${page.label}; always shown, enabled once something changed`,
      ...prerequisiteOf(page.opener),
    },
    { route: page.route, ...discard },
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
    id: "settings-channels-connect",
    route: settingsHref("channels"),
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
    .refine((value) => allowedIds.has(value) || recordUiTarget(value) !== null, `Unknown ${label} target id.`);
}

export const UiTargetIdSchema = exactTargetIdSchema(AGENT_UI_TARGET_IDS, "interface");

export const AGENT_NAV_TARGET_IDS = AGENT_UI_TARGETS.filter((target) => target.route.startsWith("/")).map(
  (target) => target.id,
) as [string, ...string[]];
export const NavigationUiTargetIdSchema = exactTargetIdSchema(AGENT_NAV_TARGET_IDS, "navigation");

export function findAgentUiTarget(targetId: string) {
  return AGENT_UI_TARGETS.find((target) => target.id === targetId) ?? recordUiTarget(targetId);
}

export function unopenedUiPrerequisite(targetId: string, openedBefore: readonly string[] = []): string | null {
  const prerequisite = findAgentUiTarget(targetId)?.prerequisite;
  if (!prerequisite || !findAgentUiTarget(prerequisite)) return null;
  return openedBefore.includes(prerequisite) ? null : prerequisite;
}

export function uiPrerequisiteRefusal(targetId: string, prerequisite: string): string {
  return `${targetId} is inside ${prerequisite}, which the user must open first, so nothing was shown. Highlight ${prerequisite} and tell the user to open it, or run start_tour with ${prerequisite} as the step before ${targetId}.`;
}

export function findAgentNavigationTarget(targetId: string) {
  const target = findAgentUiTarget(targetId);
  return target?.route.startsWith("/") ? target : null;
}

function routeSegments(path: string) {
  return path.split("?")[0].split("/").filter(Boolean);
}

function settingsSectionOfRoute(section: string | undefined, slug: string | undefined) {
  return section === "settings" && slug ? settingsSectionOf(slug) : null;
}

function primaryNavPage(section: string | undefined) {
  return PRIMARY_NAV_PAGES.find((page) => page.route === `/${section}`);
}

export function agentUiPageLabelKeys(route: string): string[] {
  const [section, slug] = routeSegments(route);
  const settingsSection = settingsSectionOfRoute(section, slug);
  if (settingsSection) {
    const labelKey = SETTINGS_SECTIONS[settingsSection].find((subroute) => subroute.slug === slug)?.labelKey;
    return labelKey ? [labelKey] : [];
  }
  return primaryNavPage(section)?.labelKeys ?? [];
}

export function agentSidebarGroupId(targetId: string) {
  const [section] = routeSegments(findAgentUiTarget(targetId)?.route ?? "");
  return section === "settings" && targetId.startsWith("nav-settings-") ? SETTINGS_MENU_TARGET : null;
}

const TOOLBAR_SEARCH_TARGET_IDS = new Set(
  [...TOOLBAR_PAGES_WITH_ADD, ...TOOLBAR_PAGES_WITHOUT_ADD]
    .filter((page) => !SCOPES_WITHOUT_SEARCH.has(page.scope))
    .map((page) => `${page.scope}-search`),
);

export function isToolbarSearchTarget(targetId: string) {
  return TOOLBAR_SEARCH_TARGET_IDS.has(targetId) || recordUiTarget(targetId)?.elementId === "records-search";
}

export function agentRouteVisible(path: string, appMode: AppMode, canAccess: (resource: Resource) => boolean) {
  const [section, slug] = routeSegments(path);
  const settingsSection = settingsSectionOfRoute(section, slug);
  if (settingsSection)
    return visibleSubroutes(settingsSection, appMode, canAccess).some((subroute) => subroute.slug === slug);
  if (section === "settings") return false;
  const page = primaryNavPage(section);
  return !page || ((appMode !== "self-hosted" || !page.cloudOnly) && (!page.resource || canAccess(page.resource)));
}
