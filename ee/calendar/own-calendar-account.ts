import type { Prisma } from "@/generated/prisma";

import { ConnectedAccountStatus, MessagingProvider } from "@/generated/prisma";

export const CALENDAR_PROVIDERS = [MessagingProvider.google, MessagingProvider.outlook];

export function ownCalendarAccountWhere(companyId: string, userId: string): Prisma.ConnectedAccountWhereInput {
  return { companyId, userId, hasCalendar: true, provider: { in: CALENDAR_PROVIDERS } };
}

export function plannerEventEditable(
  event: { allDay: boolean; recurrenceRule: string | null },
  account: { userId: string; status: ConnectedAccountStatus; provider: MessagingProvider },
  userId: string,
): boolean {
  return (
    account.userId === userId &&
    account.status === ConnectedAccountStatus.ok &&
    (CALENDAR_PROVIDERS as MessagingProvider[]).includes(account.provider) &&
    !event.allDay &&
    !event.recurrenceRule
  );
}
