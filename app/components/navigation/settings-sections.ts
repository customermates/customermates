import type { LucideIcon } from "lucide-react";

import {
  Bot,
  Building2,
  CreditCard,
  Download,
  History,
  KeyRound,
  Mail,
  Plug,
  Send,
  Shield,
  SlidersHorizontal,
  UserCircle,
  Users,
  Webhook,
} from "lucide-react";

import { Resource } from "@/generated/prisma";

import type { SettingsSlug } from "./settings-routes";
import type { AppMode } from "@/core/config/environment";
import type { ConnectionsRedirectSlug } from "@/features/connections/connection-tabs";

export type SettingsSection = "account" | "workspace";

type SettingsSubroute = {
  slug: Exclude<SettingsSlug, ConnectionsRedirectSlug>;
  labelKey: string;
  icon: LucideIcon;
  resource?: Resource;
  cloudOnly?: boolean;
};

export const SETTINGS_SECTIONS: Record<SettingsSection, SettingsSubroute[]> = {
  account: [
    { slug: "profile", icon: UserCircle, labelKey: "SettingsNav.profile" },
    { slug: "workspaces", icon: Building2, labelKey: "SettingsNav.workspaces" },
  ],
  workspace: [
    { slug: "general", icon: SlidersHorizontal, labelKey: "SettingsNav.general" },
    { slug: "members", icon: Users, labelKey: "SettingsNav.members", resource: Resource.users },
    { slug: "roles", icon: Shield, labelKey: "SettingsNav.roles", resource: Resource.users },
    { slug: "billing", icon: CreditCard, labelKey: "SettingsNav.billing", resource: Resource.company, cloudOnly: true },
    { slug: "activity", icon: History, labelKey: "SettingsNav.activity", resource: Resource.activityLog },
    { slug: "connections", icon: Plug, labelKey: "SettingsNav.connections" },
  ],
};

type RedirectedSettings = { labelKey: string; icon: LucideIcon; resource: Resource; cloudOnly: boolean };

export const REDIRECTED_SETTINGS: Record<ConnectionsRedirectSlug, RedirectedSettings> = {
  channels: { labelKey: "SettingsNav.channels", icon: Mail, resource: Resource.inboxMessages, cloudOnly: true },
  "api-keys": { labelKey: "SettingsNav.apiKeys", icon: KeyRound, resource: Resource.api, cloudOnly: false },
  webhooks: { labelKey: "SettingsNav.webhooks", icon: Webhook, resource: Resource.api, cloudOnly: false },
  "webhook-deliveries": { labelKey: "SettingsNav.deliveries", icon: Send, resource: Resource.api, cloudOnly: false },
  "incoming-webhooks": {
    labelKey: "SettingsNav.incomingWebhooks",
    icon: Download,
    resource: Resource.api,
    cloudOnly: false,
  },
};

export function redirectedSettingsOf(slug: string | undefined): RedirectedSettings | null {
  return slug !== undefined && Object.hasOwn(REDIRECTED_SETTINGS, slug)
    ? REDIRECTED_SETTINGS[slug as ConnectionsRedirectSlug]
    : null;
}

export function settingsSectionOf(slug: string): SettingsSection | null {
  return (
    (Object.keys(SETTINGS_SECTIONS) as SettingsSection[]).find((section) =>
      SETTINGS_SECTIONS[section].some((subroute) => subroute.slug === slug),
    ) ?? null
  );
}

export function visibleSubroutes(
  section: SettingsSection,
  appMode: AppMode,
  canAccess: (resource: Resource) => boolean,
): SettingsSubroute[] {
  return SETTINGS_SECTIONS[section].filter(
    (subroute) =>
      (appMode !== "self-hosted" || !subroute.cloudOnly) && (!subroute.resource || canAccess(subroute.resource)),
  );
}
