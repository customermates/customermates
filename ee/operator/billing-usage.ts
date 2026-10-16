import type {
  BillingUsageChannelDto,
  BillingUsageCoverage,
  BillingUsageSeatDto,
  WorkspaceBillingUsageDto,
} from "./billing-usage.schema";

import { BILLING_USAGE_MONTH_PATTERN } from "./billing-usage.schema";

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export type BillingUsageIntervalRow = {
  kind: "seat" | "channel";
  subjectId: string;
  startedAt: Date;
  endedAt: Date | null;
  startExact: boolean;
  endExact: boolean;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  roleName: string | null;
  provider: string | null;
  identifier: string | null;
};

export type BillingUsageWorkspaceRow = {
  companyId: string;
  workspaceLabel: string;
  createdAt: Date;
  deletedAt: Date | null;
  seatsRecordedFrom: Date | null;
  channelsRecordedFrom: Date | null;
  activeSeats: number;
  connectedChannels: number;
};

export type BillingUsageWindow = { month: string; from: Date; to: Date };

export function billingUsageWindow(month: string): BillingUsageWindow {
  if (!BILLING_USAGE_MONTH_PATTERN.test(month)) throw new Error(`Invalid billing usage month: ${month}`);
  const [year, monthIndex] = month.split("-").map(Number);

  return {
    month,
    from: new Date(Date.UTC(year, monthIndex - 1, 1)),
    to: new Date(Date.UTC(year, monthIndex, 1)),
  };
}

export function billingUsageMonthOf(date: Date): string {
  return `${date.getUTCFullYear()}-${`${date.getUTCMonth() + 1}`.padStart(2, "0")}`;
}

export function lastFullBillingUsageMonth(now: Date): string {
  return billingUsageMonthOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));
}

export function billingUsageMonthsBetween(first: Date, last: Date): string[] {
  const months: string[] = [];
  const cursor = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1));
  const end = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), 1));
  while (cursor.getTime() <= end.getTime()) {
    months.push(billingUsageMonthOf(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return months.reverse();
}

export function overlapsWindow(
  interval: Pick<BillingUsageIntervalRow, "startedAt" | "endedAt">,
  window: BillingUsageWindow,
) {
  return interval.startedAt < window.to && (interval.endedAt === null || interval.endedAt > window.from);
}

export function workspaceExistsIn(
  workspace: Pick<BillingUsageWorkspaceRow, "createdAt" | "deletedAt">,
  window: BillingUsageWindow,
): boolean {
  return workspace.createdAt < window.to && (workspace.deletedAt === null || workspace.deletedAt > window.from);
}

function byStart(a: BillingUsageIntervalRow, b: BillingUsageIntervalRow): number {
  return a.startedAt.getTime() - b.startedAt.getTime() || compareOrdinal(a.subjectId, b.subjectId);
}

function coverage(recordedFrom: Date | null, window: BillingUsageWindow, inexactTimes: boolean): BillingUsageCoverage {
  const recordedWholeMonth = recordedFrom === null || recordedFrom <= window.from;

  return { complete: recordedWholeMonth && !inexactTimes, recordedFrom, inexactTimes };
}

export function billedSeats(
  intervals: readonly BillingUsageIntervalRow[],
  window: BillingUsageWindow,
): BillingUsageSeatDto[] {
  const bySubject = new Map<string, BillingUsageIntervalRow[]>();
  for (const interval of intervals) {
    if (interval.kind !== "seat" || interval.startedAt >= window.to) continue;
    const history = bySubject.get(interval.subjectId) ?? [];
    history.push(interval);
    bySubject.set(interval.subjectId, history);
  }

  const seats: BillingUsageSeatDto[] = [];
  for (const [userId, history] of bySubject) {
    const overlapping = history.filter((interval) => overlapsWindow(interval, window)).sort(byStart);
    const last = overlapping.at(-1);
    if (!last) continue;
    const first = [...history].sort(byStart)[0];

    seats.push({
      userId,
      firstName: last.firstName,
      lastName: last.lastName,
      email: last.email,
      roleName: last.roleName,
      addedAt: first.startedAt,
      addedAtExact: first.startExact,
      deactivatedAt: last.endedAt,
      deactivatedAtExact: last.endExact,
    });
  }

  return seats.sort((a, b) => compareOrdinal(a.email ?? "", b.email ?? "") || compareOrdinal(a.userId, b.userId));
}

export function peakChannels(
  intervals: readonly BillingUsageIntervalRow[],
  window: BillingUsageWindow,
): { peak: number; peakAt: Date | null } {
  const overlapping = intervals.filter((interval) => interval.kind === "channel" && overlapsWindow(interval, window));
  const changes: Array<{ at: number; delta: 1 | -1 }> = [];
  let connected = 0;

  for (const interval of overlapping) {
    if (interval.startedAt <= window.from) connected += 1;
    else changes.push({ at: interval.startedAt.getTime(), delta: 1 });
    if (interval.endedAt !== null && interval.endedAt < window.to)
      changes.push({ at: interval.endedAt.getTime(), delta: -1 });
  }

  changes.sort((a, b) => a.at - b.at || a.delta - b.delta);

  let peak = connected;
  let peakAt: number | null = connected > 0 ? window.from.getTime() : null;
  for (const change of changes) {
    connected += change.delta;
    if (connected > peak) {
      peak = connected;
      peakAt = change.at;
    }
  }

  return { peak, peakAt: peakAt === null ? null : new Date(peakAt) };
}

export function billedChannels(
  intervals: readonly BillingUsageIntervalRow[],
  window: BillingUsageWindow,
): BillingUsageChannelDto[] {
  return intervals
    .filter((interval) => interval.kind === "channel" && overlapsWindow(interval, window))
    .sort(byStart)
    .map((interval) => ({
      accountId: interval.subjectId,
      provider: interval.provider,
      identifier: interval.identifier,
      connectedAt: interval.startedAt,
      connectedAtExact: interval.startExact,
      disconnectedAt: interval.endedAt,
      disconnectedAtExact: interval.endExact,
    }));
}

export function workspaceBillingUsage(args: {
  workspace: BillingUsageWorkspaceRow;
  intervals: readonly BillingUsageIntervalRow[];
  window: BillingUsageWindow;
  includeDetails: boolean;
}): WorkspaceBillingUsageDto {
  const { workspace, intervals, window, includeDetails } = args;
  const seats = billedSeats(intervals, window);
  const channels = billedChannels(intervals, window);
  const { peak, peakAt } = peakChannels(intervals, window);
  const inexactChannelTimes = channels.some((channel) => !channel.connectedAtExact || !channel.disconnectedAtExact);
  const deleted = workspace.deletedAt !== null;

  return {
    companyId: workspace.companyId,
    workspaceLabel: workspace.workspaceLabel,
    createdAt: workspace.createdAt,
    deletedAt: workspace.deletedAt,
    seats: {
      count: seats.length,
      coverage: coverage(workspace.seatsRecordedFrom, window, false),
      ...(includeDetails ? { users: seats } : {}),
    },
    channels: {
      peak,
      peakAt,
      coverage: coverage(workspace.channelsRecordedFrom, window, inexactChannelTimes),
      ...(includeDetails ? { items: channels } : {}),
    },
    current: {
      activeSeats: deleted ? 0 : workspace.activeSeats,
      connectedChannels: deleted ? 0 : workspace.connectedChannels,
    },
  };
}
