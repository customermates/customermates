import { Resource } from "@/generated/prisma";

import { SETTINGS_SECTIONS, type SettingsSection } from "@/app/components/navigation/settings-sections";
import { type SettingsSlug, settingsHref, WEBHOOK_DELIVERIES_HREF } from "@/app/components/navigation/settings-routes";

export type AnchorPage = {
  scope: string;
  route: string;
  label: string;
  opener?: string;
};

export type FormAnchorPage = AnchorPage & {
  discard: "reset" | "cancel";
  resetOpener?: string;
  hiddenUntilDirty?: boolean;
};

export type AnchorControl = {
  control: string;
  description: string;
  prerequisite?: string;
};

export type ControlPage = {
  scope: string;
  route: string;
  controls: AnchorControl[];
};

export const TOOLBAR_PAGES_WITH_ADD: AnchorPage[] = [
  { scope: "routines", route: "/routines", label: "routines" },
  {
    scope: "settings-members",
    route: settingsHref("members"),
    label: "team members",
  },
  { scope: "settings-webhooks", route: settingsHref("webhooks"), label: "webhooks" },
  { scope: "settings-roles", route: settingsHref("roles"), label: "roles" },
];

export const TOOLBAR_PAGES_WITHOUT_ADD: AnchorPage[] = [
  {
    scope: "settings-webhooks-deliveries",
    route: WEBHOOK_DELIVERIES_HREF,
    label: "webhook deliveries",
  },
];

export const FORM_PAGES: FormAnchorPage[] = [
  {
    scope: "settings-profile",
    route: settingsHref("profile"),
    label: "profile settings form",
    hiddenUntilDirty: true,
    discard: "reset",
  },
  {
    scope: "member-modal",
    route: settingsHref("members"),
    label: "member dialog (roles with Manage only)",
    opener: "a member row",
    discard: "reset",
  },
  {
    scope: "webhook-modal",
    route: settingsHref("webhooks"),
    label: "webhook dialog (roles with API Manage only; open it first)",
    opener: "settings-webhooks-add",
    discard: "reset",
  },
  {
    scope: "role-modal",
    route: settingsHref("roles"),
    label: "role dialog (roles with Manage only; disabled for the system role and your own role; open it first)",
    opener: "settings-roles-add",
    discard: "reset",
  },
  {
    scope: "widget-modal",
    route: "/dashboard",
    label:
      "dashboard widget dialog (a new widget shows Save after you pick its type, and Reset exists only when editing a widget)",
    opener: "widget-modal-kind",
    resetOpener: "a widget card",
    discard: "reset",
  },
  {
    scope: "routine-modal",
    route: "/routines",
    label: "routine dialog (open it first)",
    opener: "routines-add",
    discard: "cancel",
  },
];

