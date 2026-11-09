import { isPurchasablePlanId, type PurchasablePlanId } from "@/core/commercial/plan-catalog";

export type SettingsSlug =
  | "profile"
  | "workspaces"
  | "channels"
  | "api-keys"
  | "general"
  | "members"
  | "roles"
  | "billing"
  | "activity"
  | "webhooks"
  | "webhook-deliveries";

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
