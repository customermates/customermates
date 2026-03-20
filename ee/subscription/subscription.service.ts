import { createHmac } from "crypto";

import {
  createCheckout,
  getSubscription,
  lemonSqueezySetup,
  listSubscriptionItems,
  updateSubscriptionItem,
} from "@lemonsqueezy/lemonsqueezy.js";
import { CountryCode, SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

import { TenantAgnostic } from "@/core/decorators/tenant-agnostic.decorator";

export abstract class SubscriptionRepo {
  abstract upsertSubscription(data: {
    companyId: string;
    lemonSqueezyId?: string;
    lemonSqueezyVariantId?: string;
    plan?: SubscriptionPlan;
    status?: SubscriptionStatus;
    quantity?: number;
    trialEndDate?: Date;
    currentPeriodEnd?: Date;
  }): Promise<void>;
}

@TenantAgnostic
export class SubscriptionService {
  private isConfigured = false;

  constructor(private subscriptionRepo: SubscriptionRepo) {
    const apiKey = process.env.LEMONSQUEEZY_API_KEY;
    if (apiKey) {
      lemonSqueezySetup({ apiKey });
      this.isConfigured = true;
    }
  }

  async createCheckout(options: {
    email?: string;
    name?: string;
    country?: CountryCode;
    zip?: string;
    taxNumber?: string;
    custom?: Record<string, unknown>;
    redirectUrl?: string;
    quantity: number;
  }) {
    this.ensureConfigured();

    const monthlyVariantId = process.env.LEMONSQUEEZY_VARIANT_ID_PRO_MONTHLY;
    const yearlyVariantId = process.env.LEMONSQUEEZY_VARIANT_ID_PRO_YEARLY;
    const storeId = process.env.LEMONSQUEEZY_STORE_ID;

    if (!storeId) throw new Error("LEMONSQUEEZY_STORE_ID is not configured");
    if (!monthlyVariantId || !yearlyVariantId)
      throw new Error("LEMONSQUEEZY_VARIANT_ID_PRO_MONTHLY or LEMONSQUEEZY_VARIANT_ID_PRO_YEARLY is not configured");

    const result = await createCheckout(storeId, yearlyVariantId, {
      checkoutData: {
        email: options.email,
        name: options.name,
        billingAddress: {
          country: options.country?.toUpperCase() as any,
          zip: options.zip,
        },
        taxNumber: options.taxNumber,
        custom: options.custom,
        variantQuantities: [
          { variantId: Number(monthlyVariantId), quantity: options.quantity },
          { variantId: Number(yearlyVariantId), quantity: options.quantity },
        ],
      },
      productOptions: {
        redirectUrl: options.redirectUrl,
      },
    });

    if (result.error) throw new Error(result.error.message || "Failed to create checkout");

    return result.data;
  }

  async getSubscriptionOrThrow(subscriptionId: string) {
    this.ensureConfigured();

    const result = await getSubscription(subscriptionId);

    if (result.error) throw new Error(result.error.message || "Failed to get subscription");

    return result.data;
  }

  verifyWebhookSignatureOrThrow(body: string, signature: string): boolean {
    const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;

    if (!secret) throw new Error("LEMONSQUEEZY_WEBHOOK_SECRET is not configured");

    const hmac = createHmac("sha256", secret);
    hmac.update(body);
    const calculatedSignature = hmac.digest("hex");

    return calculatedSignature === signature;
  }

  async updateSubscriptionOrThrow(subscriptionId: string, companyId: string): Promise<void> {
    this.ensureConfigured();

    const subscription = await this.getSubscriptionOrThrow(subscriptionId);

    const attributes = subscription.data.attributes;
    const status = this.mapLemonSqueezyStatusToSubscriptionStatus(attributes.status);
    const renewsAt = attributes.renews_at ? new Date(attributes.renews_at) : undefined;
    const endsAt = attributes.ends_at ? new Date(attributes.ends_at) : undefined;
    const trialEndsAt = attributes.trial_ends_at ? new Date(attributes.trial_ends_at) : undefined;
    const quantity = attributes.first_subscription_item?.quantity;
    const variantId = attributes.variant_id?.toString();
    const basicVariantIds = [
      process.env.LEMONSQUEEZY_VARIANT_ID_BASIC_MONTHLY,
      process.env.LEMONSQUEEZY_VARIANT_ID_BASIC_YEARLY,
    ].filter((value): value is string => Boolean(value));
    const plan = variantId && basicVariantIds.includes(variantId) ? SubscriptionPlan.basic : SubscriptionPlan.pro;

    await this.subscriptionRepo.upsertSubscription({
      companyId,
      lemonSqueezyId: subscription.data.id,
      lemonSqueezyVariantId: variantId,
      plan,
      status,
      quantity,
      trialEndDate: trialEndsAt,
      currentPeriodEnd: renewsAt || endsAt,
    });
  }

  async updateSubscriptionQuantityOrThrow(subscriptionId: string, variantId: string, quantity: number): Promise<void> {
    this.ensureConfigured();

    const subscriptionItemsResult = await listSubscriptionItems({
      filter: { subscriptionId },
    });

    if (subscriptionItemsResult.error)
      throw new Error(subscriptionItemsResult.error.message || "Failed to list subscription items");

    const items = subscriptionItemsResult.data?.data;

    if (!items || items.length === 0) throw new Error("No subscription items found");

    const subscriptionItem = items[0];

    const updateResult = await updateSubscriptionItem(subscriptionItem.id, {
      quantity,
    });

    if (updateResult.error) throw new Error(updateResult.error.message || "Failed to update subscription quantity");
  }

  private mapLemonSqueezyStatusToSubscriptionStatus(lemonSqueezyStatus: string): SubscriptionStatus {
    switch (lemonSqueezyStatus) {
      case "active":
        return SubscriptionStatus.active;
      case "on_trial":
        return SubscriptionStatus.trial;
      case "cancelled":
        return SubscriptionStatus.cancelled;
      case "expired":
        return SubscriptionStatus.expired;
      case "past_due":
        return SubscriptionStatus.pastDue;
      case "unpaid":
        return SubscriptionStatus.unPaid;
      default:
        return SubscriptionStatus.trial;
    }
  }

  private ensureConfigured(): void {
    if (!this.isConfigured) throw new Error("LEMONSQUEEZY_API_KEY is not configured");
  }
}
