import { z } from "zod";

import { WORKSPACE_SECTIONS } from "@/app/components/navigation/workspace-sections";

import {
  PRIMARY_NAV_PAGES,
  SCOPES_WITHOUT_FILTER,
  STATIC_NAV_PAGES,
  TOOLBAR_PAGES_WITH_ADD,
  TOOLBAR_PAGES_WITHOUT_ADD,
  WORKSPACE_NAV_GROUPS,
  type AnchorPage,
  TRANSFERABLE_SCOPES,
} from "./ui-anchors";

export type AgentUiTargetActivation = { kind: "expanded" } | { kind: "selected"; prerequisite: string };

export type AgentUiTarget = {
  id: string;
  route: string;
  description: string;
  activation?: AgentUiTargetActivation;
};

export type AgentUiClickTarget = AgentUiTarget & {
  activation: AgentUiTargetActivation;
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
    {
      id: `${page.scope}-search`,
      route: page.route,
      description: `Search input over ${page.label}`,
    },
    ...(TRANSFERABLE_SCOPES.has(page.scope)
      ? [
          {
            id: `${page.scope}-transfer`,
            route: page.route,
            description: `Menu that exports ${page.label} to a spreadsheet or adds them from one`,
            activation: { kind: "expanded" as const },
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
      activation: { kind: "expanded" },
    },
    ...(["table", "board"] as const).map((layout) => ({
      id: `${page.scope}-layout-${layout}`,
      route: page.route,
      description: `${layout === "board" ? "board (kanban)" : layout} layout control for ${page.label} (open ${page.scope}-display-options first)`,
      activation: {
        kind: "selected" as const,
        prerequisite: `${page.scope}-display-options`,
      },
    })),
  ];
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

export const AGENT_CLICK_TARGETS = AGENT_UI_TARGETS.filter(
  (target): target is AgentUiClickTarget => target.activation !== undefined,
);

export const AGENT_CLICK_TARGET_IDS = AGENT_CLICK_TARGETS.map((target) => target.id) as [string, ...string[]];
export const ClickUiTargetIdSchema = exactTargetIdSchema(AGENT_CLICK_TARGET_IDS, "activatable interface");

export function findAgentUiTarget(targetId: string) {
  return AGENT_UI_TARGETS.find((target) => target.id === targetId) ?? null;
}

export function findAgentNavigationTarget(targetId: string) {
  const target = findAgentUiTarget(targetId);
  return target?.route.startsWith("/") ? target : null;
}

export function findAgentClickTarget(targetId: string) {
  return AGENT_CLICK_TARGETS.find((target) => target.id === targetId) ?? null;
}
