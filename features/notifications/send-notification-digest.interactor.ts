import type { NotificationMailer } from "./notification-mailer";
import type { NotificationPauseRepo } from "./notification-pause.repo";
import type { NotificationCursor, NotificationRepo } from "./notification.repo";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

import { emailPendingNotifications } from "./pending-notification-email";
import { NOTIFICATION_DIGEST_WINDOW_HOURS, NOTIFICATION_INSTANT_FALLBACK_MINUTES } from "./notification.schema";

const DIGEST_PAGE_SIZE = 500;
const DIGEST_TIME_BUDGET_MS = 240_000;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

@SystemInteractor
export class SendNotificationDigestInteractor {
  constructor(
    private readonly repo: NotificationRepo,
    private readonly mailer: NotificationMailer,
    private readonly elapsedClock: () => number = Date.now,
    private readonly pauses: NotificationPauseRepo | null = null,
  ) {}

  async invoke(now = new Date()): Promise<{ notificationDigests: number }> {
    if (!this.mailer.isConfigured()) return { notificationDigests: 0 };
    const startedAt = this.elapsedClock();
    const selection = {
      since: new Date(now.getTime() - 2 * NOTIFICATION_DIGEST_WINDOW_HOURS * HOUR_MS),
      instantBefore: new Date(now.getTime() - NOTIFICATION_INSTANT_FALLBACK_MINUTES * MINUTE_MS),
      withDigestKinds: true,
    };
    const deps = { repo: this.repo, mailer: this.mailer, pauses: this.pauses };
    const handled = new Set<string>();
    let digests = 0;
    let after: NotificationCursor | null = null;
    do {
      const page = await this.repo.findDigestUsersUnscoped({
        since: selection.since,
        limit: DIGEST_PAGE_SIZE,
        after,
      });
      for (const user of page.users) {
        const key = `${user.companyId}:${user.userId}`;
        if (handled.has(key)) continue;
        if (this.elapsedClock() - startedAt >= DIGEST_TIME_BUDGET_MS) return { notificationDigests: digests };
        handled.add(key);
        if (await emailPendingNotifications(deps, user, selection, now)) digests += 1;
      }
      after = page.next;
    } while (after);
    return { notificationDigests: digests };
  }
}
