import type { EmailService } from "@/features/email/email.service";

import type { SendTrialExtensionOfferActionRepo } from "./send-trial-extension-offer.repo";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

import TrialExpiredOffer from "@/components/emails/trial-expired-offer";
import { getEmailLayoutCopy } from "@/components/emails/base/email-layout-copy";
import { getTranslator } from "@/i18n/get-translator";
import { resolveUserLocale } from "@/i18n/user-locale";
import { env } from "@/env";

@SystemInteractor
export class SendTrialExtensionOfferInteractor {
  constructor(
    private repo: SendTrialExtensionOfferActionRepo,
    private emailService: EmailService,
  ) {}

  async invoke(): Promise<void> {
    const users = await this.repo.findUsersWithTrialEndedLast24Hours();

    for (const user of users.filter((item) => !item.trialExpiredOfferSentAt)) {
      const claimed = await this.repo.claimTrialExpiredOfferSent({ userId: user.id, sentAt: new Date() });
      if (!claimed) continue;

      const locale = resolveUserLocale(user);
      const contactHref = `${env.BASE_URL}/contact`;
      const t = await getTranslator(locale, "TrialExpiredOffer");
      const layoutCopy = await getEmailLayoutCopy(locale);
      const workspace = user.company.name;
      const subject = workspace ? t("subjectNamed", { workspace }) : t("subject");

      await this.emailService.send({
        to: user.email,
        subject,
        react: TrialExpiredOffer({
          locale,
          layoutCopy,
          greeting: t("greeting", { firstName: user.firstName }),
          body: workspace ? t("bodyNamed", { workspace }) : t("body"),
          cta: t("cta"),
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
