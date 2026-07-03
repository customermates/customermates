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

export function folderMessageWhere(visibleSet: string[]): Prisma.MessagingMessageWhereInput {
  return { OR: [{ folderIds: { isEmpty: true } }, { folderIds: { hasSome: visibleSet } }] };
}

export function threadFolderMembershipWhere(
  states: { id: string; visibleSet: string[] }[],
): Prisma.MessagingThreadWhereInput | null {
  if (states.length === 0) return null;

  return {
    OR: [
      { connectedAccountId: { notIn: states.map((state) => state.id) } },
      ...states.map((state) => ({
        connectedAccountId: state.id,
        messages: { some: folderMessageWhere(state.visibleSet) },
      })),
    ],
  };
}

export function calendarEventAccessWhere(companyId: string, userId: string): Prisma.CalendarEventWhereInput {
  return { companyId, connectedAccount: { is: accessibleAccountWhere(userId) } };
}

export function accountActivityAccessWhere(companyId: string, userId: string): Prisma.AccountActivityWhereInput {
  return { companyId, connectedAccount: { is: accessibleAccountWhere(userId) } };
}
