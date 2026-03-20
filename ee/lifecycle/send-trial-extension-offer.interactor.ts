import { getTranslations } from "next-intl/server";
import { User } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import XTrialExpiredOffer from "@/components/x-emails/x-trial-expired-offer";
import { EmailService } from "@/features/email/email.service";
import { ROUTING_DEFAULT_LOCALE } from "@/i18n/routing";

export abstract class SendTrialExtensionOfferActionRepo {
  abstract findUsersWithTrialEndedLast24Hours(): Promise<User[]>;
  abstract claimTrialExpiredOfferSent(userId: string, sentAt: Date): Promise<boolean>;
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
      const claimed = await this.repo.claimTrialExpiredOfferSent(user.id, new Date());
      if (!claimed) continue;

      const locale = user.displayLanguage === "system" ? ROUTING_DEFAULT_LOCALE : user.displayLanguage;
      const demoHref =
        locale === "de"
          ? "https://calendly.com/customermates/produkt-demo"
          : "https://calendly.com/customermates/product-demo";
      const t = await getTranslations({
        locale,
        namespace: "TrialExpiredOffer",
      });
      await this.emailService.send({
        to: user.email,
        subject: t("subject"),
        react: XTrialExpiredOffer({
          greeting: t("greeting", { firstName: user.firstName }),
          body: t("body"),
          scheduleFallback: t("scheduleFallback"),
          signoff: t("signoff"),
          subject: t("subject"),
          title: t("title"),
          href: demoHref,
        }),
      });
    }
  }
}
