import type { Subscription } from "@/generated/prisma";

export abstract class CreateCheckoutCompanyRepo {
  abstract getSubscriptionOrThrow(): Promise<Subscription>;
}
