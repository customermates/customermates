import type { AppLocale } from "@/i18n/locale-registry";
import type { NotificationService } from "@/features/notifications/notification.service";
import type { AgentRunnerOwner, AgentRunnerRepo } from "./agent-runner.repo";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { resolveUserLocale } from "@/i18n/user-locale";

import { AGENT_RUNNER_LIMITS } from "./agent-runner.schema";

export type RunnerOfflineCopy = { title: string; body: string };

export const RUNNER_SETTINGS_HREF = "/settings/connections?tab=agents";

function ownersByLocale(owners: AgentRunnerOwner[]): Map<AppLocale, string[]> {
  const grouped = new Map<AppLocale, string[]>();
  for (const owner of owners) {
    const locale = resolveUserLocale(owner);
    grouped.set(locale, [...(grouped.get(locale) ?? []), owner.userId]);
  }
  return grouped;
}

@SystemInteractor
export class NotifyRunnerOfflineInteractor {
  constructor(
    private readonly repo: Pick<AgentRunnerRepo, "findOfflineWorkspacesUnscoped">,
    private readonly notifications: Pick<NotificationService, "notify">,
    private readonly copy: (locale: AppLocale) => Promise<RunnerOfflineCopy>,
  ) {}

  async invoke(args: { now?: Date } = {}): Promise<{ runnerOfflineNotified: number }> {
    const now = args.now ?? new Date();
    const workspaces = await this.repo.findOfflineWorkspacesUnscoped({
      seenSince: new Date(now.getTime() - AGENT_RUNNER_LIMITS.offlineAfterMs),
    });
    const hour = now.toISOString().slice(0, 13);
    let notified = 0;
    for (const workspace of workspaces) {
      for (const [locale, recipients] of ownersByLocale(workspace.owners)) {
        const { title, body } = await this.copy(locale);
        const { created } = await this.notifications.notify({
          companyId: workspace.companyId,
          recipients,
          kind: "ruleAlert",
          title,
          body,
          href: RUNNER_SETTINGS_HREF,
          dedupeKey: `runner-offline:${hour}`,
        });
        notified += created;
      }
    }
    return { runnerOfflineNotified: notified };
  }
}
