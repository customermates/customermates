import { getTranslations } from "next-intl/server";
import { User } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import XTrialInactivationNotice from "@/components/x-emails/x-trial-inactivation-notice";
import { EmailService } from "@/features/email/email.service";
import { ROUTING_DEFAULT_LOCALE } from "@/i18n/routing";

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
      const t = await getTranslations({
        locale,
        namespace: "SubscriptionInactivationNotice",
      });
      await this.emailService.send({
        to: user.email,
        subject: t("subject"),
        react: XTrialInactivationNotice({
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
