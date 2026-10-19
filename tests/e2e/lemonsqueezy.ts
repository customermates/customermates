import { createHmac } from "node:crypto";

import type { APIRequestContext, Page } from "@playwright/test";
import type {
  LemonSqueezyCustomData,
  LemonSqueezySubscriptionAttributes,
  LemonSqueezySubscriptionEventName,
  LemonSqueezySubscriptionResource,
} from "../helpers/lemonsqueezy-subscription";

import { expect } from "@playwright/test";

import {
  lemonSqueezyPaymentSuccessEvent,
  lemonSqueezyStatusFormatted,
  lemonSqueezySubscriptionAttributes,
  lemonSqueezySubscriptionEvent,
  lemonSqueezyTimestamp,
  signedCheckoutCustomData,
} from "../helpers/lemonsqueezy-subscription";
import { localE2eEnvironment } from "./local-environment";
import {
  localCheckoutOrigin,
  localLemonSqueezyStoreId,
  localLemonSqueezyVariants,
  localLemonSqueezyWebhookSecret,
  localSubscriptionResource,
  newLocalSubscriptionIds,
  readLocalCheckouts,
  readLocalSubscription,
  writeLocalSubscription,
} from "./local-lemonsqueezy-provider.mjs";

type ProviderPlan = keyof typeof localLemonSqueezyVariants;

type ProviderSubscription = {
  id: string;
  itemId: number;
  companyId: string;
  quantity: number;
  quantityUpdates?: number[];
  attributes: LemonSqueezySubscriptionAttributes;
};

type ProviderCustomer = { name: string; email: string };

type LocalCheckout = {
  id: string;
  createdAt: string;
  storeId: string;
  variantId: string;
  custom: LemonSqueezyCustomData | null;
  variantQuantities: Array<{ variant_id: number; quantity: number }>;
  productName: string | null;
  redirectUrl: string | null;
  enabledVariants: number[];
  skipTrial: boolean | null;
  expiresAt: string | null;
  url: string;
};

const PLAN_NAMES: Record<ProviderPlan, string> = { starter: "Starter", pro: "Pro", business: "Business", max: "Max" };
const SYNTHETIC_CUSTOMER: ProviderCustomer = { name: "Browser Administrator", email: "billing@example.test" };

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

export function startProviderSubscription(
  companyId: string,
  plan: ProviderPlan,
  quantity: number,
  customer: ProviderCustomer = SYNTHETIC_CUSTOMER,
  createdAt?: Date,
) {
  const { id, itemId } = newLocalSubscriptionIds();
  const subscription: ProviderSubscription = {
    id,
    itemId,
    companyId,
    quantity,
    attributes: lemonSqueezySubscriptionAttributes({
      subscriptionId: id,
      itemId,
      storeId: Number(localLemonSqueezyStoreId),
      storeOrigin: localCheckoutOrigin,
      variantId: Number(localLemonSqueezyVariants[plan]),
      variantName: PLAN_NAMES[plan],
      quantity,
      customer,
      createdAt,
    }),
  };
  writeLocalSubscription(providerDirectory(), subscription);
  return subscription;
}

export function changeProviderSubscription(
  subscriptionId: string,
  change: Partial<Pick<LemonSqueezySubscriptionAttributes, "status" | "renews_at" | "ends_at" | "trial_ends_at">> & {
    plan?: ProviderPlan;
  },
) {
  const current = providerSubscription(subscriptionId);
  const { plan, ...attributes } = change;
  const status = attributes.status ?? current.attributes.status;
  const next: ProviderSubscription = {
    ...current,
    attributes: {
      ...current.attributes,
      ...attributes,
      status_formatted: lemonSqueezyStatusFormatted(status),
      cancelled: current.attributes.cancelled || status === "cancelled",
      updated_at: lemonSqueezyTimestamp(new Date()),
      ...(plan ? { variant_id: Number(localLemonSqueezyVariants[plan]), variant_name: PLAN_NAMES[plan] } : {}),
    },
  };
  writeLocalSubscription(providerDirectory(), next);
  return next;
}

function webhookSecret() {
  return localLemonSqueezyWebhookSecret(process.env.BETTER_AUTH_SECRET);
}

export function signedCustomData(companyId: string): LemonSqueezyCustomData {
  return signedCheckoutCustomData(companyId, process.env.BETTER_AUTH_SECRET);
}

export function subscriptionWebhookBody(
  event: LemonSqueezySubscriptionEventName,
  subscription: ProviderSubscription,
  customData: LemonSqueezyCustomData | null = signedCustomData(subscription.companyId),
) {
  const resource = localSubscriptionResource(subscription) as LemonSqueezySubscriptionResource;
  return JSON.stringify(lemonSqueezySubscriptionEvent(event, resource, customData));
}

export function paymentWebhookBody(
  subscription: ProviderSubscription,
  customData: LemonSqueezyCustomData | null = signedCustomData(subscription.companyId),
) {
  return JSON.stringify(lemonSqueezyPaymentSuccessEvent(subscription.id, customData));
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

export async function deliverWebhookBody(request: APIRequestContext, body: string) {
  const response = await postSignedWebhook(request, body);
  expect(response.status(), await response.text()).toBe(200);
  expect(await response.json()).toEqual({ success: true });
  return body;
}

export async function deliverSubscriptionWebhook(
  request: APIRequestContext,
  event: LemonSqueezySubscriptionEventName,
  subscription: ProviderSubscription,
) {
  return deliverWebhookBody(request, subscriptionWebhookBody(event, subscription));
}

export async function stubCheckoutPage(page: Page) {
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
