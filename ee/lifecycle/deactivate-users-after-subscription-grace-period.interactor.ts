import type { EmailService } from "@/features/email/email.service";
import type { ReleaseOwnerRoutinesInteractor } from "@/ee/routines/release-owner-routines.interactor";

import type { DeactivateUsersAfterSubscriptionGracePeriodRepo } from "./deactivate-users-after-subscription-grace-period.repo";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

import SubscriptionInactivationNotice from "@/components/emails/subscription-inactivation-notice";
import { getEmailLayoutCopy } from "@/components/emails/base/email-layout-copy";
import { getTranslator } from "@/i18n/get-translator";
import { resolveUserLocale } from "@/i18n/user-locale";
import { env } from "@/env";

@SystemInteractor
export class DeactivateUsersAfterSubscriptionGracePeriodInteractor {
  constructor(
    private repo: DeactivateUsersAfterSubscriptionGracePeriodRepo,
    private emailService: EmailService,
    private releaseOwnerRoutines: ReleaseOwnerRoutinesInteractor,
  ) {}

  async invoke(): Promise<void> {
    const users = await this.repo.findUsersPastSubscriptionGracePeriod();

    for (const user of users) {
      await this.repo.deactivateUserOrThrow(user.id);
      await this.releaseOwnerRoutines.invoke({ companyId: user.companyId, ownerUserId: user.id });

      const locale = resolveUserLocale(user);
      const contactHref = `${env.BASE_URL}/contact`;
      const t = await getTranslator(locale, "SubscriptionInactivationNotice");
      const layoutCopy = await getEmailLayoutCopy(locale);
      const workspace = user.company.name;
      const subject = workspace ? t("subjectNamed", { workspace }) : t("subject");

      await this.emailService.send({
        to: user.email,
        subject,
        react: SubscriptionInactivationNotice({
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
