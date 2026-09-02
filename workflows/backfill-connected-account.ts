import { sleep } from "workflow";

import type { BackfillPlan } from "@/ee/messaging/ingest/backfill/prepare-backfill.interactor";

import { decideSource, leavesWorkUndone } from "@/ee/messaging/ingest/backfill/drain-decision";

import {
  getClaimBackfillInteractor,
  getPrepareBackfillInteractor,
  getBackfillChatsInteractor,
  getBackfillEmailsInteractor,
  getBackfillCalendarsInteractor,
  getReleaseBackfillClaimInteractor,
} from "@/core/di";
import {
  getRetryAfterSeconds,
  isUnipileProviderUnprocessable,
  isUnipileRateLimit,
  isUnipileSourceForbidden,
  isUnipileTimeout,
} from "@/ee/messaging/messaging.service";

import type { WorkflowTenant } from "./workflow-tenant";

import { reportFailure, reportWarning, toWorkflowFailure } from "./capture-failure";

const WORKFLOW_NAME = "backfill-connected-account";
const READY_POLL_MS = 60_000;
const MAX_READY_POLLS = 15;
const RESWEEP_DELAY_MS = 90_000;
const BACKFILL_RESWEEPS = 2;
const FINAL_SWEEP_DELAY_MS = 45 * 60_000;
const CALENDAR_SOURCE = "calendar";

export type BackfillConnectedAccountPayload = {
  connectedAccountId: string;
  sourceFilter?: string[];
  tenant?: WorkflowTenant;
};

type PageKind = "chat" | "email" | "calendar";
type ListPageResult = {
  nextCursor: string | null;
  done: boolean;
  retryAfterSeconds?: number;
  stalled?: boolean;
  forbidden?: boolean;
};
type PageFetcher = (connectedAccountId: string, source: string, cursor: string | null) => Promise<ListPageResult>;

const pageFetchers: Record<PageKind, PageFetcher> = {
  chat: (connectedAccountId, source, cursor) =>
    getBackfillChatsInteractor().invoke({ connectedAccountId, source, cursor }),
  email: (connectedAccountId, source, cursor) =>
    getBackfillEmailsInteractor().invoke({ connectedAccountId, source, cursor }),
  calendar: async (connectedAccountId) => {
    await getBackfillCalendarsInteractor().invoke({ connectedAccountId });
    return { nextCursor: null, done: true };
  },
};

async function claimBackfill(connectedAccountId: string): Promise<string | null> {
  "use step";
  return getClaimBackfillInteractor().invoke({ connectedAccountId });
}
claimBackfill.maxRetries = 3;

async function prepare(connectedAccountId: string, token: string, sourceFilter?: string[]) {
  "use step";
  return getPrepareBackfillInteractor().invoke({ connectedAccountId, token, sourceFilter });
}
prepare.maxRetries = 3;

async function listPage(
  kind: PageKind,
  connectedAccountId: string,
  source: string,
  cursor: string | null,
): Promise<ListPageResult> {
  "use step";
  try {
    return await pageFetchers[kind](connectedAccountId, source, cursor);
  } catch (err) {
    if (isUnipileRateLimit(err))
      return { nextCursor: cursor, done: false, retryAfterSeconds: getRetryAfterSeconds(err) ?? 60 };
    if (isUnipileTimeout(err) || isUnipileProviderUnprocessable(err))
      return { nextCursor: cursor, done: false, stalled: true };
    if (isUnipileSourceForbidden(err)) return { nextCursor: null, done: true, forbidden: true };
    throw err;
  }
}
listPage.maxRetries = 3;

async function releaseClaim(connectedAccountId: string, token: string, complete = true): Promise<void> {
  "use step";
  await getReleaseBackfillClaimInteractor().invoke({ connectedAccountId, token, complete });
}
releaseClaim.maxRetries = 3;

async function awaitReady(connectedAccountId: string, token: string, sourceFilter?: string[]): Promise<BackfillPlan> {
  let plan = await prepare(connectedAccountId, token, sourceFilter);
  let polls = 0;
  while (plan.status === "waiting" && polls < MAX_READY_POLLS) {
    await sleep(READY_POLL_MS);
    polls += 1;
    plan = await prepare(connectedAccountId, token, sourceFilter);
  }
  return plan;
}

