import type { EmailService } from "@/features/email/email.service";
import type { ReleaseOwnerRoutinesInteractor } from "@/ee/routines/release-owner-routines.interactor";
import type { EventService } from "@/features/event/event.service";
import type { TenantUser } from "@/features/user/user.schema";

import type { User } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { publishUserDeactivated } from "./publish-user-deactivated";

import TrialInactivationNotice from "@/components/emails/trial-inactivation-notice";
import { getEmailLayoutCopy } from "@/components/emails/base/email-layout-copy";
import { getTranslator } from "@/i18n/get-translator";
import { resolveUserLocale } from "@/i18n/user-locale";
import { env } from "@/env";

export abstract class DeactivateTrialUsersAndSendNoticeRepo {
  abstract findUsersWithTrialEndedBetween6And7Days(): Promise<User[]>;
  abstract claimTrialInactivationNoticeSent(args: { userId: string; sentAt: Date }): Promise<boolean>;
  abstract deactivateUserOrThrow(userId: string): Promise<TenantUser>;
}

@SystemInteractor
export class DeactivateTrialUsersAndSendNoticeInteractor {
  constructor(
    private repo: DeactivateTrialUsersAndSendNoticeRepo,
    private emailService: EmailService,
    private releaseOwnerRoutines: ReleaseOwnerRoutinesInteractor,
    private eventService: EventService,
  ) {}

  async invoke(): Promise<void> {
    const users = await this.repo.findUsersWithTrialEndedBetween6And7Days();

    for (const user of users.filter((item) => !item.trialInactivationNoticeSentAt)) {
      const claimed = await this.repo.claimTrialInactivationNoticeSent({ userId: user.id, sentAt: new Date() });
      if (!claimed) continue;

      const deactivated = await this.repo.deactivateUserOrThrow(user.id);
      await this.releaseOwnerRoutines.invoke({ companyId: user.companyId, ownerUserId: user.id });
      await publishUserDeactivated(this.eventService, deactivated);

      const locale = resolveUserLocale(user);
      const contactHref = `${env.BASE_URL}/contact`;
      const t = await getTranslator(locale, "TrialInactivationNotice");
      const layoutCopy = await getEmailLayoutCopy(locale);

      await this.emailService.send({
        to: user.email,
        subject: t("subject"),
        react: TrialInactivationNotice({
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
