import type { NotificationEmailMode } from "@/generated/prisma";
import type { NotificationMailer } from "./notification-mailer";
import type { NotificationPauseRepo } from "./notification-pause.repo";
import type { NotificationRepo } from "./notification.repo";

import * as ErrorReporter from "@/core/observability/server";

import { isNotificationPaused } from "./notification-pause";
import { NOTIFICATION_KINDS } from "./notification.schema";
import { effectiveEmailMode } from "./notification.service";

export type PendingEmailUser = { companyId: string; userId: string };

export type PendingEmailSelection = {
  since: Date;
  instantBefore: Date;
  withDigestKinds: boolean;
};

export type PendingEmailDeps = {
  repo: NotificationRepo;
  mailer: NotificationMailer;
  pauses: NotificationPauseRepo | null;
};

export async function emailPendingNotifications(
  { repo, mailer, pauses }: PendingEmailDeps,
  { companyId, userId }: PendingEmailUser,
  selection: PendingEmailSelection,
  now: Date,
): Promise<boolean> {
  const [recipient] = await repo.findRecipientsUnscoped(companyId, [userId]);
  if (!recipient) return false;
  if (pauses && isNotificationPaused((await pauses.findUnscoped(companyId, [userId])).get(userId), now)) return false;
  const preferences = (await repo.findPreferencesUnscoped(companyId, [userId])).get(userId);
  const kindsIn = (mode: NotificationEmailMode) =>
    NOTIFICATION_KINDS.filter((kind) => effectiveEmailMode(preferences, kind) === mode);
  const pending = await repo.findUnemailedUnscoped(companyId, userId, {
    since: selection.since,
    digestKinds: selection.withDigestKinds ? kindsIn("digest") : [],
    instantKinds: kindsIn("instant"),
    instantBefore: selection.instantBefore,
  });
  if (pending.length === 0) return false;
  try {
    const single = !selection.withDigestKinds && pending.length === 1;
    const accepted = single
      ? await mailer.sendInstant(recipient, pending[0])
      : await mailer.sendDigest(recipient, pending);
    if (!accepted) return false;
    await repo.markEmailedUnscoped(
      companyId,
      pending.map((item) => item.id),
      now,
      "digest",
    );
  } catch (error) {
    ErrorReporter.captureException(error, { tags: { kind: "notification-digest" } });
    return false;
  }
  return true;
}
