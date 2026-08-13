import { describe, expect, it, vi } from "vitest";

import { DeactivateTrialUsersAndSendNoticeInteractor } from "../deactivate-trial-users-and-send-notice.interactor";
import { DeactivateUsersAfterSubscriptionGracePeriodInteractor } from "../deactivate-users-after-subscription-grace-period.interactor";

const USER = {
  id: "user-1",
  email: "owner@example.com",
  firstName: "Owner",
  trialInactivationNoticeSentAt: null,
} as never;

describe("checkout reservation lifecycle fencing", () => {
  it("does not claim or notify when trial cleanup cannot deactivate a reserved seat", async () => {
    const repo = {
      findUsersWithTrialEndedBetween6And7Days: vi.fn().mockResolvedValue([USER]),
      claimTrialInactivationAndDeactivateUnlessCheckoutReservedOrThrow: vi.fn().mockResolvedValue(false),
    };
    const emailService = { send: vi.fn() };

    await new DeactivateTrialUsersAndSendNoticeInteractor(repo as never, emailService as never).invoke();

    expect(repo.claimTrialInactivationAndDeactivateUnlessCheckoutReservedOrThrow).toHaveBeenCalledOnce();
    expect(emailService.send).not.toHaveBeenCalled();
  });

  it("does not notify when subscription-grace cleanup cannot deactivate a reserved seat", async () => {
    const repo = {
      findUsersPastSubscriptionGracePeriod: vi.fn().mockResolvedValue([USER]),
      deactivateUserAfterGraceUnlessCheckoutReservedOrThrow: vi.fn().mockResolvedValue(false),
    };
    const emailService = { send: vi.fn() };

    await new DeactivateUsersAfterSubscriptionGracePeriodInteractor(repo as never, emailService as never).invoke();

    expect(emailService.send).not.toHaveBeenCalled();
  });
});
