import type { EmailService } from "@/features/email/email.service";

import type { User } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

import TrialWelcome from "@/components/emails/trial-welcome";
import { getEmailLayoutCopy } from "@/components/emails/base/email-layout-copy";
import { getTranslator } from "@/i18n/get-translator";
import { resolveUserLocale } from "@/i18n/user-locale";

export abstract class SendWelcomeAndDemoActionRepo {
  abstract findProspectUsers(): Promise<User[]>;
  abstract claimWelcomeEmailSent(args: { userId: string; sentAt: Date }): Promise<boolean>;
}

@SystemInteractor
export class SendWelcomeAndDemoInteractor {
  constructor(
    private repo: SendWelcomeAndDemoActionRepo,
    private emailService: EmailService,
  ) {}

  async invoke(): Promise<void> {
    const users = await this.repo.findProspectUsers();

    for (const user of users.filter((item) => !item.welcomeEmailSentAt)) {
      const claimed = await this.repo.claimWelcomeEmailSent({ userId: user.id, sentAt: new Date() });
      if (!claimed) continue;

      const locale = resolveUserLocale(user);
      const t = await getTranslator(locale, "TrialWelcome");
      const layoutCopy = await getEmailLayoutCopy(locale);

      await this.emailService.send({
        to: user.email,
        subject: t("subject"),
        react: TrialWelcome({
          locale,
          layoutCopy,
          greeting: t("greeting", { firstName: user.firstName }),
          body: t("body"),
          planNote: t("planNote"),
          dismiss: t("dismiss"),
          signoff: t("signoff"),
          subject: t("subject"),
          title: t("title"),
        }),
      });
    }
  }
}
