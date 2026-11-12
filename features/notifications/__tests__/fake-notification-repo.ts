import type { NotificationEmailMode, NotificationKind } from "@/generated/prisma";
import type {
  NotificationInsert,
  NotificationPreferenceRow,
  NotificationRecipient,
  PendingEmailNotification,
} from "../notification.repo";

import { NotificationRepo } from "../notification.repo";

type Row = NotificationInsert & { readAt: Date | null; emailedAt: Date | null; createdAt: Date };

export class FakeNotificationRepo extends NotificationRepo {
  rows: Row[] = [];
  members: NotificationRecipient[] = [];
  preferences = new Map<string, Map<NotificationKind, NotificationEmailMode>>();
  currentUserId = "";
  currentCompanyId = "";
  clock = new Date("2026-11-12T10:00:00.000Z");

  private visible() {
    return this.rows.filter((row) => row.companyId === this.currentCompanyId && row.userId === this.currentUserId);
  }

  findInbox(args: { limit: number; unreadOnly: boolean; before: Date | null }) {
    return Promise.resolve(
      this.visible()
        .filter((row) => (!args.unreadOnly || !row.readAt) && (!args.before || row.createdAt < args.before))
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
        .slice(0, args.limit),
    );
  }

  countUnread() {
    return Promise.resolve(this.visible().filter((row) => !row.readAt).length);
  }

  markRead(ids: string[], now: Date) {
    const marked = this.visible().filter((row) => ids.includes(row.id) && !row.readAt);
    for (const row of marked) row.readAt = now;
    return Promise.resolve(marked.length);
  }

  markAllRead(now: Date) {
    const marked = this.visible().filter((row) => !row.readAt);
    for (const row of marked) row.readAt = now;
    return Promise.resolve(marked.length);
  }

  findPreferences(): Promise<NotificationPreferenceRow[]> {
    const own = this.preferences.get(this.currentUserId);
    return Promise.resolve([...(own ?? [])].map(([kind, emailMode]) => ({ kind, emailMode })));
  }

  savePreferences(preferences: NotificationPreferenceRow[]) {
    const own = this.preferences.get(this.currentUserId) ?? new Map<NotificationKind, NotificationEmailMode>();
    for (const preference of preferences) own.set(preference.kind, preference.emailMode);
    this.preferences.set(this.currentUserId, own);
    return Promise.resolve();
  }

  insertManyUnscoped(inserts: NotificationInsert[]) {
    const stored: string[] = [];
    for (const insert of inserts) {
      const duplicate =
        insert.dedupeKey !== null &&
        this.rows.some(
          (row) =>
            row.companyId === insert.companyId && row.userId === insert.userId && row.dedupeKey === insert.dedupeKey,
        );
      if (duplicate) continue;
      this.rows.push({ ...insert, readAt: null, emailedAt: null, createdAt: this.clock });
      stored.push(insert.id);
    }
    return Promise.resolve(stored);
  }

  findRecipientsUnscoped(_companyId: string, userIds: string[]) {
    return Promise.resolve(this.members.filter((member) => userIds.includes(member.id)));
  }

  findPreferencesUnscoped(_companyId: string, userIds: string[]) {
    return Promise.resolve(new Map([...this.preferences].filter(([userId]) => userIds.includes(userId))));
  }

  findNotificationsUnscoped(companyId: string, ids: string[]): Promise<PendingEmailNotification[]> {
    return Promise.resolve(this.rows.filter((row) => row.companyId === companyId && ids.includes(row.id)));
  }

  markEmailedUnscoped(ids: string[], now: Date) {
    for (const row of this.rows) if (ids.includes(row.id)) row.emailedAt = now;
    return Promise.resolve();
  }

  findDigestUsersUnscoped(since: Date, limit: number) {
    const keys = new Map<string, { companyId: string; userId: string }>();
    for (const row of this.rows)
      if (!row.emailedAt && !row.readAt && row.createdAt >= since)
        keys.set(`${row.companyId}:${row.userId}`, { companyId: row.companyId, userId: row.userId });
    return Promise.resolve([...keys.values()].slice(0, limit));
  }

  findUnemailedUnscoped(companyId: string, userId: string, since: Date): Promise<PendingEmailNotification[]> {
    return Promise.resolve(
      this.rows.filter(
        (row) =>
          row.companyId === companyId &&
          row.userId === userId &&
          !row.emailedAt &&
          !row.readAt &&
          row.createdAt >= since,
      ),
    );
  }

  pruneUnscoped(before: Date) {
    const kept = this.rows.filter((row) => row.createdAt >= before);
    const removed = this.rows.length - kept.length;
    this.rows = kept;
    return Promise.resolve(removed);
  }
}
