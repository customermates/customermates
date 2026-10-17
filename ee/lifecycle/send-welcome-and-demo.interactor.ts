import type { EmailService } from "@/features/email/email.service";

import type { User } from "@/generated/prisma";
import type { SendWelcomeAndDemoActionRepo } from "./send-welcome-and-demo.repo";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

import TrialWelcome from "@/components/emails/trial-welcome";
import { getEmailLayoutCopy } from "@/components/emails/base/email-layout-copy";
import { getTranslator } from "@/i18n/get-translator";
import { resolveUserLocale } from "@/i18n/user-locale";

@SystemInteractor
export class SendWelcomeAndDemoInteractor {
  constructor(
    private repo: SendWelcomeAndDemoActionRepo,
    private emailService: EmailService,
  ) {}

  async invoke(): Promise<void> {
    const users = await this.repo.findProspectUsers();
    const membershipsByLogin = new Map<string, User[]>();
    for (const user of users.filter((item) => !item.welcomeEmailSentAt)) {
      const login = user.email.toLowerCase();
      membershipsByLogin.set(login, [...(membershipsByLogin.get(login) ?? []), user]);
    }

    for (const [user, ...otherMemberships] of membershipsByLogin.values()) {
      const claimed = await this.repo.claimWelcomeEmailForLoginUnscoped({
        email: user.email,
        userIds: [user.id, ...otherMemberships.map((membership) => membership.id)],
        sentAt: new Date(),
      });
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