type SourceProgress = { source: string; cursor: string | null; stallCount: number };

async function drainSources(
  kind: PageKind,
  connectedAccountId: string,
  sources: string[],
  tenant?: WorkflowTenant,
): Promise<boolean> {
  let pending: SourceProgress[] = sources.map((source) => ({ source, cursor: null, stallCount: 0 }));
  let deferred = false;

  while (pending.length > 0) {
    const stillPending: SourceProgress[] = [];
    for (const progress of pending) {
      const page = await listPage(kind, connectedAccountId, progress.source, progress.cursor);

      const decision = decideSource(page, progress.stallCount);
      if (leavesWorkUndone(decision)) deferred = true;

      if (decision.action === "skip") {
        await reportWarning(
          WORKFLOW_NAME,
          `source "${progress.source}" skipped: the account lacks permission to read it (account ${connectedAccountId})`,
          tenant,
        );
        continue;
      }

      if (decision.action === "abandon") {
        await reportWarning(
          WORKFLOW_NAME,
          `source "${progress.source}" abandoned after ${decision.afterAttempts} stalled pages (account ${connectedAccountId})`,
          tenant,
        );
        continue;
      }

      if (decision.action === "retry") {
        progress.stallCount += 1;
        await sleep(decision.delayMs);
        stillPending.push(progress);
        continue;
      }

      progress.stallCount = 0;
      progress.cursor = page.nextCursor;

      if (decision.action === "defer") {
        await reportWarning(
          WORKFLOW_NAME,
          `source "${progress.source}" deferred: the provider asked for ${decision.retryAfterSeconds}s (account ${connectedAccountId})`,
          tenant,
        );
        continue;
      }

      if (decision.delayMs) await sleep(decision.delayMs);
      if (!decision.done) stillPending.push(progress);
    }
    pending = stillPending;
  }

  return deferred;
}

async function drainWithResweeps(
  kind: PageKind,
  connectedAccountId: string,
  sources: string[],
  tenant?: WorkflowTenant,
): Promise<boolean> {
  let paused = await drainSources(kind, connectedAccountId, sources, tenant);
  for (let sweep = 0; sweep < BACKFILL_RESWEEPS && !paused; sweep += 1) {
    await sleep(RESWEEP_DELAY_MS);
    paused = await drainSources(kind, connectedAccountId, sources, tenant);
  }
  return paused;
}

async function finalSweep(connectedAccountId: string, sourceFilter?: string[], tenant?: WorkflowTenant): Promise<void> {
  const token = await claimBackfill(connectedAccountId);
  if (!token) return;

  try {
    const plan = await prepare(connectedAccountId, token, sourceFilter);

    let paused = false;

    if (plan.status === "ready") {
      paused = plan.kind === "none" ? false : await drainSources(plan.kind, connectedAccountId, plan.sources, tenant);

      if (!paused && plan.hasCalendar) await drainSources("calendar", connectedAccountId, [CALENDAR_SOURCE], tenant);
    }

    await releaseClaim(connectedAccountId, token, !paused);
  } catch (err) {
    await reportFailure(WORKFLOW_NAME, toWorkflowFailure(err), tenant);
    await releaseClaim(connectedAccountId, token, false).catch(() => undefined);
    throw err;
  }
}

export async function backfillConnectedAccount(payload: BackfillConnectedAccountPayload): Promise<void> {
  "use workflow";
  const { connectedAccountId, sourceFilter, tenant } = payload;

  const token = await claimBackfill(connectedAccountId);
  if (!token) return;

  try {
    const plan = await awaitReady(connectedAccountId, token, sourceFilter);

    let paused = false;

    if (plan.status === "ready") {
      paused =
        plan.kind === "none" ? false : await drainWithResweeps(plan.kind, connectedAccountId, plan.sources, tenant);

      if (!paused && plan.hasCalendar) await drainSources("calendar", connectedAccountId, [CALENDAR_SOURCE], tenant);
    }

    await releaseClaim(connectedAccountId, token, !paused);
  } catch (err) {
    await reportFailure(WORKFLOW_NAME, toWorkflowFailure(err), tenant);
    await releaseClaim(connectedAccountId, token, false).catch(() => undefined);
    throw err;
  }

  await sleep(FINAL_SWEEP_DELAY_MS);
  await finalSweep(connectedAccountId, sourceFilter, tenant);
}
