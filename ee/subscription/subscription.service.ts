import {
  createCheckout,
  getSubscription,
  lemonSqueezySetup,
  listSubscriptionItems,
  updateSubscriptionItem,
} from "@lemonsqueezy/lemonsqueezy.js";
import { SubscriptionStatus, SubscriptionPlan } from "@/generated/prisma";

import type { Subscription } from "@/generated/prisma";

import { z } from "zod";

import { env } from "@/env";

export function variantToPlan(variantId: string): SubscriptionPlan | null {
  if (variantId === env.LEMONSQUEEZY_VARIANT_ID_STARTER) return SubscriptionPlan.starter;
  if (variantId === env.LEMONSQUEEZY_VARIANT_ID_BUSINESS) return SubscriptionPlan.business;
  if (variantId === env.LEMONSQUEEZY_VARIANT_ID_PRO) return SubscriptionPlan.pro;
  return null;
}

export function planToVariant(plan: SubscriptionPlan): string {
  const variantId = {
    [SubscriptionPlan.starter]: env.LEMONSQUEEZY_VARIANT_ID_STARTER,
    [SubscriptionPlan.pro]: env.LEMONSQUEEZY_VARIANT_ID_PRO,
    [SubscriptionPlan.business]: env.LEMONSQUEEZY_VARIANT_ID_BUSINESS,
    [SubscriptionPlan.enterprise]: undefined,
  }[plan];

  if (!variantId) throw new Error(`No LemonSqueezy variant configured for plan ${plan}`);

  return variantId;
}

export abstract class SubscriptionRepo {
  abstract getSubscriptionOrThrowUnscoped(companyId: string): Promise<Subscription>;

  abstract upsertSubscriptionUnscoped(data: {
    companyId: string;
    lemonSqueezyId?: string;
    lemonSqueezyVariantId?: string;
    status?: SubscriptionStatus;
    plan?: SubscriptionPlan;
    quantity?: number;
    trialEndDate?: Date;
    currentPeriodEnd?: Date;
  }): Promise<void>;

  abstract findCompanyIdBySubscriptionIdOrThrowUnscoped(subscriptionId: string): Promise<string>;
}

export class SubscriptionService {
  private isConfigured = false;

  constructor(private subscriptionRepo: SubscriptionRepo) {
    if (env.LEMONSQUEEZY_API_KEY) {
      lemonSqueezySetup({ apiKey: env.LEMONSQUEEZY_API_KEY });
      this.isConfigured = true;
    }
  }

  async createCheckoutOrThrow(options: {
    variantId: string;
    quantity: number;
    custom?: Record<string, unknown>;
    redirectUrl?: string;
  }) {
    this.ensureConfigured();

    const storeId = env.LEMONSQUEEZY_STORE_ID;
    if (!storeId) throw new Error("LEMONSQUEEZY_STORE_ID is not configured");

    const result = await createCheckout(storeId, options.variantId, {
      checkoutData: {
        custom: options.custom,
        variantQuantities: [{ variantId: Number(options.variantId), quantity: options.quantity }],
      },
      productOptions: {
        redirectUrl: options.redirectUrl,
      },
    });

    if (result.error) throw new Error(result.error.message || "Failed to create checkout");

    return z
      .looseObject({ data: z.looseObject({ attributes: z.looseObject({ url: z.string().min(1) }) }) })
      .parse(result.data);
  }

  async getSubscriptionOrThrowUnscoped(subscriptionId: string) {
    this.ensureConfigured();

    const result = await getSubscription(subscriptionId);

    if (result.error) throw new Error(result.error.message || "Failed to get subscription");

    return z
      .looseObject({
        data: z.looseObject({
          id: z.string().min(1),
          attributes: z.looseObject({
            status: z.enum(["on_trial", "active", "paused", "past_due", "unpaid", "cancelled", "expired"]),
            renews_at: z.string().nullish(),
            ends_at: z.string().nullish(),
            trial_ends_at: z.string().nullish(),
            variant_id: z.number().nullish(),
            first_subscription_item: z.looseObject({ quantity: z.number().nullish() }).nullish(),
            urls: z.looseObject({ customer_portal: z.string().nullish() }).nullish(),
          }),
        }),
      })
      .parse(result.data);
  }

  async updateSubscriptionOrThrow(
    subscriptionId: string,
    companyId?: string,
  ): Promise<{ companyId: string; changedPlan: SubscriptionPlan | null }> {
    this.ensureConfigured();

    const resolvedCompanyId =
      companyId ?? (await this.subscriptionRepo.findCompanyIdBySubscriptionIdOrThrowUnscoped(subscriptionId));

    const subscription = await this.getSubscriptionOrThrowUnscoped(subscriptionId);

    const attributes = subscription.data.attributes;
    const status = this.mapLemonSqueezyStatusToSubscriptionStatus(attributes.status);
    const renewsAt = attributes.renews_at ? new Date(attributes.renews_at) : undefined;
    const endsAt = attributes.ends_at ? new Date(attributes.ends_at) : undefined;
    const trialEndsAt = attributes.trial_ends_at ? new Date(attributes.trial_ends_at) : undefined;
    const quantity = attributes.first_subscription_item?.quantity ?? undefined;
    const variantId = attributes.variant_id?.toString();

    const existing = await this.subscriptionRepo.getSubscriptionOrThrowUnscoped(resolvedCompanyId);
    const syncedPlan = variantId ? variantToPlan(variantId) : null;

    await this.subscriptionRepo.upsertSubscriptionUnscoped({
      companyId: resolvedCompanyId,
      lemonSqueezyId: subscription.data.id,
      lemonSqueezyVariantId: variantId,
      status,
      plan: syncedPlan ?? existing.plan,
      quantity,
      trialEndDate: trialEndsAt,
      currentPeriodEnd: renewsAt || endsAt,
    });

    return {
      companyId: resolvedCompanyId,
      changedPlan: syncedPlan !== null && syncedPlan !== existing.plan ? syncedPlan : null,
    };
  }

  async updateSubscriptionQuantityOrThrow(subscriptionId: string, quantity: number): Promise<void> {
    this.ensureConfigured();

    const subscriptionItemsResult = await listSubscriptionItems({
      filter: { subscriptionId },
    });

    if (subscriptionItemsResult.error)
      throw new Error(subscriptionItemsResult.error.message || "Failed to list subscription items");

    const items = z
      .looseObject({ data: z.array(z.looseObject({ id: z.union([z.number(), z.string()]) })) })
      .parse(subscriptionItemsResult.data).data;

    if (items.length === 0) throw new Error("No subscription items found");

    const subscriptionItem = items[0];

    const updateResult = await updateSubscriptionItem(subscriptionItem.id, { quantity });

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
