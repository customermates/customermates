import { createHmac, randomInt, randomUUID } from "node:crypto";

import { signCheckoutWorkspace } from "@/ee/subscription/checkout-workspace-signature";

export type LemonSqueezySubscriptionStatus =
  | "on_trial"
  | "active"
  | "paused"
  | "past_due"
  | "unpaid"
  | "cancelled"
  | "expired";

export type LemonSqueezySubscriptionEventName =
  | "subscription_created"
  | "subscription_updated"
  | "subscription_cancelled"
  | "subscription_expired"
  | "subscription_payment_success";

export type LemonSqueezySubscriptionAttributes = {
  status: LemonSqueezySubscriptionStatus;
  ends_at: string | null;
  order_id: number;
  store_id: number;
  cancelled: boolean;
  renews_at: string | null;
  test_mode: boolean;
  user_name: string;
  card_brand: string | null;
  created_at: string;
  product_id: number;
  updated_at: string;
  user_email: string;
  variant_id: number;
  customer_id: number;
  product_name: string;
  variant_name: string;
  order_item_id: number;
  trial_ends_at: string | null;
  billing_anchor: number;
  card_last_four: string | null;
  status_formatted: string;
  payment_processor: string;
  first_subscription_item: {
    id: number;
    price_id: number;
    quantity: number;
    subscription_id: number;
    is_usage_based: boolean;
  };
  urls: {
    customer_portal: string;
    update_payment_method: string;
    customer_portal_update_subscription: string;
  };
  pause: null;
};

export type LemonSqueezySubscriptionResource = {
  type: "subscriptions";
  id: string;
  attributes: LemonSqueezySubscriptionAttributes;
};

const STATUS_FORMATTED: Record<LemonSqueezySubscriptionStatus, string> = {
  on_trial: "On Trial",
  active: "Active",
  paused: "Paused",
  past_due: "Past due",
  unpaid: "Unpaid",
  cancelled: "Cancelled",
  expired: "Expired",
};

const SYNTHETIC_URL_KEY = "synthetic-lemonsqueezy-urls";

export function lemonSqueezyStatusFormatted(status: LemonSqueezySubscriptionStatus) {
  return STATUS_FORMATTED[status];
}

export function lemonSqueezyTimestamp(date: Date) {
  return `${date.toISOString().slice(0, 19)}.000000Z`;
}

function syntheticId() {
  return randomInt(100_000_000, 999_999_999);
}

function signedStoreUrl(storeOrigin: string, path: string, expires: number) {
  const url = new URL(path, storeOrigin);
  url.searchParams.set("expires", String(expires));
  url.searchParams.set("signature", createHmac("sha256", SYNTHETIC_URL_KEY).update(url.href).digest("hex"));
  return url.href;
}

export function lemonSqueezySubscriptionAttributes(input: {
  subscriptionId: string;
  itemId: number;
  storeId: number;
  storeOrigin: string;
  variantId: number;
  variantName: string;
  quantity: number;
  customer: { name: string; email: string };
  createdAt?: Date;
}): LemonSqueezySubscriptionAttributes {
  const createdAt = new Date(Math.floor((input.createdAt ?? new Date()).getTime() / 1000) * 1000);
  const renewsAt = new Date(createdAt);
  renewsAt.setUTCMonth(renewsAt.getUTCMonth() + 1);
  const expires = Math.floor(createdAt.getTime() / 1000) + 3 * 24 * 60 * 60;
  return {
    status: "active",
    ends_at: null,
    order_id: syntheticId(),
    store_id: input.storeId,
    cancelled: false,
    renews_at: lemonSqueezyTimestamp(renewsAt),
    test_mode: true,
    user_name: input.customer.name,
    card_brand: "visa",
    created_at: lemonSqueezyTimestamp(createdAt),
    product_id: syntheticId(),
    updated_at: lemonSqueezyTimestamp(createdAt),
    user_email: input.customer.email,
    variant_id: input.variantId,
    customer_id: syntheticId(),
    product_name: "Customermates Subscription",
    variant_name: input.variantName,
    order_item_id: syntheticId(),
    trial_ends_at: null,
    billing_anchor: createdAt.getUTCDate(),
    card_last_four: "4242",
    status_formatted: lemonSqueezyStatusFormatted("active"),
    payment_processor: "stripe",
    first_subscription_item: {
      id: input.itemId,
      price_id: syntheticId(),
      quantity: input.quantity,
      subscription_id: Number(input.subscriptionId),
      is_usage_based: false,
    },
    urls: {
      customer_portal: signedStoreUrl(input.storeOrigin, "/billing", expires),
      update_payment_method: signedStoreUrl(
        input.storeOrigin,
        `/subscription/${input.subscriptionId}/payment-details`,
        expires,
      ),
      customer_portal_update_subscription: signedStoreUrl(
        input.storeOrigin,
        `/billing/${input.subscriptionId}/update`,
        expires,
      ),
    },
    pause: null,
  };
}

export type LemonSqueezyCustomData = Record<string, string>;

export function signedCheckoutCustomData(companyId: string, authSecret: string | undefined): LemonSqueezyCustomData {
  return { company_id: companyId, company_signature: signCheckoutWorkspace(companyId, authSecret) };
}

export function lemonSqueezySubscriptionEvent(
  eventName: LemonSqueezySubscriptionEventName,
  resource: LemonSqueezySubscriptionResource,
  customData: LemonSqueezyCustomData | null,
) {
  return {
    data: resource,
    meta: {
      test_mode: true,
      event_name: eventName,
      webhook_id: randomUUID(),
      ...(customData ? { custom_data: customData } : {}),
    },
  };
}

export function lemonSqueezyPaymentSuccessEvent(
  subscriptionId: string,
  customData: LemonSqueezyCustomData | null,
  billingReason: "initial" | "renewal" = "renewal",
) {
  const now = lemonSqueezyTimestamp(new Date());
  return {
    data: {
      type: "subscription-invoices",
      id: String(syntheticId()),
      attributes: {
        store_id: syntheticId(),
        subscription_id: Number(subscriptionId),
        customer_id: syntheticId(),
        user_name: "Synthetic Payer",
        user_email: "payer@example.invalid",
        billing_reason: billingReason,
        card_brand: "visa",
        card_last_four: "4242",
        currency: "EUR",
        status: "paid",
        status_formatted: "Paid",
        refunded: false,
        refunded_at: null,
        subtotal: 2900,
        discount_total: 0,
        tax: 0,
        total: 2900,
        created_at: now,
        updated_at: now,
        test_mode: true,
      },
    },
    meta: {
      test_mode: true,
      event_name: "subscription_payment_success",
      webhook_id: randomUUID(),
      ...(customData ? { custom_data: customData } : {}),
    },
  };
}
