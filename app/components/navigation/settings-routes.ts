export type SettingsSlug =
  | "profile"
  | "channels"
  | "api-keys"
  | "members"
  | "roles"
  | "billing"
  | "activity"
  | "webhooks"
  | "webhook-deliveries";

export function settingsHref(slug: SettingsSlug) {
  return `/settings/${slug}`;
}

export const SETTINGS_ENTRY_HREF = settingsHref("profile");

export const WEBHOOK_DELIVERIES_HREF = settingsHref("webhook-deliveries");
