import type { EmailService } from "@/features/email/email.service";
import type { WorkspaceSetupRepo } from "./workspace-setup.repo";
import type { WorkspaceSetupRecord } from "./workspace-setup.schema";

import { createElement } from "react";

import { UserAccessor } from "@/core/base/user-accessor";
import { getEmailLayoutCopy } from "@/components/emails/base/email-layout-copy";
import WorkspaceSetupNotice from "@/components/emails/workspace-setup-notice";
import { env } from "@/env";
import { getTranslator } from "@/i18n/get-translator";
import { resolveUserLocale } from "@/i18n/user-locale";

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

export function setupWatched(setup: Pick<WorkspaceSetupRecord, "interview">, now: Date): boolean {
  const watchedAt = setup.interview.watchedAt;
  return Boolean(watchedAt) && new Date(watchedAt ?? 0).getTime() > now.getTime() - SETUP_AWAY_MS;
}

type NoticeTranslator = Awaited<ReturnType<typeof getTranslator>>;

function noticeCopy(t: NoticeTranslator, notice: SetupNotice) {
  switch (notice) {
    case "planReady":
      return {
        subject: t("planReady.subject"),
        title: t("planReady.title"),
        body: t("planReady.body"),
        cta: t("planReady.cta"),
      };
    case "planFailed":
      return {
        subject: t("planFailed.subject"),
        title: t("planFailed.title"),
        body: t("planFailed.body"),
        cta: t("planFailed.cta"),
      };
    case "workspaceReady":
      return {
        subject: t("workspaceReady.subject"),
        title: t("workspaceReady.title"),
        body: t("workspaceReady.body"),
        cta: t("workspaceReady.cta"),
      };
    case "workspaceFailed":
      return {
        subject: t("workspaceFailed.subject"),
        title: t("workspaceFailed.title"),
        body: t("workspaceFailed.body"),
        cta: t("workspaceFailed.cta"),
      };
  }
}

export class WorkspaceSetupNotifier extends UserAccessor {
  constructor(
    private repo: Pick<WorkspaceSetupRepo, "get">,
    private emailService: Pick<EmailService, "send">,
  ) {
    super();
  }

  async notify(setupId: string, stage: SetupNoticeStage, now = new Date()): Promise<SetupNotice | null> {
    const setup = await this.repo.get(setupId);
    const notice = setup ? setupNotice(setup) : null;
    if (!setup || !notice || !STAGE_NOTICES[stage].has(notice) || setupWatched(setup, now)) return null;
    const user = this.user;
    const locale = resolveUserLocale(user);
    const t = await getTranslator(locale, "WorkspaceSetupNotice");
    const copy = noticeCopy(t, notice);
    const sent = await this.emailService.send({
      to: user.email,
      subject: copy.subject,
      react: createElement(WorkspaceSetupNotice, {
        locale,
        layoutCopy: await getEmailLayoutCopy(locale),
        greeting: t("greeting", { firstName: user.firstName }),
        fallback: t("fallback"),
        href: `${env.BASE_URL}/${locale}/onboarding/wizard`,
        ...copy,
      }),
    });
    return sent ? notice : null;
  }
}
