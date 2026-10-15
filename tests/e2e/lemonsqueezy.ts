import { createHmac } from "node:crypto";

import type { APIRequestContext, Page } from "@playwright/test";

import { expect } from "@playwright/test";

import { localE2eEnvironment } from "./local-environment";
import { expectAbortedRefreshes } from "./social-sign-in";
import {
  localCheckoutOrigin,
  localLemonSqueezyVariants,
  localLemonSqueezyWebhookSecret,
  newLocalSubscriptionIds,
  readLocalCheckouts,
  readLocalSubscription,
  writeLocalSubscription,
} from "./local-lemonsqueezy-provider.mjs";

export type ProviderSubscriptionStatus =
  | "on_trial"
  | "active"
  | "paused"
  | "past_due"
  | "unpaid"
  | "cancelled"
  | "expired";
export type ProviderPlan = keyof typeof localLemonSqueezyVariants;

export type ProviderSubscription = {
  id: string;
  itemId: number;
  companyId: string;
  quantity: number;
  quantityUpdates?: number[];
  attributes: {
    status: ProviderSubscriptionStatus;
    variant_id: number;
    renews_at: string | null;
    ends_at: string | null;
    trial_ends_at: string | null;
    urls: { customer_portal: string };
  };
};

export type LocalCheckout = {
  id: string;
  createdAt: string;
  storeId: string;
  variantId: string;
  custom: { company_id?: string } | null;
  variantQuantities: Array<{ variant_id: number; quantity: number }>;
  redirectUrl: string | null;
  enabledVariants: number[];
  skipTrial: boolean | null;
  url: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function providerDirectory() {
  return localE2eEnvironment().providerDirectory;
}

export function checkoutsFor(companyId: string): LocalCheckout[] {
  return (readLocalCheckouts(providerDirectory()) as LocalCheckout[]).filter(
    (checkout) => checkout.custom?.company_id === companyId,
  );
}

export function providerSubscription(subscriptionId: string): ProviderSubscription {
  const stored = readLocalSubscription(providerDirectory(), subscriptionId) as ProviderSubscription | null;
  if (!stored) throw new Error(`The local provider has no subscription ${subscriptionId}`);
  return stored;
}

export function startProviderSubscription(companyId: string, plan: ProviderPlan, quantity: number) {
  const { id, itemId } = newLocalSubscriptionIds();
  const subscription: ProviderSubscription = {
    id,
    itemId,
    companyId,
    quantity,
    attributes: {
      status: "active",
      variant_id: Number(localLemonSqueezyVariants[plan]),
      renews_at: new Date(Date.now() + 30 * DAY_MS).toISOString(),
      ends_at: null,
      trial_ends_at: null,
      urls: { customer_portal: `${localCheckoutOrigin}/billing?subscription=${id}` },
    },
  };
  writeLocalSubscription(providerDirectory(), subscription);
  return subscription;
}

export function changeProviderSubscription(
  subscriptionId: string,
  change: Partial<ProviderSubscription["attributes"]> & { plan?: ProviderPlan },
) {
  const current = providerSubscription(subscriptionId);
  const { plan, ...attributes } = change;
  const next: ProviderSubscription = {
    ...current,
    attributes: {
      ...current.attributes,
      ...attributes,
      ...(plan ? { variant_id: Number(localLemonSqueezyVariants[plan]) } : {}),
    },
  };
  writeLocalSubscription(providerDirectory(), next);
  return next;
}

export function webhookSecret() {
  return localLemonSqueezyWebhookSecret(process.env.BETTER_AUTH_SECRET);
}

export function subscriptionWebhookBody(
  event: "subscription_created" | "subscription_updated" | "subscription_expired" | "subscription_payment_success",
  subscription: ProviderSubscription,
) {
  return JSON.stringify({
    meta: { event_name: event, test_mode: true, custom_data: { company_id: subscription.companyId } },
    data: {
      type: "subscriptions",
      id: subscription.id,
      attributes: {
        ...subscription.attributes,
        first_subscription_item: {
          id: subscription.itemId,
          subscription_id: Number(subscription.id),
          quantity: subscription.quantity,
        },
      },
    },
  });
}

export async function postSignedWebhook(request: APIRequestContext, body: string, secret = webhookSecret()) {
  return request.post("/api/webhooks/lemonsqueezy", {
    data: body,
    headers: {
      "content-type": "application/json",
      "x-event-name": (JSON.parse(body) as { meta: { event_name: string } }).meta.event_name,
      "x-signature": createHmac("sha256", secret).update(body).digest("hex"),
    },
  });
}

export async function deliverSubscriptionWebhook(
  request: APIRequestContext,
  event: Parameters<typeof subscriptionWebhookBody>[0],
  subscription: ProviderSubscription,
) {
  const response = await postSignedWebhook(request, subscriptionWebhookBody(event, subscription));
  expect(response.status(), await response.text()).toBe(200);
  expect(await response.json()).toEqual({ success: true });
}

export async function stubCheckoutPage(page: Page, navigations = 1) {
  expectAbortedRefreshes(page, navigations);
  const visited: string[] = [];
  await page.route(`${localCheckoutOrigin}/**`, async (route) => {
    visited.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: '<!doctype html><html lang="en"><head><title>Lemon Squeezy checkout</title></head><body><h1>Local checkout stub</h1></body></html>',
    });
  });
  return visited;
}
