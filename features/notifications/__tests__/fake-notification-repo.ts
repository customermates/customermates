import type { NotificationEmailMode, NotificationKind } from "@/generated/prisma";
import type {
  DigestSelection,
  DigestUserPage,
  EmailDelivery,
  InboxCursor,
  InstantEmailCount,
  NotificationCursor,
  NotificationInsert,
  NotificationPreferenceRow,
  NotificationRecipient,
  PendingEmailNotification,
} from "../notification.repo";

import { NotificationRepo } from "../notification.repo";
import { NOTIFICATION_DIGEST_LIMIT } from "../notification.schema";

type Row = NotificationInsert & {
  readAt: Date | null;
  emailedAt: Date | null;
  emailedInstantly?: boolean;
  createdAt: Date;
};

function oldestFirst(left: Row, right: Row): number {
  return left.createdAt.getTime() - right.createdAt.getTime() || (left.id < right.id ? -1 : 1);
}

export class FakeNotificationRepo extends NotificationRepo {
  rows: Row[] = [];
  members: NotificationRecipient[] = [];
  preferences = new Map<string, Map<NotificationKind, NotificationEmailMode>>();
  ruleNames = new Map<string, string>();
  unscopedSaves: { companyId: string; userId: string; kind: NotificationKind; emailMode: NotificationEmailMode }[] = [];
  currentUserId = "";
  currentCompanyId = "";
  clock = new Date("2026-11-12T10:00:00.000Z");

  private visible() {
    return this.rows.filter((row) => row.companyId === this.currentCompanyId && row.userId === this.currentUserId);
  }

  findInbox(args: { limit: number; unreadOnly: boolean; before: InboxCursor | null }) {
    const { before } = args;
    const older = (row: Row) =>
      !before ||
      row.createdAt < before.createdAt ||
      (before.id !== null && row.createdAt.getTime() === before.createdAt.getTime() && row.id > before.id);
    return Promise.resolve(
      this.visible()
        .filter((row) => (!args.unreadOnly || !row.readAt) && older(row))
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime() || (left.id < right.id ? -1 : 1))
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

  insertManyUnscoped(companyId: string, inserts: NotificationInsert[]) {
    const stored: string[] = [];
    for (const insert of inserts.filter((row) => row.companyId === companyId)) {
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

  saveEmailModeUnscoped(companyId: string, userId: string, kind: NotificationKind, emailMode: NotificationEmailMode) {
    const own = this.preferences.get(userId) ?? new Map<NotificationKind, NotificationEmailMode>();
    own.set(kind, emailMode);
    this.preferences.set(userId, own);
    this.unscopedSaves.push({ companyId, userId, kind, emailMode });
    return Promise.resolve();
  }

  private pending(row: Row): PendingEmailNotification {
    return { ...row, sourceRuleName: row.sourceRuleId ? (this.ruleNames.get(row.sourceRuleId) ?? null) : null };
  }

  findNotificationsUnscoped(companyId: string, ids: string[]): Promise<PendingEmailNotification[]> {
    return Promise.resolve(
      this.rows.filter((row) => row.companyId === companyId && ids.includes(row.id)).map((row) => this.pending(row)),
    );
  }

  markEmailedFailure: Error | null = null;

  markEmailedUnscoped(companyId: string, ids: string[], now: Date, delivery: EmailDelivery) {
    if (this.markEmailedFailure) return Promise.reject(this.markEmailedFailure);
    for (const row of this.rows) {
      if (row.companyId !== companyId || !ids.includes(row.id)) continue;
      row.emailedAt = now;
      row.emailedInstantly = delivery === "instant";
    }
    return Promise.resolve();
  }

  countInstantEmailsSinceUnscoped(companyId: string, userIds: string[], since: Date) {
    const counts = new Map<string, InstantEmailCount>();
    for (const row of this.rows) {
      const counted =
        row.companyId === companyId &&
        userIds.includes(row.userId) &&
        row.emailedInstantly === true &&
        row.emailedAt !== null &&
        row.emailedAt >= since;
      if (!counted) continue;
      const entry = counts.get(row.userId) ?? { userId: row.userId, count: 0 };
      counts.set(row.userId, { ...entry, count: entry.count + 1 });
    }
    return Promise.resolve([...counts.values()]);
  }

  findDigestUsersUnscoped(args: {
    since: Date;
    limit: number;
    after: NotificationCursor | null;
  }): Promise<DigestUserPage> {
    const { after } = args;
    const beyond = (row: Row) =>
      !after ||
      row.createdAt > after.createdAt ||
      (row.createdAt.getTime() === after.createdAt.getTime() && row.id > after.id);
    const page = this.rows
      .filter((row) => !row.emailedAt && !row.readAt && row.createdAt >= args.since && beyond(row))
      .sort(oldestFirst)
      .slice(0, args.limit);
    const users = new Map(page.map((row) => [`${row.companyId}:${row.userId}`, row]));
    const last = page.at(-1);
    return Promise.resolve({
      users: [...users.values()].map(({ companyId, userId }) => ({ companyId, userId })),
      next: page.length === args.limit && last ? { createdAt: last.createdAt, id: last.id } : null,
    });
  }

  findUnemailedUnscoped(
    companyId: string,
    userId: string,
    selection: DigestSelection,
  ): Promise<PendingEmailNotification[]> {
    const due = (row: Row) =>
      selection.digestKinds.includes(row.kind) ||
      (selection.instantKinds.includes(row.kind) && row.createdAt <= selection.instantBefore);
    return Promise.resolve(
      this.rows
        .filter(
          (row) =>
            row.companyId === companyId &&
            row.userId === userId &&
            !row.emailedAt &&
            !row.readAt &&
            row.createdAt >= selection.since &&
            due(row),
        )
        .sort(oldestFirst)
        .slice(0, NOTIFICATION_DIGEST_LIMIT)
        .map((row) => this.pending(row)),
    );
  }

  pruneUnscoped(before: Date, limit: number) {
    const expired = this.rows.filter((row) => row.createdAt < before).slice(0, limit);
    this.rows = this.rows.filter((row) => !expired.includes(row));
    return Promise.resolve(expired.length);
  }
}
