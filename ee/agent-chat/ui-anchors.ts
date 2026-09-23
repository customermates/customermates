import { WORKSPACE_SECTIONS, type WorkspaceSection } from "@/app/components/navigation/workspace-sections";

export type AnchorPage = {
  scope: string;
  route: string;
  label: string;
  opener?: string;
  resetOpener?: string;
  hiddenUntilDirty?: boolean;
};

export type AnchorControl = { control: string; description: string; prerequisite?: string };

export type ControlPage = { scope: string; route: string; controls: AnchorControl[] };

export const TOOLBAR_PAGES_WITH_ADD: AnchorPage[] = [
  { scope: "contacts", route: "/contacts", label: "contacts" },
  { scope: "organizations", route: "/organizations", label: "organizations" },
  { scope: "deals", route: "/deals", label: "deals" },
  { scope: "services", route: "/services", label: "services" },
  { scope: "tasks", route: "/tasks", label: "tasks" },
  { scope: "routines", route: "/routines", label: "routines" },
  { scope: "company-members", route: "/company/members", label: "team members" },
  { scope: "company-webhooks", route: "/company/webhooks", label: "webhooks" },
  { scope: "company-roles", route: "/company/roles", label: "roles" },
];

export const TOOLBAR_PAGES_WITHOUT_ADD: AnchorPage[] = [
  { scope: "company-audit-logs", route: "/company/audit-logs", label: "audit log entries" },
  { scope: "company-webhook-deliveries", route: "/company/webhook-deliveries", label: "webhook deliveries" },
];

export const FORM_PAGES: AnchorPage[] = [
  { scope: "profile-settings", route: "/profile/settings", label: "profile settings form", hiddenUntilDirty: true },
  {
    scope: "company-settings",
    route: "/company/settings",
    label: "company settings form (roles with company Manage only)",
  },
  {
    scope: "member-modal",
    route: "/company/members",
    label: "member dialog (roles with Manage only)",
    opener: "a member row",
  },
  {
    scope: "webhook-modal",
    route: "/company/webhooks",
    label: "webhook dialog (roles with API Manage only; open it first)",
    opener: "company-webhooks-add",
  },
  {
    scope: "role-modal",
    route: "/company/roles",
    label: "role dialog (roles with Manage only; disabled for the system role and your own role; open it first)",
    opener: "company-roles-add",
  },
  {
    scope: "widget-modal",
    route: "/dashboard",
    label:
      "dashboard widget dialog (open it first; a new widget shows Save after you pick its type, and Reset exists only when editing a widget)",
    opener: "dashboard-add-widget",
    resetOpener: "a widget card",
  },
  { scope: "routine-modal", route: "/routines", label: "routine dialog (open it first)", opener: "routines-add" },
];

