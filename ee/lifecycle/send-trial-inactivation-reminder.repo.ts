import type { LifecycleRecipient } from "./lifecycle-recipient";

export abstract class SendTrialInactivationReminderActionRepo {
  abstract findUsersWithTrialEndedBetween3And4Days(): Promise<LifecycleRecipient[]>;
  abstract claimTrialInactivationReminderSent(args: { userId: string; sentAt: Date }): Promise<boolean>;
}
