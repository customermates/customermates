import type { EmailService } from "@/features/email/email.service";

import { getTranslations } from "next-intl/server";

import type { User } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import TrialWelcome from "@/components/emails/trial-welcome";
import { ROUTING_DEFAULT_LOCALE } from "@/i18n/routing";

export abstract class SendWelcomeAndDemoActionRepo {
  abstract findProspectUsers(): Promise<User[]>;
  abstract claimWelcomeEmailSent(userId: string, sentAt: Date): Promise<boolean>;
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
      const claimed = await this.repo.claimWelcomeEmailSent(user.id, new Date());
      if (!claimed) continue;

      const locale = user.displayLanguage === "system" ? ROUTING_DEFAULT_LOCALE : user.displayLanguage;
      const contactHref =
        locale === "de" ? "https://customermates.com/de/contact" : "https://customermates.com/en/contact";
      const t = await getTranslations({
        locale,
        namespace: "TrialWelcome",
      });

      await this.emailService.send({
        to: user.email,
        subject: t("subject"),
        react: TrialWelcome({
          greeting: t("greeting", { firstName: user.firstName }),
          body: t("body"),
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
