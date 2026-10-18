import type { EmailService } from "@/features/email/email.service";

import type { SendTrialInactivationReminderActionRepo } from "./send-trial-inactivation-reminder.repo";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

import TrialInactivationReminder from "@/components/emails/trial-inactivation-reminder";
import { getEmailLayoutCopy } from "@/components/emails/base/email-layout-copy";
import { getTranslator } from "@/i18n/get-translator";
import { resolveUserLocale } from "@/i18n/user-locale";
import { env } from "@/env";

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

      const locale = resolveUserLocale(user);
      const contactHref = `${env.BASE_URL}/contact`;
      const t = await getTranslator(locale, "TrialInactivationReminder");
      const layoutCopy = await getEmailLayoutCopy(locale);
      const workspace = user.company.name;
      const subject = workspace ? t("subjectNamed", { workspace }) : t("subject");

      await this.emailService.send({
        to: user.email,
        subject,
        react: TrialInactivationReminder({
          locale,
          layoutCopy,
          greeting: t("greeting", { firstName: user.firstName }),
          body: workspace ? t("bodyNamed", { workspace }) : t("body"),
          cta: t("cta"),
          dismiss: t("dismiss"),
          scheduleFallback: t("scheduleFallback"),
          signoff: t("signoff"),
          subject,
          title: t("title"),
          href: contactHref,
        }),
      });
    }
  }
}
