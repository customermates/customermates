import type { BackfillConnectedAccountRepo } from "./backfill.repo";
import type { PageResult } from "./paginate";

import { ConnectedAccountStatus } from "@/generated/prisma";

const ACCOUNT_GONE = Symbol("backfill-account-gone");

function isAccountGone(error: unknown): boolean {
  return error instanceof Error && error.cause === ACCOUNT_GONE;
}

function isMissingReference(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "P2003";
}

/**
 * A backfill step checks the account once at its start, then writes for minutes. When the account or its whole
 * workspace is deleted in between, every write fails on the connectedAccountId foreign key. That is the expected end
 * of the backfill, not an ingest bug: throw an account-gone error so the page stops instead of reporting it.
 */
export async function throwIfAccountGone(
  repo: BackfillConnectedAccountRepo,
  connectedAccountId: string,
  error: unknown,
): Promise<void> {
  if (!isMissingReference(error)) return;

  const account = await repo.findAccountByIdUnscoped(connectedAccountId);
  if (!account || account.status === ConnectedAccountStatus.deleted)
    throw new Error(`Connected account ${connectedAccountId} was removed during the backfill`, { cause: ACCOUNT_GONE });
}

export async function stopWhenAccountGone(run: () => Promise<PageResult>): Promise<PageResult> {
  try {
    return await run();
  } catch (error) {
    if (isAccountGone(error)) return { nextCursor: null, done: true, complete: false };
    throw error;
  }
}
