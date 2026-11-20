import type { Prisma } from "@/generated/prisma";

import { MessagingProvider } from "@/generated/prisma";

export const CALENDAR_PROVIDERS = [MessagingProvider.google, MessagingProvider.outlook];

export function ownCalendarAccountWhere(companyId: string, userId: string): Prisma.ConnectedAccountWhereInput {
  return { companyId, userId, hasCalendar: true, provider: { in: CALENDAR_PROVIDERS } };
}
