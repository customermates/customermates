import type { EmailService } from "@/features/email/email.service";

import { getTranslations } from "next-intl/server";

import type { User } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import TrialInactivationNotice from "@/components/emails/trial-inactivation-notice";
import { ROUTING_DEFAULT_LOCALE } from "@/i18n/routing";
import { env } from "@/env";

export abstract class DeactivateTrialUsersAndSendNoticeRepo {
  abstract findUsersWithTrialEndedBetween6And7Days(): Promise<User[]>;
  abstract claimTrialInactivationNoticeSent(args: { userId: string; sentAt: Date }): Promise<boolean>;
  abstract deactivateUser(userId: string): Promise<void>;
}

@SystemInteractor
export class DeactivateTrialUsersAndSendNoticeInteractor {
  constructor(
    private repo: DeactivateTrialUsersAndSendNoticeRepo,
    private emailService: EmailService,
  ) {}

  async invoke(): Promise<void> {
    const users = await this.repo.findUsersWithTrialEndedBetween6And7Days();

    for (const user of users.filter((item) => !item.trialInactivationNoticeSentAt)) {
      const claimed = await this.repo.claimTrialInactivationNoticeSent({ userId: user.id, sentAt: new Date() });
      if (!claimed) continue;

      await this.repo.deactivateUser(user.id);

      const locale = user.displayLanguage === "system" ? ROUTING_DEFAULT_LOCALE : user.displayLanguage;
      const contactHref = `${env.BASE_URL}/contact`;
      const t = await getTranslations({
        locale,
        namespace: "TrialInactivationNotice",
      });
      await this.emailService.send({
        to: user.email,
        subject: t("subject"),
        react: TrialInactivationNotice({
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