export const CONTROL_PAGES: ControlPage[] = [
  {
    scope: "company-settings",
    route: "/company/settings",
    controls: [
      { control: "currency", description: "Company currency select for deal and service amounts" },
      {
        control: "deal-stage-field",
        description: "Deal stage field select that turns on the weighted pipeline forecast",
      },
      {
        control: "stage-weights",
        description:
          "Win probability percent per deal stage for the weighted pipeline (choose a deal stage field first; members who can read deals)",
      },
      {
        control: "total-pipeline",
        description:
          "Total pipeline value summed over all deals (shown once a deal stage field is chosen, for members who can read deals)",
      },
      {
        control: "weighted-pipeline",
        description:
          "Weighted pipeline value from the win probability per deal stage (shown once a deal stage field is chosen, for members who can read deals)",
      },
      {
        control: "data-model",
        description: "Data model section that renames contacts, organizations, deals, services and tasks",
      },
    ],
  },
  {
    scope: "terminology",
    route: "/company/settings",
    controls: [
      {
        control: "contact",
        description:
          "Data model select that renames contacts (only for roles with company Manage; others see the name as plain text)",
      },
      {
        control: "organization",
        description:
          "Data model select that renames organizations (only for roles with company Manage; others see the name as plain text)",
      },
      {
        control: "deal",
        description:
          "Data model select that renames deals (only for roles with company Manage; others see the name as plain text)",
      },
      {
        control: "service",
        description:
          "Data model select that renames services (only for roles with company Manage; others see the name as plain text)",
      },
      {
        control: "task",
        description:
          "Data model select that renames tasks (only for roles with company Manage; others see the name as plain text)",
      },
    ],
  },
  {
    scope: "company-subscription",
    route: "/company/subscription",
    controls: [
      {
        control: "manage",
        description:
          "Manage with Lemon Squeezy button: billing portal for plan, payment method, invoices, cancel (roles with company Manage and a paid subscription)",
      },
      {
        control: "refresh",
        description:
          "Refresh button that reloads the subscription status from billing (roles with company Manage; not during the trial or on Enterprise)",
      },
      {
        control: "plan-picker",
        description:
          "Plan cards (Starter, Pro, Business) that start a paid subscription (roles with company Manage, while no subscription is active)",
      },
    ],
  },
  {
    scope: "profile-settings",
    route: "/profile/settings",
    controls: [
      {
        control: "verify-email",
        description: "Top bar button that resends the email verification link (only while your email is unverified)",
      },
      { control: "first-name", description: "Your first name input" },
      { control: "last-name", description: "Your last name input" },
      { control: "country", description: "Your country select" },
      { control: "avatar-url", description: "Avatar URL input for your profile picture" },
      { control: "display-language", description: "Display language select for the app interface" },
      { control: "formatting-locale", description: "Formatting locale select for dates, numbers and currency" },
      { control: "theme", description: "Theme select for light, dark or system appearance" },
    ],
  },
  {
    scope: "member-modal",
    route: "/company/members",
    controls: [
      {
        control: "email",
        description: "Read-only email of the member in the member dialog",
        prerequisite: "a member row",
      },
      {
        control: "first-name",
        description: "First name input in the member dialog; editable for roles with Manage, read-only on your own row",
        prerequisite: "a member row",
      },
      {
        control: "last-name",
        description: "Last name input in the member dialog; editable for roles with Manage, read-only on your own row",
        prerequisite: "a member row",
      },
      {
        control: "country",
        description: "Country select in the member dialog; editable for roles with Manage, read-only on your own row",
        prerequisite: "a member row",
      },
      {
        control: "role",
        description:
          "Role select that sets the member's permissions; editable for roles with Manage, read-only on your own row",
        prerequisite: "a member row",
      },
      {
        control: "avatar-url",
        description: "Avatar URL input in the member dialog; editable for roles with Manage, read-only on your own row",
        prerequisite: "a member row",
      },
      {
        control: "status",
        description:
          "Status select that activates or deactivates the member; editable for roles with Manage, read-only on your own row",
        prerequisite: "a member row",
      },
    ],
  },
  {
    scope: "invite-modal",
    route: "/company/members",
    controls: [
      {
        control: "tab-link",
        description: "Share link tab of the invite dialog, shown when the dialog opens",
        prerequisite: "company-members-add",
      },
      {
        control: "link",
        description: "Read-only invite link on the Share link tab of the invite dialog",
        prerequisite: "company-members-add",
      },
      {
        control: "copy-link",
        description: "Button that copies the invite link on the Share link tab of the invite dialog",
        prerequisite: "company-members-add",
      },
      {
        control: "tab-email",
        description: "Send emails tab of the invite dialog for inviting members by email",
        prerequisite: "company-members-add",
      },
      {
        control: "emails",
        description: "Email addresses input of the invite dialog (open its Send emails tab first)",
        prerequisite: "invite-modal-tab-email",
      },
      {
        control: "send",
        description: "Send invitations button of the invite dialog (open its Send emails tab first)",
        prerequisite: "invite-modal-tab-email",
      },
    ],
  },
  {
    scope: "webhook-modal",
    route: "/company/webhooks",
    controls: [
      {
        control: "url",
        description: "Endpoint URL input of the webhook dialog",
        prerequisite: "company-webhooks-add",
      },
      {
        control: "description",
        description: "Description input of the webhook dialog",
        prerequisite: "company-webhooks-add",
      },
      {
        control: "events",
        description: "Events select that picks which record events the webhook sends",
        prerequisite: "company-webhooks-add",
      },
      {
        control: "secret",
        description: "Signing secret input of the webhook dialog",
        prerequisite: "company-webhooks-add",
      },
      {
        control: "headers",
        description: "Custom request headers input of the webhook dialog",
        prerequisite: "company-webhooks-add",
      },
      {
        control: "body-template",
        description: "Custom request body template input of the webhook dialog",
        prerequisite: "company-webhooks-add",
      },
      {
        control: "enabled",
        description: "Enabled checkbox that pauses or resumes the webhook",
        prerequisite: "company-webhooks-add",
      },
      {
        control: "delete",
        description: "Delete button of a saved webhook for roles with Manage",
        prerequisite: "a webhook row",
      },
    ],
  },
  {
    scope: "role-modal",
    route: "/company/roles",
    controls: [
      {
        control: "delete",
        description:
          "Delete button of a saved custom role that no member uses, for roles with Manage; not for the system role",
        prerequisite: "a role row",
      },
    ],
  },
  {
    scope: "webhook-delivery-modal",
    route: "/company/webhook-deliveries",
    controls: [
      {
        control: "resend",
        description:
          "Resend button in the webhook Event Details dialog for roles with Manage, not for pending deliveries",
        prerequisite: "a delivery row",
      },
    ],
  },
  {
    scope: "profile-api-keys",
    route: "/profile/api-keys",
    controls: [
      {
        control: "generate",
        description: "Top bar Add button that opens the API key dialog (roles with API Manage)",
      },
    ],
  },
  {
    scope: "api-key",
    route: "/profile/api-keys",
    controls: [
      {
        control: "option-standard",
        description: "Standard API key option on the first step of the API key dialog",
        prerequisite: "profile-api-keys-generate",
      },
      {
        control: "name",
        description: "Name input of a standard API key (choose the standard option first)",
        prerequisite: "api-key-option-standard",
      },
      {
        control: "expires",
        description: "Expiry date picker of a standard API key; empty means it never expires",
        prerequisite: "api-key-option-standard",
      },
      {
        control: "save",
        description: "Save button that creates the standard API key; enabled once something changed",
        prerequisite: "api-key-option-standard",
      },
      {
        control: "delete",
        description: "Delete button of a saved API key",
        prerequisite: "an API key card",
      },
    ],
  },
  {
    scope: "connected-account",
    route: "/profile/connected-accounts",
    controls: [
      {
        control: "tab-details",
        description: "Details tab with provider, status, visibility and owner",
        prerequisite: "a channel card",
      },
      {
        control: "tab-email",
        description: "Email tab for appearance and signature of an email account you connected",
        prerequisite: "a channel card",
      },
      {
        control: "tab-folders",
        description: "Folders tab that picks the synced folders shown in the inbox, for accounts with folders",
        prerequisite: "a channel card",
      },
      {
        control: "visibility",
        description:
          "Switch that shares an account you connected with the team; shared accounts need the Business plan in the cloud",
        prerequisite: "a channel card",
      },
      {
        control: "signature",
        description: "Switch that adds a signature to emails sent from an email account you connected",
        prerequisite: "connected-account-tab-email",
      },
      {
        control: "email-save",
        description: "Save button of the Email tab; enabled once something changed",
        prerequisite: "connected-account-tab-email",
      },
      {
        control: "resync",
        description:
          "Resync button in the connected account dialog for a running or connecting account you connected; needs Manage on Inbox messages",
        prerequisite: "a channel card",
      },
      {
        control: "reactivate",
        description:
          "Reactivate button that reconnects a stopped or failed account you connected; needs Manage on Inbox messages",
        prerequisite: "a channel card",
      },
      {
        control: "disconnect",
        description: "Disconnect button that removes an account you connected; needs Manage on Inbox messages",
        prerequisite: "a channel card",
      },
    ],
  },
];

