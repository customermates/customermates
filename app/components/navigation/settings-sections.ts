import type { LucideIcon } from "lucide-react";

import { CreditCard, History, KeyRound, Mail, Shield, UserCircle, Users, Webhook } from "lucide-react";

import { Resource } from "@/generated/prisma";

import type { SettingsSlug } from "./settings-routes";
import type { AppMode } from "@/core/config/environment";

export type SettingsSection = "account" | "workspace";

export type SettingsSubroute = {
  slug: SettingsSlug;
  labelKey: string;
  icon: LucideIcon;
  resource?: Resource;
  cloudOnly?: boolean;
};

export const SETTINGS_SECTIONS: Record<SettingsSection, SettingsSubroute[]> = {
  account: [
    { slug: "profile", icon: UserCircle, labelKey: "SettingsNav.profile" },
    {
      slug: "channels",
      icon: Mail,
      labelKey: "SettingsNav.channels",
      resource: Resource.inboxMessages,
      cloudOnly: true,
    },
    { slug: "api-keys", icon: KeyRound, labelKey: "SettingsNav.apiKeys", resource: Resource.api },
  ],
  workspace: [
    { slug: "members", icon: Users, labelKey: "SettingsNav.members", resource: Resource.users },
    { slug: "roles", icon: Shield, labelKey: "SettingsNav.roles", resource: Resource.users },
    { slug: "plan", icon: CreditCard, labelKey: "SettingsNav.plan", resource: Resource.company, cloudOnly: true },
    { slug: "activity", icon: History, labelKey: "SettingsNav.activity", resource: Resource.auditLog },
    { slug: "webhooks", icon: Webhook, labelKey: "SettingsNav.webhooks", resource: Resource.api },
  ],
};

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
