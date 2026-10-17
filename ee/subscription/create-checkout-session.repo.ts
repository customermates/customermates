import type { Subscription } from "@/generated/prisma";

export abstract class CreateCheckoutCompanyRepo {
  abstract getSubscriptionOrThrow(): Promise<Subscription>;

  abstract claimCheckoutStart(args: {
    startedAt: Date;
    pendingSince: Date;
    lemonSqueezyId: string | null;
  }): Promise<boolean>;

  abstract releaseCheckoutStart(args: { startedAt: Date; previous: Date | null }): Promise<void>;
}
