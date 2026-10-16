import type { Subscription } from "@/generated/prisma";

export abstract class CreateCheckoutCompanyRepo {
  abstract getSubscriptionOrThrow(): Promise<Subscription>;

  abstract claimCheckoutStart(startedAt: Date, pendingSince: Date): Promise<boolean>;

  abstract releaseCheckoutStart(startedAt: Date, previous: Date | null): Promise<void>;
}
