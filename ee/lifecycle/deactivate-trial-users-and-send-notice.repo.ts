import type { LifecycleRecipient } from "./lifecycle-recipient";

export abstract class DeactivateTrialUsersAndSendNoticeRepo {
  abstract findUsersWithTrialEndedBetween6And7Days(): Promise<LifecycleRecipient[]>;
  abstract claimTrialInactivationNoticeSent(args: { userId: string; sentAt: Date }): Promise<boolean>;
  abstract deactivateUserOrThrow(userId: string): Promise<void>;
}
