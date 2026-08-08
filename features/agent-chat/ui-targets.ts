import { WORKSPACE_SECTIONS } from "@/app/components/navigation/workspace-sections";

import {
  FORM_PAGES,
  PRIMARY_NAV_PAGES,
  STATIC_NAV_PAGES,
  TOOLBAR_PAGES_WITH_ADD,
  TOOLBAR_PAGES_WITHOUT_ADD,
  WORKSPACE_NAV_GROUPS,
  type AnchorPage,
} from "./ui-anchors";

export type AgentUiTarget = { id: string; route: string; description: string };

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
    {
      id: `${page.scope}-filter`,
      route: page.route,
      description: `Filter popover for ${page.label}`,
    },
    {
      id: `${page.scope}-display-options`,
      route: page.route,
      description: `Display options (columns, sort) for ${page.label}`,
    },
  ];
}

function formTargets(page: AnchorPage): AgentUiTarget[] {
  return [
    {
      id: `${page.scope}-save`,
      route: page.route,
      description: `Save button of the ${page.label}`,
    },
    {
      id: `${page.scope}-reset`,
      route: page.route,
      description: `Reset button of the ${page.label} (shown when edited)`,
    },
  ];
}

export const AGENT_UI_TARGETS: AgentUiTarget[] = [
  ...navTargets(),
  {
    id: "dashboard-add-widget",
    route: "/dashboard",
    description: "Button that adds a dashboard widget",
  },
  ...TOOLBAR_PAGES_WITH_ADD.flatMap((page) => toolbarTargets(page, true)),
  ...TOOLBAR_PAGES_WITHOUT_ADD.flatMap((page) => toolbarTargets(page, false)),
  ...FORM_PAGES.flatMap(formTargets),
];

export const AGENT_UI_TARGET_IDS = AGENT_UI_TARGETS.map((target) => target.id) as [string, ...string[]];
export const AGENT_NAV_TARGET_IDS = AGENT_UI_TARGETS.filter((target) => target.route.startsWith("/")).map(
  (target) => target.id,
) as [string, ...string[]];

export function findAgentUiTarget(targetId: string) {
  return AGENT_UI_TARGETS.find((target) => target.id === targetId) ?? null;
}

export function findAgentNavigationTarget(targetId: string) {
  const target = findAgentUiTarget(targetId);
  return target?.route.startsWith("/") ? target : null;
}