export const PRIMARY_NAV_PAGES: { key: string; route: string; description: string }[] = [
  { key: "dashboard", route: "/dashboard", description: "Sidebar link to the dashboard with pipeline widgets" },
  { key: "inbox", route: "/inbox", description: "Sidebar link to the unified messaging inbox" },
  { key: "tasks", route: "/tasks", description: "Sidebar link to the tasks list" },
  { key: "contacts", route: "/contacts", description: "Sidebar link to the contacts list" },
  { key: "organizations", route: "/organizations", description: "Sidebar link to the organizations list" },
  { key: "deals", route: "/deals", description: "Sidebar link to the deals pipeline" },
  { key: "services", route: "/services", description: "Sidebar link to the services list" },
  { key: "routines", route: "/routines", description: "Sidebar link to the scheduled assistant routines" },
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

export const TRANSFERABLE_SCOPES = new Set(["contacts", "organizations", "deals", "services", "tasks"]);

export const SCOPES_WITHOUT_FILTER = new Set(["company-roles"]);

export const SCOPES_WITHOUT_SEARCH = new Set(["company-roles"]);

export const TOOLBAR_SCOPES_WITH_ADD = TOOLBAR_PAGES_WITH_ADD.map((page) => page.scope);
export const TOOLBAR_SCOPES_WITHOUT_ADD = TOOLBAR_PAGES_WITHOUT_ADD.map((page) => page.scope);
export const FORM_SCOPES = FORM_PAGES.map((page) => page.scope);

export const NAV_KEYS = [
  ...PRIMARY_NAV_PAGES.map((page) => page.key),
  ...WORKSPACE_NAV_GROUPS.flatMap((group) => [group.section, ...workspaceNavKeys(group.section)]),
  ...STATIC_NAV_PAGES.map((page) => page.key),
];
