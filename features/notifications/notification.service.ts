import { randomUUID } from "node:crypto";

import type { NotificationEmailMode, NotificationKind } from "@/generated/prisma";
import type { NotificationMailer } from "./notification-mailer";
import type { NotificationInsert, NotificationRepo, PendingEmailNotification } from "./notification.repo";
import type { NotifyMembersInput } from "./notification.schema";

import * as ErrorReporter from "@/core/observability/server";

import { DEFAULT_NOTIFICATION_EMAIL_MODES, NotifyMembersSchema } from "./notification.schema";

export function effectiveEmailMode(
  preferences: ReadonlyMap<NotificationKind, NotificationEmailMode> | undefined,
  kind: NotificationKind,
): NotificationEmailMode {
  return preferences?.get(kind) ?? DEFAULT_NOTIFICATION_EMAIL_MODES[kind];
}

export class NotificationService {
  constructor(
    private readonly repo: NotificationRepo,
    private readonly mailer: NotificationMailer,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async notify(input: NotifyMembersInput): Promise<{ created: number; emailed: number }> {
    const data = NotifyMembersSchema.parse(input);
    const recipients = await this.repo.findRecipientsUnscoped(data.companyId, [...new Set(data.recipients)]);
    if (recipients.length === 0) return { created: 0, emailed: 0 };
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
    }));
    const storedIds = new Set(await this.repo.insertManyUnscoped(rows));
    const created = rows.filter((row) => storedIds.has(row.id));
    const emailed = await this.emailInstant(data.companyId, created, recipients);
    return { created: created.length, emailed };
  }

  private async emailInstant(
    companyId: string,
    created: NotificationInsert[],
    recipients: Awaited<ReturnType<NotificationRepo["findRecipientsUnscoped"]>>,
  ): Promise<number> {
    if (created.length === 0) return 0;
    const preferences = await this.repo.findPreferencesUnscoped(
      companyId,
      created.map((row) => row.userId),
    );
    const byUser = new Map(recipients.map((recipient) => [recipient.id, recipient]));
    const pending = new Map(
      (
        await this.repo.findNotificationsUnscoped(
          companyId,
          created.map((row) => row.id),
        )
      ).map((item) => [item.id, item]),
    );
    const sent: string[] = [];
    for (const row of created) {
      const recipient = byUser.get(row.userId);
      const notification: PendingEmailNotification | undefined = pending.get(row.id);
      if (!recipient || !notification) continue;
      if (effectiveEmailMode(preferences.get(row.userId), row.kind) !== "instant") continue;
      try {
        if (await this.mailer.sendInstant(recipient, notification)) sent.push(row.id);
      } catch (error) {
        ErrorReporter.captureException(error, { tags: { kind: "notification-email" } });
      }
    }
    await this.repo.markEmailedUnscoped(sent, this.clock());
    return sent.length;
  }
}
