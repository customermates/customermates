import type { EmailService } from "@/features/email/email.service";
import type { ReleaseOwnerRoutinesInteractor } from "@/ee/routines/release-owner-routines.interactor";

import type { DeactivateTrialUsersAndSendNoticeRepo } from "./deactivate-trial-users-and-send-notice.repo";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

import TrialInactivationNotice from "@/components/emails/trial-inactivation-notice";
import { getEmailLayoutCopy } from "@/components/emails/base/email-layout-copy";
import { getTranslator } from "@/i18n/get-translator";
import { resolveUserLocale } from "@/i18n/user-locale";
import { env } from "@/env";

@SystemInteractor
export class DeactivateTrialUsersAndSendNoticeInteractor {
  constructor(
    private repo: DeactivateTrialUsersAndSendNoticeRepo,
    private emailService: EmailService,
    private releaseOwnerRoutines: ReleaseOwnerRoutinesInteractor,
  ) {}

  async invoke(): Promise<void> {
    const users = await this.repo.findUsersWithTrialEndedBetween6And7Days();

    for (const user of users.filter((item) => !item.trialInactivationNoticeSentAt)) {
      const claimed = await this.repo.claimTrialInactivationNoticeSent({ userId: user.id, sentAt: new Date() });
      if (!claimed) continue;

      await this.repo.deactivateUserOrThrow(user.id);
      await this.releaseOwnerRoutines.invoke({ companyId: user.companyId, ownerUserId: user.id });

      const locale = resolveUserLocale(user);
      const contactHref = `${env.BASE_URL}/contact`;
      const t = await getTranslator(locale, "TrialInactivationNotice");
      const layoutCopy = await getEmailLayoutCopy(locale);
      const workspace = user.company.name;
      const subject = workspace ? t("subjectNamed", { workspace }) : t("subject");

      await this.emailService.send({
        to: user.email,
        subject,
        react: TrialInactivationNotice({
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
