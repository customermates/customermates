import type { NotificationMailer } from "./notification-mailer";
import type { NotificationPauseRepo } from "./notification-pause.repo";
import type { NotificationRepo } from "./notification.repo";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

import { emailPendingNotifications } from "./pending-notification-email";
import { NOTIFICATION_DIGEST_WINDOW_HOURS, NOTIFICATION_INSTANT_FALLBACK_MINUTES } from "./notification.schema";

export const INSTANT_FALLBACK_MEMBERS_PER_TICK = 500;
export const INSTANT_FALLBACK_MAILS_PER_TICK = 100;

const INSTANT_FALLBACK_TIME_BUDGET_MS = 60_000;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

@SystemInteractor
export class SendInstantNotificationFallbackInteractor {
  constructor(
    private readonly repo: NotificationRepo,
    private readonly mailer: NotificationMailer,
    private readonly elapsedClock: () => number = Date.now,
    private readonly pauses: NotificationPauseRepo | null = null,
  ) {}

  async invoke(now = new Date()): Promise<{ instantNotificationFallbacks: number }> {
    if (!this.mailer.isConfigured()) return { instantNotificationFallbacks: 0 };
    const startedAt = this.elapsedClock();
    const selection = {
      since: new Date(now.getTime() - 2 * NOTIFICATION_DIGEST_WINDOW_HOURS * HOUR_MS),
      instantBefore: new Date(now.getTime() - NOTIFICATION_INSTANT_FALLBACK_MINUTES * MINUTE_MS),
      withDigestKinds: false,
    };
    const deps = { repo: this.repo, mailer: this.mailer, pauses: this.pauses };
    const members = await this.repo.findInstantFallbackUsersUnscoped({
      since: selection.since,
      before: selection.instantBefore,
      now,
      limit: INSTANT_FALLBACK_MEMBERS_PER_TICK,
    });
    let sent = 0;
    for (const member of members) {
      if (sent >= INSTANT_FALLBACK_MAILS_PER_TICK) break;
      if (this.elapsedClock() - startedAt >= INSTANT_FALLBACK_TIME_BUDGET_MS) break;
      if (await emailPendingNotifications(deps, member, selection, now)) sent += 1;
    }
    return { instantNotificationFallbacks: sent };
  }
}
