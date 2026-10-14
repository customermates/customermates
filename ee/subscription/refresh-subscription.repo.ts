import type { SubscriptionPlan } from "@/generated/prisma";

export abstract class RefreshSubscriptionRepo {
  abstract getSubscriptionOrThrow(): Promise<{ lemonSqueezyId: string | null; plan: SubscriptionPlan }>;
}
