import type { NotificationMailer } from "./notification-mailer";
import type { NotificationRepo } from "./notification.repo";

import * as ErrorReporter from "@/core/observability/server";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

import { NOTIFICATION_DIGEST_WINDOW_HOURS, NOTIFICATION_INSTANT_FALLBACK_MINUTES } from "./notification.schema";
import { effectiveEmailMode } from "./notification.service";

const DIGEST_PAGE_SIZE = 500;
const DIGEST_TIME_BUDGET_MS = 240_000;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

type DigestUser = { companyId: string; userId: string };

@SystemInteractor
export class SendNotificationDigestInteractor {
  constructor(
    private readonly repo: NotificationRepo,
    private readonly mailer: NotificationMailer,
    private readonly elapsedClock: () => number = Date.now,
  ) {}

  async invoke(now = new Date()): Promise<{ notificationDigests: number }> {
    const startedAt = this.elapsedClock();
    const since = new Date(now.getTime() - 2 * NOTIFICATION_DIGEST_WINDOW_HOURS * HOUR_MS);
    const instantFallbackBefore = new Date(now.getTime() - NOTIFICATION_INSTANT_FALLBACK_MINUTES * MINUTE_MS);
    const handled = new Set<string>();
    let digests = 0;
    let after: string | null = null;
    do {
      const page = await this.repo.findDigestUsersUnscoped({ since, limit: DIGEST_PAGE_SIZE, after });
      for (const user of page.users) {
        const key = `${user.companyId}:${user.userId}`;
        if (handled.has(key)) continue;
        if (this.elapsedClock() - startedAt >= DIGEST_TIME_BUDGET_MS) return { notificationDigests: digests };
        handled.add(key);
        if (await this.sendDigest(user, since, instantFallbackBefore, now)) digests += 1;
      }
      after = page.next;
    } while (after);
    return { notificationDigests: digests };
  }

  private async sendDigest(user: DigestUser, since: Date, instantFallbackBefore: Date, now: Date): Promise<boolean> {
    const { companyId, userId } = user;
    const [recipient] = await this.repo.findRecipientsUnscoped(companyId, [userId]);
    if (!recipient) return false;
    const preferences = (await this.repo.findPreferencesUnscoped(companyId, [userId])).get(userId);
    const pending = (await this.repo.findUnemailedUnscoped(companyId, userId, since)).filter((item) => {
      const mode = effectiveEmailMode(preferences, item.kind);
      return mode === "digest" || (mode === "instant" && item.createdAt <= instantFallbackBefore);
    });
    if (pending.length === 0) return false;
    try {
      if (!(await this.mailer.sendDigest(recipient, pending))) return false;
    } catch (error) {
      ErrorReporter.captureException(error, { tags: { kind: "notification-digest" } });
      return false;
    }
    await this.repo.markEmailedUnscoped(
      pending.map((item) => item.id),
      now,
    );
    return true;
  }
}
