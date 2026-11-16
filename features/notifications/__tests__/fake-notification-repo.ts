import type { NotificationEmailMode, NotificationKind } from "@/generated/prisma";
import type {
  DigestUserPage,
  EmailedCount,
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
      this.rows.push({ ...insert, readAt: null, emailedAt: insert.emailedAt ?? null, createdAt: this.clock });
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

  countEmailedSinceUnscoped(companyId: string, userIds: string[], since: Date) {
    const counts = new Map<string, EmailedCount>();
    for (const row of this.rows) {
      if (row.companyId !== companyId || !userIds.includes(row.userId) || !row.emailedAt || row.emailedAt < since)
        continue;
      const key = `${row.userId}:${row.kind}`;
      const entry = counts.get(key) ?? { userId: row.userId, kind: row.kind, count: 0 };
      counts.set(key, { ...entry, count: entry.count + 1 });
    }
    return Promise.resolve([...counts.values()]);
  }

  findDigestUsersUnscoped(args: { since: Date; limit: number; after: string | null }): Promise<DigestUserPage> {
    const candidates = this.rows
      .filter((row) => !row.emailedAt && !row.readAt && row.createdAt >= args.since)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime() || (left.id < right.id ? -1 : 1));
    const start = args.after ? candidates.findIndex((row) => row.id === args.after) + 1 : 0;
    const page = candidates.slice(start, start + args.limit);
    const users = new Map(page.map((row) => [`${row.companyId}:${row.userId}`, row]));
    return Promise.resolve({
      users: [...users.values()].map(({ companyId, userId }) => ({ companyId, userId })),
      next: page.length === args.limit ? (page[page.length - 1]?.id ?? null) : null,
    });
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

  pruneUnscoped(before: Date, limit: number) {
    const expired = this.rows.filter((row) => row.createdAt < before).slice(0, limit);
    this.rows = this.rows.filter((row) => !expired.includes(row));
    return Promise.resolve(expired.length);
  }
}
