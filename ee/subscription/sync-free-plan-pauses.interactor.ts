import type { EmailService } from "@/features/email/email.service";
import type { FreePlanMemberRepo, PlanPauseNoticeRecipient } from "./free-plan-member.repo";
import type { FreePlanPauseService } from "./free-plan-pause.service";

import * as ErrorReporter from "@/core/observability/server";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { FREE_PLAN_USAGE_LIMITS } from "@/core/commercial/plan-catalog";
import PlanPauseNotice from "@/components/emails/plan-pause-notice";
import { getEmailLayoutCopy } from "@/components/emails/base/email-layout-copy";
import { getTranslator } from "@/i18n/get-translator";
import { resolveUserLocale } from "@/i18n/user-locale";
import { env } from "@/env";

const NOTICE_BATCH_LIMIT = 200;

export type SyncFreePlanPausesResult = {
  workspaces: number;
  paused: number;
  resumed: number;
  notified: number;
};

@SystemInteractor
export class SyncFreePlanPausesInteractor {
  constructor(
    private readonly repo: FreePlanMemberRepo,
    private readonly pauses: FreePlanPauseService,
    private readonly emailService: EmailService,
  ) {}

  async invoke(options: { now?: Date; companyIds?: string[] } = {}): Promise<SyncFreePlanPausesResult> {
    if (env.APP_MODE !== "cloud") return { workspaces: 0, paused: 0, resumed: 0, notified: 0 };
    const now = options.now ?? new Date();

    const companyIds = options.companyIds ?? [
      ...new Set([
        ...(await this.repo.findWorkspacesOverFreePlanUnscoped(now, FREE_PLAN_USAGE_LIMITS.maxMembers)),
        ...(await this.repo.findWorkspacesWithPlanPausesUnscoped(now)),
      ]),
    ];

    let paused = 0;
    let resumed = 0;
    for (const companyId of companyIds) {
      try {
        const result = await this.pauses.syncUnscoped(companyId, now);
        paused += result.paused;
        resumed += result.resumed;
      } catch (error) {
        ErrorReporter.captureException(error, { tags: { kind: "free-plan-pause-sync", companyId } });
      }
    }

    let notified = 0;
    for (const recipient of await this.repo.findPauseNoticeRecipientsUnscoped(NOTICE_BATCH_LIMIT, options.companyIds)) {
      if (!(await this.repo.claimPauseNoticeUnscoped(recipient.id, now))) continue;
      if (await this.sendNotice(recipient)) notified += 1;
      else await this.repo.releasePauseNoticeUnscoped(recipient.id);
    }

    return { workspaces: companyIds.length, paused, resumed, notified };
  }

  private async sendNotice(recipient: PlanPauseNoticeRecipient): Promise<boolean> {
    const locale = resolveUserLocale(recipient);
    const t = await getTranslator(locale, "PlanPauseNotice");
    const layoutCopy = await getEmailLayoutCopy(locale);
    const workspace = recipient.workspaceName;
    const owner = (await this.repo.findActiveKeeperNameUnscoped(recipient.companyId)) ?? t("ownerFallback");
    const subject = workspace ? t("subjectNamed", { workspace }) : t("subject");

    return this.emailService.send({
      to: recipient.email,
      subject,
      react: PlanPauseNotice({
        locale,
        layoutCopy,
        greeting: t("greeting", { firstName: recipient.firstName }),
        body: workspace ? t("bodyNamed", { workspace, owner }) : t("body", { owner }),
        kept: t("kept"),
        cta: t("cta"),
        scheduleFallback: t("scheduleFallback"),
        signoff: t("signoff"),
        subject,
        title: t("title"),
        href: `${env.BASE_URL}/auth/signin`,
      }),
    });
  }
}
