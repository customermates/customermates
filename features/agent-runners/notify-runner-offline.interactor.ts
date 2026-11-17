import type { AppLocale } from "@/i18n/locale-registry";
import type { NotificationService } from "@/features/notifications/notification.service";
import type { AgentRunnerRepo } from "./agent-runner.repo";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { resolveUserLocale } from "@/i18n/user-locale";

import { AGENT_RUNNER_LIMITS } from "./agent-runner.schema";

export type RunnerOfflineCopy = { title: string; body: string };

export const RUNNER_SETTINGS_HREF = "/settings/connections?tab=agents";

export function runnerOfflineDedupeKey(lastSeenAt: Date | null): string {
  return `runner-offline:${lastSeenAt ? lastSeenAt.toISOString() : "never"}`;
}

@SystemInteractor
export class NotifyRunnerOfflineInteractor {
  constructor(
    private readonly repo: Pick<AgentRunnerRepo, "findWaitingOwnersUnscoped">,
    private readonly notifications: Pick<NotificationService, "notify">,
    private readonly copy: (locale: AppLocale) => Promise<RunnerOfflineCopy>,
  ) {}

  async invoke(args: { now?: Date } = {}): Promise<{ runnerOfflineNotified: number }> {
    const now = args.now ?? new Date();
    const owners = await this.repo.findWaitingOwnersUnscoped({
      seenSince: new Date(now.getTime() - AGENT_RUNNER_LIMITS.offlineAfterMs),
    });
    let notified = 0;
    for (const owner of owners) {
      const { title, body } = await this.copy(resolveUserLocale(owner));
      const { created } = await this.notifications.notify({
        companyId: owner.companyId,
        recipients: [owner.userId],
        kind: "ruleAlert",
        title,
        body,
        href: RUNNER_SETTINGS_HREF,
        dedupeKey: runnerOfflineDedupeKey(owner.lastSeenAt),
      });
      notified += created;
    }
    return { runnerOfflineNotified: notified };
  }
}
