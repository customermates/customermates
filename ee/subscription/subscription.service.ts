import {
  createCheckout,
  getSubscription,
  lemonSqueezySetup,
  listSubscriptionItems,
  updateSubscriptionItem,
} from "@lemonsqueezy/lemonsqueezy.js";
import { SubscriptionStatus } from "@/generated/prisma";

import type { Subscription, SubscriptionPlan } from "@/generated/prisma";

import { z } from "zod";

import { env } from "@/env";
import { CLOUD_TRIAL, type CommercialOffer } from "@/core/commercial/plan-catalog";

import { offerToVariant, variantToOffer } from "./lemon-squeezy-bindings";
import { verifyCheckoutReservation } from "./checkout-reservation";
import { isSubscriptionUsable } from "./entitlements";

export abstract class SubscriptionRepo {
  abstract getSubscriptionOrThrowUnscoped(companyId: string): Promise<Subscription>;

  abstract upsertSubscriptionUnscoped(data: {
    companyId: string;
    lemonSqueezyId?: string;
    lemonSqueezyVariantId?: string;
    status?: SubscriptionStatus;
    plan?: SubscriptionPlan;
    quantity?: number;
    trialEndDate?: Date | null;
    currentPeriodEnd?: Date | null;
  }): Promise<void>;

  abstract findCompanyIdBySubscriptionIdOrThrowUnscoped(subscriptionId: string): Promise<string>;

  abstract countActiveUsersUnscoped(companyId: string): Promise<number>;

  abstract withSubscriptionLockUnscoped<T>(companyId: string, work: () => Promise<T>): Promise<T>;
}

export type SubscriptionSyncDisposition =
  | "updated"
  | "ignored-provider-id-mismatch"
  | "ignored-untrusted-initial-binding";

