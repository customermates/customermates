import type { LucideIcon } from "lucide-react";
import type { AppMode } from "@/core/config/environment";
import type { ShortcutId } from "./shortcut-registry";

import {
  BookOpen,
  Repeat,
  Settings,
  Contrast,
  Globe,
  Hash,
  Image as ImageIcon,
  Inbox,
  Keyboard,
  KeyRound,
  Languages,
  LayoutGrid,
  Layers,
  LogIn,
  MessageCircle,
  Moon,
  Plus,
  Settings2,
  Shield,
  Sun,
  SunMoon,
  User,
  UserPlus,
  Webhook,
  Trash2,
} from "lucide-react";

import { Action, Resource } from "@/generated/prisma";
import { SETTINGS_SECTIONS } from "@/app/components/navigation/settings-sections";
import { settingsHref } from "@/app/components/navigation/settings-routes";

export type CommandKind = "page" | "setting" | "action";

export type CommandActionId =
  | "add"
  | "shortcuts"
  | "switchView"
  | "themeLight"
  | "themeDark"
  | "themeSystem"
  | "inviteMembers"
  | "sendFeedback"
  | "signOut";

export type CommandTarget = { href: string } | { control: string } | { action: CommandActionId };

export type CommandRequirement = {
  resource?: Resource;
  action?: Action;
  cloudOnly?: boolean;
  schemaManager?: boolean;
  listPage?: boolean;
};

export type StaticCommand = {
  id: string;
  labelKey: string;
  kind: CommandKind;
  icon: LucideIcon;
  target: CommandTarget;
  parentId?: string;
  shortcut?: ShortcutId;
  requires?: CommandRequirement;
};

export type CommandEnvironment = {
  appMode: AppMode;
  canManageSchema: boolean;
  onListPage: boolean;
  can: (resource: Resource, action: Action) => boolean;
};

function profileSetting(name: string, icon: LucideIcon, control: string): StaticCommand {
  return {
    id: `setting.profile.${name}`,
    labelKey: `Common.inputs.${name}`,
    kind: "setting",
    icon,
    parentId: "settings.profile",
    target: { control: `settings-profile-${control}` },
  };
}

const SETTINGS_PAGES: StaticCommand[] = [...SETTINGS_SECTIONS.account, ...SETTINGS_SECTIONS.workspace].map(
  (subroute) => ({
    id: `settings.${subroute.slug}`,
    labelKey: subroute.labelKey,
    kind: "page",
    icon: subroute.icon,
    target: { href: settingsHref(subroute.slug) },
    requires: { resource: subroute.resource, cloudOnly: subroute.cloudOnly },
  }),
);

