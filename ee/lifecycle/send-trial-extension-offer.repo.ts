import type { LifecycleRecipient } from "./lifecycle-recipient";

export abstract class SendTrialExtensionOfferActionRepo {
  abstract findUsersWithTrialEndedLast24Hours(): Promise<LifecycleRecipient[]>;
  abstract claimTrialExpiredOfferSent(args: { userId: string; sentAt: Date }): Promise<boolean>;
}
