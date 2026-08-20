import { WORKSPACE_SECTIONS, type WorkspaceSection } from "@/app/components/navigation/workspace-sections";

export type AnchorPage = { scope: string; route: string; label: string };

export const TOOLBAR_PAGES_WITH_ADD: AnchorPage[] = [
  { scope: "contacts", route: "/contacts", label: "contacts" },
  { scope: "organizations", route: "/organizations", label: "organizations" },
  { scope: "deals", route: "/deals", label: "deals" },
  { scope: "services", route: "/services", label: "services" },
  { scope: "tasks", route: "/tasks", label: "tasks" },
  { scope: "company-members", route: "/company/members", label: "team members" },
  { scope: "company-webhooks", route: "/company/webhooks", label: "webhooks" },
  { scope: "company-roles", route: "/company/roles", label: "roles" },
];

export const TOOLBAR_PAGES_WITHOUT_ADD: AnchorPage[] = [
  { scope: "company-audit-logs", route: "/company/audit-logs", label: "audit log entries" },
  { scope: "company-webhook-deliveries", route: "/company/webhook-deliveries", label: "webhook deliveries" },
];

export const FORM_PAGES: AnchorPage[] = [
  { scope: "profile-settings", route: "/profile/settings", label: "profile settings form" },
  { scope: "company-settings", route: "/company/settings", label: "company settings form" },
  { scope: "member-modal", route: "/company/members", label: "member dialog (open it first)" },
  { scope: "webhook-modal", route: "/company/webhooks", label: "webhook dialog (open it first)" },
  { scope: "widget-modal", route: "/dashboard", label: "dashboard widget dialog (open it first)" },
];

export const PRIMARY_NAV_PAGES: { key: string; route: string; description: string }[] = [
  { key: "dashboard", route: "/dashboard", description: "Sidebar link to the dashboard with pipeline widgets" },
  { key: "inbox", route: "/inbox", description: "Sidebar link to the unified messaging inbox" },
  { key: "tasks", route: "/tasks", description: "Sidebar link to the tasks list" },
  { key: "contacts", route: "/contacts", description: "Sidebar link to the contacts list" },
  { key: "organizations", route: "/organizations", description: "Sidebar link to the organizations list" },
  { key: "deals", route: "/deals", description: "Sidebar link to the deals pipeline" },
  { key: "services", route: "/services", description: "Sidebar link to the services list" },
];

export const WORKSPACE_NAV_GROUPS: { section: WorkspaceSection; route: string; description: string }[] = [
  { section: "profile", route: "/profile/settings", description: "Sidebar group for personal settings" },
  { section: "company", route: "/company/settings", description: "Sidebar group for company settings (admin)" },
];

export const STATIC_NAV_PAGES: { key: string; route: string; description: string }[] = [
  { key: "documentation", route: "*", description: "Sidebar link that opens the product documentation" },
  { key: "feedback", route: "*", description: "Sidebar link that opens the feedback dialog" },
];

export function workspaceNavKeys(section: WorkspaceSection): string[] {
  return WORKSPACE_SECTIONS[section].map((subroute) => `${section}-${subroute.slug}`);
}

export const TOOLBAR_SCOPES_WITH_ADD = TOOLBAR_PAGES_WITH_ADD.map((page) => page.scope);
export const TOOLBAR_SCOPES_WITHOUT_ADD = TOOLBAR_PAGES_WITHOUT_ADD.map((page) => page.scope);
export const FORM_SCOPES = FORM_PAGES.map((page) => page.scope);

export const NAV_KEYS = [
  ...PRIMARY_NAV_PAGES.map((page) => page.key),
  ...WORKSPACE_NAV_GROUPS.flatMap((group) => [group.section, ...workspaceNavKeys(group.section)]),
  ...STATIC_NAV_PAGES.map((page) => page.key),
];
