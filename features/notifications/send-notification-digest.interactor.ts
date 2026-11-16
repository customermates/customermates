import type { NotificationMailer } from "./notification-mailer";
import type { NotificationRepo } from "./notification.repo";

import * as ErrorReporter from "@/core/observability/server";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

import { NOTIFICATION_DIGEST_WINDOW_HOURS, NOTIFICATION_INSTANT_FALLBACK_MINUTES } from "./notification.schema";
import { effectiveEmailMode } from "./notification.service";

const USER_BATCH_LIMIT = 500;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

@SystemInteractor
export class SendNotificationDigestInteractor {
  constructor(
    private readonly repo: NotificationRepo,
    private readonly mailer: NotificationMailer,
  ) {}

  async invoke(now = new Date()): Promise<{ notificationDigests: number }> {
    const since = new Date(now.getTime() - 2 * NOTIFICATION_DIGEST_WINDOW_HOURS * HOUR_MS);
    const instantFallbackBefore = new Date(now.getTime() - NOTIFICATION_INSTANT_FALLBACK_MINUTES * MINUTE_MS);
    let digests = 0;
    for (const { companyId, userId } of await this.repo.findDigestUsersUnscoped(since, USER_BATCH_LIMIT)) {
      const [recipient] = await this.repo.findRecipientsUnscoped(companyId, [userId]);
      if (!recipient) continue;
      const preferences = (await this.repo.findPreferencesUnscoped(companyId, [userId])).get(userId);
      const pending = (await this.repo.findUnemailedUnscoped(companyId, userId, since)).filter((item) => {
        const mode = effectiveEmailMode(preferences, item.kind);
        return mode === "digest" || (mode === "instant" && item.createdAt <= instantFallbackBefore);
      });
      if (pending.length === 0) continue;
      try {
        if (!(await this.mailer.sendDigest(recipient, pending))) continue;
      } catch (error) {
        ErrorReporter.captureException(error, { tags: { kind: "notification-digest" } });
        continue;
      }
      await this.repo.markEmailedUnscoped(
        pending.map((item) => item.id),
        now,
      );
      digests += 1;
    }
    return { notificationDigests: digests };
  }
}
