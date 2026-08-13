import type { EmailService } from "@/features/email/email.service";

import type { User } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

import SubscriptionInactivationNotice from "@/components/emails/subscription-inactivation-notice";
import { getEmailLayoutCopy } from "@/components/emails/base/email-layout-copy";
import { getTranslator } from "@/i18n/get-translator";
import { resolveUserLocale } from "@/i18n/user-locale";
import { env } from "@/env";

export abstract class DeactivateUsersAfterSubscriptionGracePeriodRepo {
  abstract findUsersPastSubscriptionGracePeriod(): Promise<User[]>;
  abstract deactivateUserAfterGraceUnlessCheckoutReservedOrThrow(args: { userId: string; now: Date }): Promise<boolean>;
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
      const deactivated = await this.repo.deactivateUserAfterGraceUnlessCheckoutReservedOrThrow({
        userId: user.id,
        now: new Date(),
      });
      if (!deactivated) continue;

      const locale = resolveUserLocale(user);
      const contactHref = `${env.BASE_URL}/contact`;
      const t = await getTranslator(locale, "SubscriptionInactivationNotice");
      const layoutCopy = await getEmailLayoutCopy(locale);

      await this.emailService.send({
        to: user.email,
        subject: t("subject"),
        react: SubscriptionInactivationNotice({
          locale,
          layoutCopy,
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
