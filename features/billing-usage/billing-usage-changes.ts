import { ConnectedAccountStatus, Status } from "@/generated/prisma";

export function seatChange(subjectId: string, before: Status | null | undefined, after: Status | null): string[] {
  return (before === Status.active) !== (after === Status.active) ? [subjectId] : [];
}

export function channelChange(
  subjectId: string,
  before: ConnectedAccountStatus | null | undefined,
  after: ConnectedAccountStatus | null,
): string[] {
  const counted = (status: ConnectedAccountStatus | null | undefined) =>
    status !== null && status !== undefined && status !== ConnectedAccountStatus.deleted;

  return counted(before) !== counted(after) ? [subjectId] : [];
}
