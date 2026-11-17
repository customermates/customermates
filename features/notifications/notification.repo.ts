import type { Locale, NotificationEmailMode, NotificationKind } from "@/generated/prisma";

export type StoredNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  href: string | null;
  readAt: Date | null;
  createdAt: Date;
};

export type NotificationInsert = {
  id: string;
  companyId: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  href: string | null;
  sourceRuleId: string | null;
  dedupeKey: string | null;
  emailedAt?: Date | null;
};

export type EmailedCount = { userId: string; kind: NotificationKind; count: number };

export type DigestUserPage = { users: { companyId: string; userId: string }[]; next: string | null };

export type NotificationRecipient = {
  id: string;
  email: string;
  firstName: string;
  displayLanguage: Locale | null;
  workspaceSlug: string;
};

export type PendingEmailNotification = StoredNotification & {
  companyId: string;
  userId: string;
  sourceRuleId: string | null;
  sourceRuleName: string | null;
};

export type NotificationPreferenceRow = { kind: NotificationKind; emailMode: NotificationEmailMode };

export abstract class NotificationRepo {
  abstract findInbox(args: { limit: number; unreadOnly: boolean; before: Date | null }): Promise<StoredNotification[]>;
  abstract countUnread(): Promise<number>;
  abstract markRead(ids: string[], now: Date): Promise<number>;
  abstract markAllRead(now: Date): Promise<number>;
  abstract findPreferences(): Promise<NotificationPreferenceRow[]>;
  abstract savePreferences(preferences: NotificationPreferenceRow[]): Promise<void>;

  abstract saveEmailModeUnscoped(
    companyId: string,
    userId: string,
    kind: NotificationKind,
    emailMode: NotificationEmailMode,
  ): Promise<void>;
  abstract insertManyUnscoped(rows: NotificationInsert[]): Promise<string[]>;
  abstract findRecipientsUnscoped(companyId: string, userIds: string[]): Promise<NotificationRecipient[]>;
  abstract findPreferencesUnscoped(
    companyId: string,
    userIds: string[],
  ): Promise<Map<string, Map<NotificationKind, NotificationEmailMode>>>;
  abstract findNotificationsUnscoped(companyId: string, ids: string[]): Promise<PendingEmailNotification[]>;
  abstract markEmailedUnscoped(ids: string[], now: Date): Promise<void>;
  abstract countEmailedSinceUnscoped(companyId: string, userIds: string[], since: Date): Promise<EmailedCount[]>;
  abstract findDigestUsersUnscoped(args: { since: Date; limit: number; after: string | null }): Promise<DigestUserPage>;
  abstract findUnemailedUnscoped(companyId: string, userId: string, since: Date): Promise<PendingEmailNotification[]>;
  abstract pruneUnscoped(before: Date, limit: number): Promise<number>;
}
