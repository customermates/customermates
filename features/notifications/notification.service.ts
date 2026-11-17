import { randomUUID } from "node:crypto";

import type { NotificationEmailMode, NotificationKind } from "@/generated/prisma";
import type { NotificationMailer } from "./notification-mailer";
import type { NotificationPauseRepo } from "./notification-pause.repo";
import type {
  InstantEmailCount,
  NotificationInsert,
  NotificationRecipient,
  NotificationRepo,
  PendingEmailNotification,
} from "./notification.repo";
import type { NotifyMembersInput } from "./notification.schema";

import * as ErrorReporter from "@/core/observability/server";

import { isNotificationPaused } from "./notification-pause";
import {
  DEFAULT_NOTIFICATION_EMAIL_MODES,
  NOTIFICATION_INSTANT_EMAILS_PER_HOUR,
  NotifyMembersSchema,
} from "./notification.schema";

const HOUR_MS = 60 * 60 * 1000;

type Preferences = ReadonlyMap<string, ReadonlyMap<NotificationKind, NotificationEmailMode>>;

type ModeOf = (userId: string, kind: NotificationKind) => NotificationEmailMode;

const DEFAULT_EMAIL_MODES: Partial<Record<NotificationKind, NotificationEmailMode>> = DEFAULT_NOTIFICATION_EMAIL_MODES;

export function effectiveEmailMode(
  preferences: ReadonlyMap<NotificationKind, NotificationEmailMode> | undefined,
  kind: NotificationKind,
): NotificationEmailMode {
  return preferences?.get(kind) ?? DEFAULT_EMAIL_MODES[kind] ?? "off";
}

function instantAllowance(userId: string, sentLastHour: InstantEmailCount[]): number {
  const sent = sentLastHour.find((entry) => entry.userId === userId)?.count ?? 0;
  return Math.max(0, NOTIFICATION_INSTANT_EMAILS_PER_HOUR - sent);
}

export class NotificationService {
  constructor(
    private readonly repo: NotificationRepo,
    private readonly mailer: NotificationMailer,
    private readonly clock: () => Date = () => new Date(),
    private readonly pauses: NotificationPauseRepo | null = null,
  ) {}

  async notify(input: NotifyMembersInput): Promise<{ created: number; emailed: number }> {
    const data = NotifyMembersSchema.parse(input);
    const recipients = await this.repo.findRecipientsUnscoped(data.companyId, [...new Set(data.recipients)]);
    if (recipients.length === 0) return { created: 0, emailed: 0 };
    const userIds = recipients.map((recipient) => recipient.id);
    const preferences = await this.repo.findPreferencesUnscoped(data.companyId, userIds);
    const now = this.clock();
    const modeOf = await this.modeOf(data.companyId, userIds, preferences, now);
    const rows: NotificationInsert[] = recipients.map((recipient) => ({
      id: randomUUID(),
      companyId: data.companyId,
      userId: recipient.id,
      kind: data.kind,
      title: data.title,
      body: data.body ?? null,
      href: data.href ?? null,
      sourceRuleId: data.sourceRuleId ?? null,
      dedupeKey: data.dedupeKey ?? null,
      emailedAt: modeOf(recipient.id, data.kind) === "off" ? now : null,
    }));
    const storedIds = new Set(await this.repo.insertManyUnscoped(rows));
    const created = rows.filter((row) => storedIds.has(row.id));
    const emailed = await this.emailInstant(data.companyId, created, recipients, modeOf, now);
    return { created: created.length, emailed };
  }

  private async modeOf(companyId: string, userIds: string[], preferences: Preferences, now: Date): Promise<ModeOf> {
    const paused = this.pauses ? await this.pauses.findUnscoped(companyId, userIds) : new Map<string, Date>();
    return (userId, kind) =>
      isNotificationPaused(paused.get(userId), now) ? "off" : effectiveEmailMode(preferences.get(userId), kind);
  }

  private async emailInstant(
    companyId: string,
    created: NotificationInsert[],
    recipients: NotificationRecipient[],
    modeOf: ModeOf,
    now: Date,
  ): Promise<number> {
    const instant = created.filter((row) => modeOf(row.userId, row.kind) === "instant");
    if (instant.length === 0) return 0;
    const byUser = new Map(recipients.map((recipient) => [recipient.id, recipient]));
    const pending = new Map(
      (
        await this.repo.findNotificationsUnscoped(
          companyId,
          instant.map((row) => row.id),
        )
      ).map((item) => [item.id, item]),
    );
    const userIds = [...new Set(instant.map((row) => row.userId))];
    const sentLastHour = await this.repo.countInstantEmailsSinceUnscoped(
      companyId,
      userIds,
      new Date(now.getTime() - HOUR_MS),
    );
    const allowance = new Map(userIds.map((userId) => [userId, instantAllowance(userId, sentLastHour)]));
    let sent = 0;
    for (const row of instant) {
      const recipient = byUser.get(row.userId);
      const notification: PendingEmailNotification | undefined = pending.get(row.id);
      if (!recipient || !notification) continue;
      const remaining = allowance.get(row.userId) ?? 0;
      if (remaining <= 0) continue;
      try {
        if (!(await this.mailer.sendInstant(recipient, notification))) continue;
        sent += 1;
        allowance.set(row.userId, remaining - 1);
        await this.repo.markEmailedUnscoped([row.id], now, "instant");
      } catch (error) {
        ErrorReporter.captureException(error, { tags: { kind: "notification-email" } });
      }
    }
    return sent;
  }
}
