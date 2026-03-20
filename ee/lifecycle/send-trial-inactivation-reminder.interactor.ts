import { getTranslations } from "next-intl/server";

import { User } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import XTrialInactivationReminder from "@/components/x-emails/x-trial-inactivation-reminder";
import { EmailService } from "@/features/email/email.service";
import { ROUTING_DEFAULT_LOCALE } from "@/i18n/routing";

export abstract class SendTrialInactivationReminderActionRepo {
  abstract findUsersWithTrialEndedBetween3And4Days(): Promise<User[]>;
  abstract claimTrialInactivationReminderSent(userId: string, sentAt: Date): Promise<boolean>;
}

@SystemInteractor
export class SendTrialInactivationReminderInteractor {
  constructor(
    private repo: SendTrialInactivationReminderActionRepo,
    private emailService: EmailService,
  ) {}

  async invoke(): Promise<void> {
    const users = await this.repo.findUsersWithTrialEndedBetween3And4Days();

    for (const user of users.filter((item) => !item.trialInactivationReminderSentAt)) {
      const claimed = await this.repo.claimTrialInactivationReminderSent(user.id, new Date());
      if (!claimed) continue;

      const locale = user.displayLanguage === "system" ? ROUTING_DEFAULT_LOCALE : user.displayLanguage;
      const t = await getTranslations({
        locale,
        namespace: "TrialInactivationReminder",
      });
      await this.emailService.send({
        to: user.email,
        subject: t("subject"),
        react: XTrialInactivationReminder({
          greeting: t("greeting", { firstName: user.firstName }),
          body: t("body"),
          dismiss: t("dismiss"),
          signoff: t("signoff"),
          subject: t("subject"),
          title: t("title"),
        }),
      });
    }
  }
}
