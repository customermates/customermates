import type { LifecycleRecipient } from "./lifecycle-recipient";

export abstract class DeactivateUsersAfterSubscriptionGracePeriodRepo {
  abstract findUsersPastSubscriptionGracePeriod(): Promise<LifecycleRecipient[]>;
  abstract deactivateUserOrThrow(userId: string): Promise<void>;
}
