import type { Subscription } from "@/generated/prisma";

export abstract class GetSubscriptionRepo {
  abstract getSubscriptionOrThrow(): Promise<Subscription>;
}