export const STATIC_COMMANDS: readonly StaticCommand[] = [
  {
    id: "page.dashboard",
    labelKey: "NavigationBar.dashboard",
    kind: "page",
    icon: LayoutGrid,
    target: { href: "/dashboard" },
    shortcut: "goDashboard",
  },
  {
    id: "page.inbox",
    labelKey: "NavigationBar.inbox",
    kind: "page",
    icon: Inbox,
    target: { href: "/inbox" },
    shortcut: "goInbox",
    requires: { resource: Resource.inboxMessages, cloudOnly: true },
  },
  {
    id: "page.knowledgeBase",
    labelKey: "NavigationBar.wiki",
    kind: "page",
    icon: BookOpen,
    target: { href: "/wiki" },
    shortcut: "goKnowledgeBase",
    requires: { resource: Resource.wiki },
  },
  {
    id: "page.routines",
    labelKey: "NavigationBar.routines",
    kind: "page",
    icon: Repeat,
    target: { href: "/routines" },
    shortcut: "goRoutines",
    requires: { resource: Resource.routines, cloudOnly: true },
  },
  {
    id: "page.trash",
    labelKey: "NavigationBar.trash",
    kind: "page",
    icon: Trash2,
    target: { href: "/trash" },
  },
  {
    id: "page.configure",
    labelKey: "RecordModel.configure",
    kind: "page",
    icon: Settings2,
    target: { href: "/configure" },
    shortcut: "goConfigure",
    requires: { schemaManager: true },
  },
  {
    id: "page.settings",
    labelKey: "KeyboardShortcuts.actions.goSettings",
    kind: "page",
    icon: Settings,
    target: { href: settingsHref("profile") },
    shortcut: "goSettings",
  },
  {
    id: "page.documentation",
    labelKey: "UserAvatar.documentation",
    kind: "page",
    icon: BookOpen,
    target: { href: "/docs" },
  },
  ...SETTINGS_PAGES,
  profileSetting("firstName", User, "first-name"),
  profileSetting("lastName", User, "last-name"),
  profileSetting("country", Globe, "country"),
  profileSetting("avatarUrl", ImageIcon, "avatar-url"),
  profileSetting("displayLanguage", Languages, "display-language"),
  profileSetting("formattingLocale", Hash, "formatting-locale"),
  profileSetting("theme", SunMoon, "theme"),
  {
    id: "setting.apiKeys.create",
    labelKey: "CommandPalette.labels.createApiKey",
    kind: "setting",
    icon: KeyRound,
    parentId: "settings.api-keys",
    target: { control: "settings-api-keys-generate" },
    requires: { resource: Resource.api, action: Action.create },
  },
  {
    id: "setting.webhooks.create",
    labelKey: "CommandPalette.labels.addWebhook",
    kind: "setting",
    icon: Webhook,
    parentId: "settings.webhooks",
    target: { control: "settings-webhooks-add" },
    requires: { resource: Resource.api, action: Action.create },
  },
  {
    id: "setting.roles.create",
    labelKey: "CommandPalette.labels.addRole",
    kind: "setting",
    icon: Shield,
    parentId: "settings.roles",
    target: { control: "settings-roles-add" },
    requires: { resource: Resource.users, action: Action.create },
  },
  {
    id: "setting.channels.connect",
    labelKey: "CommandPalette.labels.connectChannel",
    kind: "setting",
    icon: Inbox,
    parentId: "settings.channels",
    target: { control: "settings-channels-connect" },
    requires: { resource: Resource.inboxMessages, cloudOnly: true },
  },
  {
    id: "action.add",
    labelKey: "KeyboardShortcuts.actions.add",
    kind: "action",
    icon: Plus,
    target: { action: "add" },
    shortcut: "add",
  },
  {
    id: "action.switchView",
    labelKey: "KeyboardShortcuts.actions.switchView",
    kind: "action",
    icon: Layers,
    target: { action: "switchView" },
    shortcut: "switchView",
    requires: { listPage: true },
  },
  {
    id: "action.shortcuts",
    labelKey: "KeyboardShortcuts.title",
    kind: "action",
    icon: Keyboard,
    target: { action: "shortcuts" },
    shortcut: "shortcuts",
  },
  {
    id: "action.themeLight",
    labelKey: "CommandPalette.labels.themeLight",
    kind: "action",
    icon: Sun,
    target: { action: "themeLight" },
  },
  {
    id: "action.themeDark",
    labelKey: "CommandPalette.labels.themeDark",
    kind: "action",
    icon: Moon,
    target: { action: "themeDark" },
  },
  {
    id: "action.themeSystem",
    labelKey: "CommandPalette.labels.themeSystem",
    kind: "action",
    icon: Contrast,
    target: { action: "themeSystem" },
  },
  {
    id: "action.inviteMembers",
    labelKey: "WorkspaceMenu.inviteMembers",
    kind: "action",
    icon: UserPlus,
    target: { action: "inviteMembers" },
    requires: { resource: Resource.users, action: Action.create },
  },
  {
    id: "action.sendFeedback",
    labelKey: "UserAvatar.sendFeedback",
    kind: "action",
    icon: MessageCircle,
    target: { action: "sendFeedback" },
  },
  {
    id: "action.signOut",
    labelKey: "UserAvatar.signOut",
    kind: "action",
    icon: LogIn,
    target: { action: "signOut" },
  },
];

export function commandSynonyms(t: (key: string) => string, id: string): string[] {
  return t(`CommandPalette.synonyms.${id}`)
    .split(",")
    .map((synonym) => synonym.trim())
    .filter(Boolean);
}

export function staticCommand(id: string): StaticCommand | undefined {
  return STATIC_COMMANDS.find((entry) => entry.id === id);
}

export function commandAvailable(entry: StaticCommand, environment: CommandEnvironment): boolean {
  const requires = entry.requires;
  if (!requires) return true;
  if (requires.cloudOnly && environment.appMode === "self-hosted") return false;
  if (requires.schemaManager && !environment.canManageSchema) return false;
  if (requires.listPage && !environment.onListPage) return false;
  if (!requires.resource) return true;
  if (requires.action) return environment.can(requires.resource, requires.action);
  return environment.can(requires.resource, Action.readOwn) || environment.can(requires.resource, Action.readAll);
}
