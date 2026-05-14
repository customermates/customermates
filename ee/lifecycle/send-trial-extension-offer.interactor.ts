import type { EmailService } from "@/features/email/email.service";

import type { User } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

import TrialExpiredOffer from "@/components/emails/trial-expired-offer";
import { getTranslator } from "@/i18n/get-translator";
import { ROUTING_DEFAULT_LOCALE } from "@/i18n/routing";
import { env } from "@/env";

export abstract class SendTrialExtensionOfferActionRepo {
  abstract findUsersWithTrialEndedLast24Hours(): Promise<User[]>;
  abstract claimTrialExpiredOfferSent(args: { userId: string; sentAt: Date }): Promise<boolean>;
}

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

      const locale = user.displayLanguage === "system" ? ROUTING_DEFAULT_LOCALE : user.displayLanguage;
      const contactHref = `${env.BASE_URL}/contact`;
      const t = await getTranslator(locale, "TrialExpiredOffer");

      await this.emailService.send({
        to: user.email,
        subject: t("subject"),
        react: TrialExpiredOffer({
          greeting: t("greeting", { firstName: user.firstName }),
          body: t("body"),
          cta: t("cta"),
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
