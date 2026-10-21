import type {
  BillingUsageChannelDto,
  BillingUsageCoverageDto,
  BillingUsageSeatDto,
  OperatorBillingUsageDto,
  WorkspaceBillingUsageDto,
  WorkspaceSubscriptionDto,
} from "./billing-usage.schema";

import { SubscriptionStatus } from "@/generated/prisma";

import { BILLING_USAGE_MONTH_PATTERN } from "./billing-usage.schema";
import { operatorCollator } from "./operator-collator";

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
  ownerEmail: string | null;
  createdAt: Date;
  deletedAt: Date | null;
  seatsRecordedFrom: Date | null;
  channelsRecordedFrom: Date | null;
  activeSeats: number;
  connectedChannels: number;
  subscription: WorkspaceSubscriptionDto | null;
};

type BillingUsageWindow = { month: string; from: Date; to: Date };

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

function overlapsWindow(interval: Pick<BillingUsageIntervalRow, "startedAt" | "endedAt">, window: BillingUsageWindow) {
  return interval.startedAt < window.to && (interval.endedAt === null || interval.endedAt > window.from);
}

export function workspaceExistsIn(
  workspace: Pick<BillingUsageWorkspaceRow, "createdAt" | "deletedAt">,
  window: BillingUsageWindow,
): boolean {
  return workspace.createdAt < window.to && (workspace.deletedAt === null || workspace.deletedAt > window.from);
}

function byStart(a: BillingUsageIntervalRow, b: BillingUsageIntervalRow): number {
  return a.startedAt.getTime() - b.startedAt.getTime() || operatorCollator().compare(a.subjectId, b.subjectId);
}

function coverage(
  recordedFrom: Date | null,
  window: BillingUsageWindow,
  inexactTimes: boolean,
): BillingUsageCoverageDto {
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

  return seats.sort(
    (a, b) =>
      operatorCollator().compare(a.email ?? "", b.email ?? "") || operatorCollator().compare(a.userId, b.userId),
  );
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

function billedChannels(
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

export const OBSERVATION_LAG_MS = 72 * 60 * 60 * 1000;

function startsJustAfter(interval: BillingUsageIntervalRow, window: BillingUsageWindow): boolean {
  return interval.startedAt >= window.to && interval.startedAt.getTime() < window.to.getTime() + OBSERVATION_LAG_MS;
}

function inexactSeatTimes(intervals: readonly BillingUsageIntervalRow[], window: BillingUsageWindow): boolean {
  const until = window.to.getTime() + OBSERVATION_LAG_MS;
  const near = (time: Date | null) => time !== null && time >= window.from && time.getTime() < until;

  return intervals.some(
    (interval) =>
      interval.kind === "seat" &&
      ((!interval.startExact && near(interval.startedAt)) || (!interval.endExact && near(interval.endedAt))),
  );
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
  const inexactChannelTimes =
    channels.some((channel) => !channel.connectedAtExact || !channel.disconnectedAtExact) ||
    intervals.some(
      (interval) => interval.kind === "channel" && !interval.startExact && startsJustAfter(interval, window),
    );
  const deleted = workspace.deletedAt !== null;

  return {
    companyId: workspace.companyId,
    workspaceLabel: workspace.workspaceLabel,
    ownerEmail: workspace.ownerEmail,
    createdAt: workspace.createdAt,
    deletedAt: workspace.deletedAt,
    seats: {
      count: seats.length,
      coverage: coverage(workspace.seatsRecordedFrom, window, inexactSeatTimes(intervals, window)),
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
    subscription: deleted ? null : workspace.subscription,
  };
}

export function subscriptionSummary(
  workspaces: readonly WorkspaceBillingUsageDto[],
): OperatorBillingUsageDto["subscriptions"] {
  const groups = new Map<string, OperatorBillingUsageDto["subscriptions"]["groups"][number]>();
  let count = 0;
  let paying = 0;

  for (const workspace of workspaces) {
    const { subscription } = workspace;
    if (!subscription) continue;
    count += 1;
    if (subscription.status === SubscriptionStatus.active) paying += 1;
    const key = `${subscription.billing}|${subscription.plan}|${subscription.status}`;
    const group = groups.get(key) ?? {
      billing: subscription.billing,
      plan: subscription.plan,
      status: subscription.status,
      workspaces: 0,
      activeSeats: 0,
    };
    group.workspaces += 1;
    group.activeSeats += workspace.current.activeSeats;
    groups.set(key, group);
  }

  return {
    workspaces: count,
    paying,
    groups: [...groups.values()].sort(
      (a, b) =>
        b.workspaces - a.workspaces ||
        operatorCollator().compare(a.billing, b.billing) ||
        operatorCollator().compare(a.plan, b.plan) ||
        operatorCollator().compare(a.status, b.status),
    ),
  };
}
