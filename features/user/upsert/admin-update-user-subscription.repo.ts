import type { Subscription } from "@/generated/prisma";

export abstract class AdminUpdateUserSubscriptionRepo {
  abstract getSubscriptionOrThrow(): Promise<Subscription>;
}