function subscriptionSyncFingerprint(subscription: Subscription): string {
  return JSON.stringify([
    subscription.updatedAt?.getTime?.() ?? null,
    subscription.lemonSqueezyId,
    subscription.lemonSqueezyVariantId,
    subscription.status,
    subscription.plan,
    subscription.quantity,
    subscription.trialEndDate?.getTime?.() ?? null,
    subscription.currentPeriodEnd?.getTime?.() ?? null,
  ]);
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
    offer: CommercialOffer;
    quantity: number;
    custom?: Record<string, unknown>;
    redirectUrl?: string;
    expiresAt: Date;
  }) {
    this.ensureConfigured();
    if (!Number.isSafeInteger(options.quantity) || options.quantity < 1)
      throw new Error("Checkout quantity must be a positive integer");

    const storeId = env.LEMONSQUEEZY_STORE_ID;
    if (!storeId) throw new Error("LEMONSQUEEZY_STORE_ID is not configured");
    const variantId = offerToVariant(options.offer);

    const result = await createCheckout(storeId, variantId, {
      checkoutData: {
        custom: options.custom,
        variantQuantities: [{ variantId: Number(variantId), quantity: options.quantity }],
      },
      productOptions: {
        redirectUrl: options.redirectUrl,
        enabledVariants: [Number(variantId)],
      },
      checkoutOptions: {
        skipTrial: CLOUD_TRIAL.owner === "application",
      },
      expiresAt: options.expiresAt.toISOString(),
    });

    if (result.error) throw new Error(result.error.message || "Failed to create checkout");

    return z
      .looseObject({
        data: z.looseObject({
          attributes: z.looseObject({ url: z.string().min(1) }),
        }),
      })
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
            status: z.string().min(1),
            renews_at: z.iso.datetime().nullish(),
            ends_at: z.iso.datetime().nullish(),
            trial_ends_at: z.iso.datetime().nullish(),
            variant_id: z.number().nullish(),
            first_subscription_item: z.looseObject({ quantity: z.number().int().positive().nullish() }).nullish(),
            urls: z.looseObject({ customer_portal: z.string().nullish() }).nullish(),
          }),
        }),
      })
      .parse(result.data);
  }

  async updateSubscriptionOrThrow(
    subscriptionId: string,
    companyId?: string,
    checkoutToken?: string,
  ): Promise<{
    companyId: string;
    changedPlan: SubscriptionPlan | null;
    disposition: SubscriptionSyncDisposition;
  }> {
    this.ensureConfigured();

    const resolvedCompanyId =
      companyId ?? (await this.subscriptionRepo.findCompanyIdBySubscriptionIdOrThrowUnscoped(subscriptionId));

    for (let attempt = 0; attempt < 3; attempt++) {
      const expectedSubscription = await this.subscriptionRepo.getSubscriptionOrThrowUnscoped(resolvedCompanyId);
      const expectedFingerprint = subscriptionSyncFingerprint(expectedSubscription);

      const subscription = await this.getSubscriptionOrThrowUnscoped(subscriptionId);
      if (subscription.data.id !== subscriptionId)
        throw new Error("Lemon Squeezy returned a subscription identity mismatch");

      const attributes = subscription.data.attributes;
      const status = this.mapLemonSqueezyStatusToSubscriptionStatus(attributes.status);
      const renewsAt = attributes.renews_at ? new Date(attributes.renews_at) : null;
      const endsAt = attributes.ends_at ? new Date(attributes.ends_at) : null;
      const trialEndsAt = attributes.trial_ends_at ? new Date(attributes.trial_ends_at) : null;
      const quantity = attributes.first_subscription_item?.quantity ?? undefined;
      const variantId = attributes.variant_id?.toString();
      let syncedOffer: CommercialOffer | null = null;
      let bindingError: Error | null = null;
      if (variantId) {
        try {
          syncedOffer = variantToOffer(variantId);
        } catch (error) {
          bindingError = error instanceof Error ? error : new Error("Lemon Squeezy binding configuration failed");
        }
      }

      const sync = await this.subscriptionRepo.withSubscriptionLockUnscoped(resolvedCompanyId, async () => {
        const existing = await this.subscriptionRepo.getSubscriptionOrThrowUnscoped(resolvedCompanyId);
        if (subscriptionSyncFingerprint(existing) !== expectedFingerprint) return null;

        if (existing.lemonSqueezyId && existing.lemonSqueezyId !== subscription.data.id) {
          return {
            companyId: resolvedCompanyId,
            changedPlan: null,
            disposition: "ignored-provider-id-mismatch" as const,
            syncError: null,
          };
        }

        let activeUsers: number | null = null;
        if (!existing.lemonSqueezyId) {
          const reservation = verifyCheckoutReservation({
            marker: existing.lemonSqueezyVariantId,
            token: checkoutToken,
            secret: env.LEMONSQUEEZY_WEBHOOK_SECRET ?? "",
            companyId: resolvedCompanyId,
          });
          if (!reservation) {
            return {
              companyId: resolvedCompanyId,
              changedPlan: null,
              disposition: "ignored-untrusted-initial-binding" as const,
              syncError: null,
            };
          }
          if (!variantId) {
            return {
              companyId: resolvedCompanyId,
              changedPlan: null,
              disposition: "updated" as const,
              syncError: "Lemon Squeezy subscription is missing a variant ID; checkout binding will be retried",
            };
          }
          if (bindingError) {
            return {
              companyId: resolvedCompanyId,
              changedPlan: null,
              disposition: "updated" as const,
              syncError: `${bindingError.message}; checkout binding will be retried`,
            };
          }
          if (quantity === undefined) {
            return {
              companyId: resolvedCompanyId,
              changedPlan: null,
              disposition: "updated" as const,
              syncError: "Lemon Squeezy subscription is missing its seat quantity; checkout binding will be retried",
            };
          }

          activeUsers = await this.subscriptionRepo.countActiveUsersUnscoped(resolvedCompanyId);
          if (
            !syncedOffer ||
            reservation.payload.offerId !== syncedOffer.id ||
            reservation.payload.quantity !== quantity ||
            activeUsers > quantity
          ) {
            return {
              companyId: resolvedCompanyId,
              changedPlan: null,
              disposition: "ignored-untrusted-initial-binding" as const,
              syncError: null,
            };
          }
        }

        if (!status) {
          await this.subscriptionRepo.upsertSubscriptionUnscoped({
            companyId: resolvedCompanyId,
            lemonSqueezyId: subscription.data.id,
            lemonSqueezyVariantId: variantId,
            status: SubscriptionStatus.unPaid,
            plan: existing.plan,
            quantity,
            trialEndDate: trialEndsAt,
            currentPeriodEnd: endsAt ?? renewsAt,
          });
          return {
            companyId: resolvedCompanyId,
            changedPlan: null,
            disposition: "updated" as const,
            syncError: `Unsupported Lemon Squeezy subscription status: ${attributes.status}; access was quarantined`,
          };
        }
        if (!syncedOffer) {
          await this.subscriptionRepo.upsertSubscriptionUnscoped({
            companyId: resolvedCompanyId,
            lemonSqueezyId: subscription.data.id,
            lemonSqueezyVariantId: variantId,
            status: SubscriptionStatus.unPaid,
            plan: existing.plan,
            quantity,
            trialEndDate: trialEndsAt,
            currentPeriodEnd: endsAt ?? renewsAt,
          });
          return {
            companyId: resolvedCompanyId,
            changedPlan: null,
            disposition: "updated" as const,
            syncError: bindingError
              ? `${bindingError.message}; subscription access was quarantined`
              : variantId
                ? "Unknown Lemon Squeezy variant; subscription access was quarantined"
                : "Lemon Squeezy subscription is missing a variant ID; subscription access was quarantined",
          };
        }

        const syncedPlan = syncedOffer.plan as SubscriptionPlan;
        const currentPeriodEnd = endsAt ?? renewsAt;
        if (
          isSubscriptionUsable({
            status,
            trialEndDate: trialEndsAt,
            currentPeriodEnd,
          })
        ) {
          activeUsers ??= await this.subscriptionRepo.countActiveUsersUnscoped(resolvedCompanyId);
          if (quantity === undefined || quantity < activeUsers) {
            await this.subscriptionRepo.upsertSubscriptionUnscoped({
              companyId: resolvedCompanyId,
              lemonSqueezyId: subscription.data.id,
              lemonSqueezyVariantId: variantId,
              status: SubscriptionStatus.unPaid,
              plan: syncedPlan,
              quantity: quantity ?? existing.quantity ?? undefined,
              trialEndDate: trialEndsAt,
              currentPeriodEnd,
            });
            return {
              companyId: resolvedCompanyId,
              changedPlan: null,
              disposition: "updated" as const,
              syncError:
                quantity === undefined
                  ? "Lemon Squeezy subscription is missing its seat quantity; access was quarantined"
                  : `Lemon Squeezy subscription quantity ${quantity} is below ${activeUsers} active users; access was quarantined`,
            };
          }
        }

        await this.subscriptionRepo.upsertSubscriptionUnscoped({
          companyId: resolvedCompanyId,
          lemonSqueezyId: subscription.data.id,
          lemonSqueezyVariantId: variantId,
          status,
          plan: syncedPlan,
          quantity,
          trialEndDate: trialEndsAt,
          currentPeriodEnd,
        });

        return {
          companyId: resolvedCompanyId,
          changedPlan: syncedPlan !== existing.plan ? syncedPlan : null,
          disposition: "updated" as const,
          syncError: null,
        };
      });

      if (sync === null) continue;
      if (sync.syncError) throw new Error(sync.syncError);

      return {
        companyId: sync.companyId,
        changedPlan: sync.changedPlan,
        disposition: sync.disposition,
      };
    }

    throw new Error("Subscription changed repeatedly while synchronizing; retry the provider event");
  }

  async updateSubscriptionQuantityOrThrow(
    subscriptionId: string,
    quantity: number,
    options: { invoiceImmediately?: boolean } = {},
  ): Promise<void> {
    this.ensureConfigured();

    const subscriptionItemsResult = await listSubscriptionItems({
      filter: { subscriptionId },
    });

    if (subscriptionItemsResult.error)
      throw new Error(subscriptionItemsResult.error.message || "Failed to list subscription items");

    const items = z
      .looseObject({
        data: z.array(z.looseObject({ id: z.union([z.number(), z.string()]) })),
      })
      .parse(subscriptionItemsResult.data).data;

    if (items.length === 0) throw new Error("No subscription items found");

    const subscriptionItem = items[0];

    const updateResult = await updateSubscriptionItem(subscriptionItem.id, {
      quantity,
      ...(options.invoiceImmediately ? { invoiceImmediately: true } : {}),
    });

    if (updateResult.error) throw new Error(updateResult.error.message || "Failed to update subscription quantity");
  }

  private mapLemonSqueezyStatusToSubscriptionStatus(lemonSqueezyStatus: string): SubscriptionStatus | null {
    switch (lemonSqueezyStatus) {
      case "active":
        return SubscriptionStatus.active;
      case "on_trial":
        return SubscriptionStatus.trial;
      case "paused":
        return SubscriptionStatus.unPaid;
      case "cancelled":
        return SubscriptionStatus.cancelled;
      case "expired":
        return SubscriptionStatus.expired;
      case "past_due":
        return SubscriptionStatus.pastDue;
      case "unpaid":
        return SubscriptionStatus.unPaid;
      default:
        return null;
    }
  }

  private ensureConfigured(): void {
    if (!this.isConfigured) throw new Error("LEMONSQUEEZY_API_KEY is not configured");
  }
}
