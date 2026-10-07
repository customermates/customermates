export type SettingsSlug = "profile" | "channels" | "api-keys" | "members" | "roles" | "plan" | "activity" | "webhooks";

export function settingsHref(slug: SettingsSlug) {
  return `/settings/${slug}`;
}

export const SETTINGS_ENTRY_HREF = settingsHref("profile");

export const WEBHOOK_DELIVERIES_HREF = `${settingsHref("webhooks")}/deliveries`;
