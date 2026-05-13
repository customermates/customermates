import type { EmailService } from "@/features/email/email.service";

import { getTranslations } from "next-intl/server";

import type { User } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import TrialInactivationNotice from "@/components/emails/trial-inactivation-notice";
import { ROUTING_DEFAULT_LOCALE } from "@/i18n/routing";
import { env } from "@/env";

export abstract class DeactivateUsersAfterSubscriptionGracePeriodRepo {
  abstract findUsersPastSubscriptionGracePeriod(): Promise<User[]>;
  abstract deactivateUser(userId: string): Promise<void>;
}

@SystemInteractor
export class DeactivateUsersAfterSubscriptionGracePeriodInteractor {
  constructor(
    private repo: DeactivateUsersAfterSubscriptionGracePeriodRepo,
    private emailService: EmailService,
  ) {}

  async invoke(): Promise<void> {
    const users = await this.repo.findUsersPastSubscriptionGracePeriod();

    for (const user of users) {
      await this.repo.deactivateUser(user.id);

      const locale = user.displayLanguage === "system" ? ROUTING_DEFAULT_LOCALE : user.displayLanguage;
      const contactHref = `${env.BASE_URL}/contact`;
      const t = await getTranslations({
        locale,
        namespace: "SubscriptionInactivationNotice",
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
