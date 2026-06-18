import type { Prisma } from "@/generated/prisma";

function accessibleAccountWhere(userId: string): Prisma.ConnectedAccountWhereInput {
  return { OR: [{ userId }, { shared: true }] };
}

export function threadAccessWhere(companyId: string, userId: string): Prisma.MessagingThreadWhereInput {
  return {
    companyId,
    OR: [{ connectedAccount: { is: accessibleAccountWhere(userId) } }, { sharedToCrm: true }],
  };
}

export function calendarEventAccessWhere(companyId: string, userId: string): Prisma.CalendarEventWhereInput {
  return { companyId, connectedAccount: { is: accessibleAccountWhere(userId) } };
}

export function accountActivityAccessWhere(companyId: string, userId: string): Prisma.AccountActivityWhereInput {
  return { companyId, connectedAccount: { is: accessibleAccountWhere(userId) } };
}
