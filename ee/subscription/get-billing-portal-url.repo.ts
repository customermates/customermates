import type { SubscriptionPlan } from "@/generated/prisma";

export abstract class GetBillingPortalUrlRepo {
  abstract getSubscriptionOrThrow(): Promise<{ lemonSqueezyId: string | null; plan: SubscriptionPlan }>;
}
