import type { EmailService } from "@/features/email/email.service";
import type { WorkspaceSetupRecord } from "./workspace-setup.schema";
import type { GetCompanyRepo } from "@/features/company/get-company.repo";

import { createElement } from "react";

import { UserAccessor } from "@/core/base/user-accessor";
import { getEmailLayoutCopy } from "@/components/emails/base/email-layout-copy";
import WorkspaceSetupNotice from "@/components/emails/workspace-setup-notice";
import { env } from "@/env";
import { getTranslator } from "@/i18n/get-translator";
import { resolveUserLocale } from "@/i18n/user-locale";

import { SETUP_WORKSPACE_QUERY_PARAM } from "./workspace-setup-link";

export const SETUP_AWAY_MS = 12_000;

export type SetupNoticeStage = "plan" | "build";
export type SetupNotice = "planReady" | "planFailed" | "workspaceReady" | "workspaceFailed";

const STAGE_NOTICES: Record<SetupNoticeStage, ReadonlySet<SetupNotice>> = {
  plan: new Set(["planReady", "planFailed"]),
  build: new Set(["workspaceReady", "workspaceFailed"]),
};

export function setupNotice(setup: Pick<WorkspaceSetupRecord, "status" | "interview">): SetupNotice | null {
  switch (setup.status) {
    case "planned":
      return "planReady";
    case "completed":
      return "workspaceReady";
    case "failed":
      return "workspaceFailed";
    case "interview":
      return setup.interview.plan === "failed" ? "planFailed" : null;
    default:
      return null;
  }
}

function setupWatched(setup: Pick<WorkspaceSetupRecord, "interview">, now: Date): boolean {
  const watchedAt = setup.interview.watchedAt;
  return Boolean(watchedAt) && new Date(watchedAt ?? 0).getTime() > now.getTime() - SETUP_AWAY_MS;
}

export function dueSetupNotice(
  setup: Pick<WorkspaceSetupRecord, "status" | "interview">,
  stage: SetupNoticeStage,
  now: Date,
): SetupNotice | null {
  const notice = setupNotice(setup);
  return notice && STAGE_NOTICES[stage].has(notice) && !setupWatched(setup, now) ? notice : null;
}

type NoticeTranslator = Awaited<ReturnType<typeof getTranslator>>;

function noticeCopy(t: NoticeTranslator, notice: SetupNotice, workspace: string | null) {
  return {
    subject: workspace ? t(`${notice}.subjectNamed`, { workspace }) : t(`${notice}.subject`),
    title: t(`${notice}.title`),
    body: workspace ? t(`${notice}.bodyNamed`, { workspace }) : t(`${notice}.body`),
    cta: t(`${notice}.cta`),
  };
}

export class WorkspaceSetupNotifier extends UserAccessor {
  constructor(
    private emailService: Pick<EmailService, "send">,
    private companyRepo: GetCompanyRepo,
  ) {
    super();
  }

  async send(notice: SetupNotice): Promise<boolean> {
    const user = this.user;
    const locale = resolveUserLocale(user);
    const t = await getTranslator(locale, "WorkspaceSetupNotice");
    const workspace = (await this.companyRepo.findCompanyOrThrow()).name?.trim() || null;
    const copy = noticeCopy(t, notice, workspace);
    return this.emailService.send({
      to: user.email,
      subject: copy.subject,
      react: createElement(WorkspaceSetupNotice, {
        locale,
        layoutCopy: await getEmailLayoutCopy(locale),
        greeting: t("greeting", { firstName: user.firstName }),
        fallback: t("fallback"),
        href: `${env.BASE_URL}/${locale}/onboarding/wizard?${SETUP_WORKSPACE_QUERY_PARAM}=${this.companyId}`,
        ...copy,
      }),
    });
  }
}
