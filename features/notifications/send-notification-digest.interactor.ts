import type { NotificationMailer } from "./notification-mailer";
import type { NotificationRepo } from "./notification.repo";

import * as ErrorReporter from "@/core/observability/server";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

import {
  NOTIFICATION_DIGEST_WINDOW_HOURS,
  NOTIFICATION_RETENTION_DAYS,
} from "./notification.schema";
import { effectiveEmailMode } from "./notification.service";

const USER_BATCH_LIMIT = 500;
const HOUR_MS = 60 * 60 * 1000;

@SystemInteractor
export class SendNotificationDigestInteractor {
  constructor(
    private readonly repo: NotificationRepo,
    private readonly mailer: NotificationMailer,
  ) {}

  async invoke(now = new Date()): Promise<{ notificationDigests: number; notificationsPruned: number }> {
    const since = new Date(now.getTime() - 2 * NOTIFICATION_DIGEST_WINDOW_HOURS * HOUR_MS);
    let digests = 0;
    for (const { companyId, userId } of await this.repo.findDigestUsersUnscoped(since, USER_BATCH_LIMIT)) {
      const [recipient] = await this.repo.findRecipientsUnscoped(companyId, [userId]);
      if (!recipient) continue;
      const preferences = (await this.repo.findPreferencesUnscoped(companyId, [userId])).get(userId);
      const pending = (await this.repo.findUnemailedUnscoped(companyId, userId, since)).filter(
        (item) => effectiveEmailMode(preferences, item.kind) === "digest",
      );
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
    const pruned = await this.repo.pruneUnscoped(new Date(now.getTime() - NOTIFICATION_RETENTION_DAYS * 24 * HOUR_MS));
    return { notificationDigests: digests, notificationsPruned: pruned };
  }
}
