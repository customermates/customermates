export const SECOND_WEEK_FIRST_DAY_OFFSET = 7;
export const SECOND_WEEK_LAST_DAY_OFFSET = 14;

export const NOT_ACTIVE_REASONS = [
  "setupNotCompleted",
  "noAgentOrChannelConnected",
  "secondWeekNotReached",
  "noChangeInSecondWeek",
] as const;
export type NotActiveReason = (typeof NOT_ACTIVE_REASONS)[number];

export type ActiveWorkspaceFacts = {
  createdAt: Date;
  setupCompletedAt: Date | null;
  agentConnectedAt: Date | null;
  channelConnectedAt: Date | null;
  changeInSecondWeekAt: Date | null;
};

export type ActiveWorkspaceResult =
  | { active: true; activeSince: Date; notActiveBecause: null }
  | { active: false; activeSince: null; notActiveBecause: NotActiveReason };

const DAY_MS = 24 * 60 * 60 * 1000;

export function secondWeekWindow(createdAt: Date): { from: Date; to: Date } {
  return {
    from: new Date(createdAt.getTime() + SECOND_WEEK_FIRST_DAY_OFFSET * DAY_MS),
    to: new Date(createdAt.getTime() + SECOND_WEEK_LAST_DAY_OFFSET * DAY_MS),
  };
}

export function earliestOf(...dates: ReadonlyArray<Date | null>): Date | null {
  const present = dates.filter((date): date is Date => date !== null);
  return present.length === 0 ? null : new Date(Math.min(...present.map((date) => date.getTime())));
}

function latestOf(...dates: readonly Date[]): Date {
  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

function notActive(reason: NotActiveReason): ActiveWorkspaceResult {
  return { active: false, activeSince: null, notActiveBecause: reason };
}

export function activeWorkspace(facts: ActiveWorkspaceFacts, now: Date): ActiveWorkspaceResult {
  if (facts.setupCompletedAt === null) return notActive("setupNotCompleted");
  const connectedAt = earliestOf(facts.agentConnectedAt, facts.channelConnectedAt);
  if (connectedAt === null) return notActive("noAgentOrChannelConnected");
  if (facts.changeInSecondWeekAt === null)
    return notActive(now < secondWeekWindow(facts.createdAt).from ? "secondWeekNotReached" : "noChangeInSecondWeek");

  return {
    active: true,
    activeSince: latestOf(facts.setupCompletedAt, connectedAt, facts.changeInSecondWeekAt),
    notActiveBecause: null,
  };
}
