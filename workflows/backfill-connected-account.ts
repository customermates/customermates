import { sleep } from "workflow";

import type { BackfillPlan } from "@/ee/messaging/ingest/backfill/prepare-backfill.interactor";

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
  isUnipileTimeout,
} from "@/ee/messaging/messaging.service";

import type { WorkflowTenant } from "./workflow-tenant";

import { reportFailure, reportWarning, toWorkflowFailure } from "./capture-failure";

const WORKFLOW_NAME = "backfill-connected-account";
const READY_POLL_MS = 60_000;
const MAX_READY_POLLS = 15;
const CATCHUP_DELAY_MS = 10_000;
const GIVE_UP_RATE_LIMIT_SECONDS = 600;
const RESWEEP_DELAY_MS = 90_000;
const BACKFILL_RESWEEPS = 2;
const FINAL_SWEEP_DELAY_MS = 45 * 60_000;
const MAX_PAGE_STALL_RETRIES = 4;
const CALENDAR_SOURCE = "calendar";

export type BackfillConnectedAccountPayload = {
  connectedAccountId: string;
  sourceFilter?: string[];
  tenant?: WorkflowTenant;
};

type PageKind = "chat" | "email" | "calendar";
type ListPageResult = { nextCursor: string | null; done: boolean; retryAfterSeconds?: number; stalled?: boolean };
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

function backoff(retryAfterSeconds?: number): number {
  return retryAfterSeconds ? retryAfterSeconds * 1000 : CATCHUP_DELAY_MS;
}

function rateLimitedTooLong(retryAfterSeconds?: number): boolean {
  return (retryAfterSeconds ?? 0) > GIVE_UP_RATE_LIMIT_SECONDS;
}

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
    throw err;
  }
}
listPage.maxRetries = 3;

async function releaseClaim(connectedAccountId: string, token: string): Promise<void> {
  "use step";
  await getReleaseBackfillClaimInteractor().invoke({ connectedAccountId, token });
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

  while (pending.length > 0) {
    const stillPending: SourceProgress[] = [];
    for (const progress of pending) {
      const page = await listPage(kind, connectedAccountId, progress.source, progress.cursor);

      if (page.stalled) {
        progress.stallCount += 1;
        if (progress.stallCount > MAX_PAGE_STALL_RETRIES) {
          await reportWarning(
            WORKFLOW_NAME,
            `source "${progress.source}" abandoned after ${MAX_PAGE_STALL_RETRIES} stalled pages (account ${connectedAccountId})`,
            tenant,
          );
        } else {
          await sleep(CATCHUP_DELAY_MS);
          stillPending.push(progress);
        }
        continue;
      }

      progress.stallCount = 0;
      progress.cursor = page.nextCursor;
      if (rateLimitedTooLong(page.retryAfterSeconds)) return true;
      if (page.retryAfterSeconds) await sleep(backoff(page.retryAfterSeconds));
      if (!page.done) stillPending.push(progress);
    }
    pending = stillPending;
  }

  return false;
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

    if (plan.status === "ready") {
      const paused =
        plan.kind === "none" ? false : await drainSources(plan.kind, connectedAccountId, plan.sources, tenant);

      if (!paused && plan.hasCalendar) await drainSources("calendar", connectedAccountId, [CALENDAR_SOURCE], tenant);
    }

    await releaseClaim(connectedAccountId, token);
  } catch (err) {
    await reportFailure(WORKFLOW_NAME, toWorkflowFailure(err), tenant);
    await releaseClaim(connectedAccountId, token).catch(() => undefined);
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

    if (plan.status === "ready") {
      const paused =
        plan.kind === "none" ? false : await drainWithResweeps(plan.kind, connectedAccountId, plan.sources, tenant);

      if (!paused && plan.hasCalendar) await drainSources("calendar", connectedAccountId, [CALENDAR_SOURCE], tenant);
    }

    await releaseClaim(connectedAccountId, token);
  } catch (err) {
    await reportFailure(WORKFLOW_NAME, toWorkflowFailure(err), tenant);
    await releaseClaim(connectedAccountId, token).catch(() => undefined);
    throw err;
  }

  await sleep(FINAL_SWEEP_DELAY_MS);
  await finalSweep(connectedAccountId, sourceFilter, tenant);
}
