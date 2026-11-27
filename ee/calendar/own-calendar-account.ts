import type { Prisma } from "@/generated/prisma";

import { ConnectedAccountStatus, MessagingProvider } from "@/generated/prisma";

export const CALENDAR_PROVIDERS = [MessagingProvider.google, MessagingProvider.outlook];

export type PlannerEventReadOnlyReason = "series";

export function ownCalendarAccountWhere(companyId: string, userId: string): Prisma.ConnectedAccountWhereInput {
  return { companyId, userId, hasCalendar: true, provider: { in: CALENDAR_PROVIDERS } };
}

function ownWritableAccount(
  account: { userId: string; status: ConnectedAccountStatus; provider: MessagingProvider },
  userId: string,
): boolean {
  return (
    account.userId === userId &&
    account.status === ConnectedAccountStatus.ok &&
    (CALENDAR_PROVIDERS as MessagingProvider[]).includes(account.provider)
  );
}

export function plannerEventEditable(
  event: { recurrenceRule: string | null },
  account: { userId: string; status: ConnectedAccountStatus; provider: MessagingProvider },
  userId: string,
): boolean {
  return ownWritableAccount(account, userId) && !event.recurrenceRule;
}

export function plannerEventReadOnlyReason(
  event: { recurrenceRule: string | null },
  account: { userId: string; status: ConnectedAccountStatus; provider: MessagingProvider },
  userId: string,
): PlannerEventReadOnlyReason | null {
  return ownWritableAccount(account, userId) && event.recurrenceRule ? "series" : null;
}

export function plannerEventHasGuests(attendees: unknown, ownEmail: string | null): boolean {
  if (!Array.isArray(attendees)) return false;
  const own = ownEmail?.trim().toLowerCase();
  return attendees.some((attendee: unknown) => {
    if (!attendee || typeof attendee !== "object") return false;
    const { email, isOrganizer } = attendee as { email?: unknown; isOrganizer?: unknown };
    if (typeof email !== "string" || !email.trim() || isOrganizer === true) return false;
    return email.trim().toLowerCase() !== own;
  });
}
