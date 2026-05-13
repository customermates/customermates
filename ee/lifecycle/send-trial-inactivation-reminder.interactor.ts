import type { EmailService } from "@/features/email/email.service";

import { getTranslations } from "next-intl/server";

import type { User } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import TrialInactivationReminder from "@/components/emails/trial-inactivation-reminder";
import { ROUTING_DEFAULT_LOCALE } from "@/i18n/routing";
import { env } from "@/env";

export abstract class SendTrialInactivationReminderActionRepo {
  abstract findUsersWithTrialEndedBetween3And4Days(): Promise<User[]>;
  abstract claimTrialInactivationReminderSent(args: { userId: string; sentAt: Date }): Promise<boolean>;
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
      const claimed = await this.repo.claimTrialInactivationReminderSent({ userId: user.id, sentAt: new Date() });
      if (!claimed) continue;

      const locale = user.displayLanguage === "system" ? ROUTING_DEFAULT_LOCALE : user.displayLanguage;
      const contactHref = `${env.BASE_URL}/contact`;
      const t = await getTranslations({
        locale,
        namespace: "TrialInactivationReminder",
      });
      await this.emailService.send({
        to: user.email,
        subject: t("subject"),
        react: TrialInactivationReminder({
          greeting: t("greeting", { firstName: user.firstName }),
          body: t("body"),
          cta: t("cta"),
          dismiss: t("dismiss"),
          scheduleFallback: t("scheduleFallback"),
          signoff: t("signoff"),
          subject: t("subject"),
          title: t("title"),
          href: contactHref,
        }),
      });
    }
  }
}