export const CONTROL_PAGES: ControlPage[] = [
  {
    scope: "widget-modal",
    route: "/dashboard",
    controls: [
      {
        control: "kind",
        description:
          "Widget type cards (chart or activity timeline) on step 1 of the add-widget dialog; picking one continues to the widget settings and their Save button",
        prerequisite: "dashboard-add-widget",
      },
    ],
  },
  {
    scope: "settings-billing",
    route: settingsHref("billing"),
    controls: [
      {
        control: "manage",
        description:
          "Manage with Lemon Squeezy button: billing portal for plan, payment method, invoices, cancel (roles with company Manage once the workspace has a Lemon Squeezy subscription; not on Enterprise)",
      },
      {
        control: "refresh",
        description:
          "Refresh button that reloads the subscription status from billing (roles with company Manage once the workspace has a Lemon Squeezy subscription; not during the trial or on Enterprise)",
      },
      {
        control: "plan-picker",
        description:
          "Plan cards (Starter, Pro, Business) that start a paid subscription (roles with company Manage, while the workspace has no Lemon Squeezy subscription yet, even if the status chip says Active; not on Enterprise)",
      },
    ],
  },
  {
    scope: "settings-profile",
    route: settingsHref("profile"),
    controls: [
      {
        control: "verify-email",
        description: "Top bar button that resends the email verification link (only while your email is unverified)",
      },
      { control: "first-name", description: "Your first name input" },
      { control: "last-name", description: "Your last name input" },
      { control: "country", description: "Your country select" },
      {
        control: "avatar-url",
        description: "Avatar URL input for your profile picture",
      },
      {
        control: "display-language",
        description: "Display language select for the app interface",
      },
      {
        control: "formatting-locale",
        description: "Formatting locale select for dates, numbers and currency",
      },
      {
        control: "theme",
        description: "Theme select for light, dark or system appearance",
      },
    ],
  },
  {
    scope: "member-modal",
    route: settingsHref("members"),
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
    route: settingsHref("members"),
    controls: [
      {
        control: "tab-link",
        description: "Share link tab of the invite dialog, shown when the dialog opens",
        prerequisite: "settings-members-add",
      },
      {
        control: "link",
        description: "Read-only invite link on the Share link tab of the invite dialog",
        prerequisite: "settings-members-add",
      },
      {
        control: "copy-link",
        description: "Button that copies the invite link on the Share link tab of the invite dialog",
        prerequisite: "settings-members-add",
      },
      {
        control: "tab-email",
        description: "Send emails tab of the invite dialog for inviting members by email",
        prerequisite: "settings-members-add",
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
    route: settingsHref("webhooks"),
    controls: [
      {
        control: "url",
        description: "Endpoint URL input of the webhook dialog",
        prerequisite: "settings-webhooks-add",
      },
      {
        control: "description",
        description: "Description input of the webhook dialog",
        prerequisite: "settings-webhooks-add",
      },
      {
        control: "events",
        description: "Events select that picks which record events the webhook sends",
        prerequisite: "settings-webhooks-add",
      },
      {
        control: "secret",
        description: "Signing secret input of the webhook dialog",
        prerequisite: "settings-webhooks-add",
      },
      {
        control: "headers",
        description: "Custom request headers input of the webhook dialog",
        prerequisite: "settings-webhooks-add",
      },
      {
        control: "body-template",
        description: "Custom request body template input of the webhook dialog",
        prerequisite: "settings-webhooks-add",
      },
      {
        control: "enabled",
        description: "Enabled checkbox that pauses or resumes the webhook",
        prerequisite: "settings-webhooks-add",
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
    route: settingsHref("roles"),
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
    route: WEBHOOK_DELIVERIES_HREF,
    controls: [
      {
        control: "resend",
        description:
          "Resend button in the webhook Event Details dialog for roles with Manage, only on Delivered or Failed deliveries (not Pending or Sending)",
        prerequisite: "a delivery row",
      },
    ],
  },
  {
    scope: "settings-api-keys",
    route: settingsHref("api-keys"),
    controls: [
      {
        control: "generate",
        description: "Top bar Add button that opens the API key dialog (roles with API Manage)",
      },
    ],
  },
  {
    scope: "api-key",
    route: settingsHref("api-keys"),
    controls: [
      {
        control: "option-standard",
        description: "Standard API key option on the first step of the API key dialog",
        prerequisite: "settings-api-keys-generate",
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
    route: settingsHref("channels"),
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

export type PrimaryNavPage = {
  key: string;
  route: string;
  description: string;
  labelKeys: string[];
  resource?: Resource;
  cloudOnly?: boolean;
};

export const PRIMARY_NAV_PAGES: PrimaryNavPage[] = [
  {
    key: "dashboard",
    route: "/dashboard",
    description: "Sidebar link to the dashboard with pipeline widgets",
    labelKeys: ["NavigationBar.dashboard"],
  },
  {
    key: "inbox",
    route: "/inbox",
    description: "Sidebar link to the unified messaging inbox",
    labelKeys: ["NavigationBar.inbox"],
    resource: Resource.inboxMessages,
    cloudOnly: true,
  },
  {
    key: "configure-records",
    route: "/configure",
    description:
      "Sidebar link to Configure, where schema managers edit lists, fields, calculations, relationships and the map of lists",
    labelKeys: ["RecordModel.configure"],
  },
  {
    key: "routines",
    route: "/routines",
    description: "Sidebar link to the scheduled assistant routines",
    labelKeys: ["NavigationBar.routines"],
    resource: Resource.routines,
    cloudOnly: true,
  },
];

export const MENU_NAV_TARGETS: {
  key: string;
  description: string;
  labelKey: string;
}[] = [
  {
    key: "workspace-menu",
    description:
      "Workspace menu on the workspace name at the top of the sidebar: Invite members, Members, Settings, Billing and, for operators, the Operator console",
    labelKey: "WorkspaceMenu.label",
  },
  {
    key: "personal-menu",
    description:
      "Personal menu on the avatar at the bottom of the sidebar: Profile & preferences, Theme, Language, Keyboard shortcuts, Documentation, Send feedback, Customize sidebar and Sign out",
    labelKey: "UserAvatar.menu",
  },
];

export const SETTINGS_NAV_DESCRIPTIONS: Record<SettingsSlug, string> = {
  profile: "Settings link to Profile & preferences: name, avatar, language, theme and email verification",
  channels: "Settings link to Channels, the connected accounts for email, LinkedIn, WhatsApp, Instagram and Telegram",
  "api-keys": "Settings link to API keys for the REST API, MCP clients and connectors",
  members: "Settings link to Members, the team members of the workspace and their roles",
  roles: "Settings link to Roles and their permissions",
  billing: "Settings link to Billing, the plan, subscription, trial status and invoices",
  activity: "Settings link to Activity, the audit log of changes in the workspace",
  webhooks: "Settings link to Webhooks, with a Deliveries tab for sent webhook deliveries",
};

export function settingsNavKeys(section: SettingsSection): string[] {
  return SETTINGS_SECTIONS[section].map((subroute) => `settings-${subroute.slug}`);
}

export const SCOPES_WITHOUT_FILTER = new Set(["settings-roles"]);

export const SCOPES_WITHOUT_SEARCH = new Set(["settings-roles"]);

export const TOOLBAR_SCOPES_WITH_ADD = TOOLBAR_PAGES_WITH_ADD.map((page) => page.scope);
export const TOOLBAR_SCOPES_WITHOUT_ADD = TOOLBAR_PAGES_WITHOUT_ADD.map((page) => page.scope);
export const FORM_SCOPES = FORM_PAGES.map((page) => page.scope);

export function formDiscardSuffix(page: FormAnchorPage) {
  return page.discard === "cancel" ? "-cancel" : "-reset";
}

export const NAV_KEYS = [
  ...PRIMARY_NAV_PAGES.map((page) => page.key),
  ...MENU_NAV_TARGETS.map((menu) => menu.key),
  ...(Object.keys(SETTINGS_SECTIONS) as SettingsSection[]).flatMap(settingsNavKeys),
];
