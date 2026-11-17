import { isPurchasablePlanId, type PurchasablePlanId } from "@/core/commercial/plan-catalog";
import { CONNECTIONS_REDIRECTS, connectionsHref } from "@/features/connections/connection-tabs";

export type SettingsSlug =
  | "profile"
  | "workspaces"
  | "connections"
  | "channels"
  | "api-keys"
  | "general"
  | "members"
  | "roles"
  | "billing"
  | "activity"
  | "webhooks"
  | "webhook-deliveries"
  | "incoming-webhooks";

export function settingsHref(slug: SettingsSlug) {
  return `/settings/${slug}`;
}

export const BILLING_PLAN_PARAM = "plan";

export function billingHref(plan?: PurchasablePlanId) {
  return plan ? `${settingsHref("billing")}?${BILLING_PLAN_PARAM}=${plan}` : settingsHref("billing");
}

export function billingFocusPlan(value: string | string[] | undefined): PurchasablePlanId | undefined {
  return typeof value === "string" && isPurchasablePlanId(value) ? value : undefined;
}

export const SETTINGS_ENTRY_HREF = settingsHref("profile");

export const WEBHOOK_DELIVERIES_HREF = settingsHref("webhook-deliveries");

export const CONNECTIONS_HREF = settingsHref("connections");

export { CONNECTIONS_REDIRECTS, connectionsHref };

export function settingsLandingPath(path: string): string {
  const slug = /^\/settings\/([^/?#]+)/u.exec(path)?.[1];
  return slug && Object.hasOwn(CONNECTIONS_REDIRECTS, slug) ? CONNECTIONS_HREF : path;
}
