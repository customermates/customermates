import type { Prisma } from "@/generated/prisma";

type MessagingFolderVisibilityState = { id: string; visibleSet: string[] };

function accessibleAccountWhere(userId: string): Prisma.ConnectedAccountWhereInput {
  return { OR: [{ userId }, { shared: true }] };
}

export function accessibleConnectedAccountWhere(companyId: string, userId: string): Prisma.ConnectedAccountWhereInput {
  return { companyId, ...accessibleAccountWhere(userId) };
}

export function threadAccessWhere(companyId: string, userId: string): Prisma.MessagingThreadWhereInput {
  return {
    companyId,
    OR: [{ connectedAccount: { is: accessibleAccountWhere(userId) } }, { sharedToCrm: true }],
  };
}

export function accessibleFolderStatesWhere(companyId: string, userId: string): Prisma.ConnectedAccountWhereInput {
  return {
    companyId,
    OR: [{ userId }, { shared: true }, { threads: { some: { sharedToCrm: true } } }],
    foldersSyncedAt: { not: null },
  };
}

export function folderMessageWhere(visibleSet: string[]): Prisma.MessagingMessageWhereInput {
  return { OR: [{ folderIds: { isEmpty: true } }, { folderIds: { hasSome: visibleSet } }] };
}

export function messageVisibilityWhere(states: MessagingFolderVisibilityState[]): Prisma.MessagingMessageWhereInput {
  if (states.length === 0) return { isHidden: false };

  return {
    isHidden: false,
    OR: [
      { connectedAccountId: { notIn: states.map((state) => state.id) } },
      ...states.map((state) => ({
        connectedAccountId: state.id,
        ...folderMessageWhere(state.visibleSet),
      })),
    ],
  };
}

export function canViewAccountMessages(account: { userId: string; shared: boolean }, userId: string): boolean {
  return account.userId === userId || account.shared;
}

export function limitMessageFolderIds<T extends { folderIds: string[] }>(
  rows: T[],
  canViewAllFolders: boolean,
  folderStates: { visibleSet: string[] }[],
): T[] {
  if (canViewAllFolders || folderStates.length === 0) return rows;

  const visible = new Set(folderStates[0].visibleSet);
  return rows.map((row) => ({ ...row, folderIds: row.folderIds.filter((id) => visible.has(id)) }));
}

export function redactMessageBcc<T extends { recipients: unknown; direction: string }>(
  rows: T[],
  canViewBcc: boolean,
): T[] {
  return rows.map((row) => {
    if (row.direction === "outbound" && canViewBcc) return row;

    const recipients = row.recipients;
    if (recipients && typeof recipients === "object" && "bcc" in recipients)
      return { ...row, recipients: { ...recipients, bcc: [] } };

    return row;
  });
}

export function threadFolderMembershipWhere(
  states: MessagingFolderVisibilityState[],
): Prisma.MessagingThreadWhereInput | null {
  if (states.length === 0) return null;

  return {
    OR: [
      { connectedAccountId: { notIn: states.map((state) => state.id) } },
      ...states.map((state) => ({
        connectedAccountId: state.id,
        messages: { some: { isHidden: false, ...folderMessageWhere(state.visibleSet) } },
      })),
    ],
  };
}

export function threadHasActivityWhere(): Prisma.MessagingThreadWhereInput {
  return { OR: [{ lastMessageAt: { not: null } }, { messages: { some: { isDraft: true } } }] };
}

export function inboxThreadVisibilityWhere(
  companyId: string,
  userId: string,
  states: MessagingFolderVisibilityState[],
): Prisma.MessagingThreadWhereInput {
  const folderMembership = threadFolderMembershipWhere(states);

  return {
    ...threadAccessWhere(companyId, userId),
    AND: [threadHasActivityWhere(), ...(folderMembership ? [folderMembership] : [])],
  };
}

export function calendarAccessWhere(companyId: string, userId: string): Prisma.CalendarWhereInput {
  return { companyId, connectedAccount: { is: accessibleAccountWhere(userId) } };
}

export function calendarEventAccessWhere(companyId: string, userId: string): Prisma.CalendarEventWhereInput {
  return { companyId, connectedAccount: { is: accessibleAccountWhere(userId) } };
}

export function accountActivityAccessWhere(companyId: string, userId: string): Prisma.AccountActivityWhereInput {
  return { companyId, connectedAccount: { is: accessibleAccountWhere(userId) } };
}
