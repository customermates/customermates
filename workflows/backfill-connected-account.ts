import { sleep } from "workflow";
import { UnsuccessfulRequestError } from "unipile-node-sdk";

import type { BackfillConnectedAccountPayload } from "@/ee/messaging/ingest/backfill-connected-account.interactor";

import { getBackfillConnectedAccountInteractor, getReleaseBackfillClaimInteractor } from "@/core/di";

import { reportFailure, toWorkflowFailure } from "./capture-failure";

const WORKFLOW_NAME = "backfill-connected-account";
const PROGRESSIVE_REDISPATCH_DELAY_MS = 20_000;

async function backfillRound(connectedAccountId: string, attempt: number, token: string): Promise<boolean> {
  "use step";
  try {
    return await getBackfillConnectedAccountInteractor().invoke({ connectedAccountId, attempt, token });
  } catch (err) {
    if (err instanceof UnsuccessfulRequestError) {
      throw new Error(`Unipile API error: ${typeof err.body === "string" ? err.body : JSON.stringify(err.body)}`, {
        cause: err,
      });
    }

    throw err;
  }
}
backfillRound.maxRetries = 3;

async function releaseBackfillClaim(connectedAccountId: string, token: string): Promise<void> {
  "use step";
  await getReleaseBackfillClaimInteractor().invoke({ connectedAccountId, token });
}
releaseBackfillClaim.maxRetries = 3;

export async function backfillConnectedAccount(payload: BackfillConnectedAccountPayload): Promise<void> {
  "use workflow";
  try {
    let attempt = payload.attempt ?? 0;

    while (await backfillRound(payload.connectedAccountId, attempt, payload.token)) {
      await sleep(PROGRESSIVE_REDISPATCH_DELAY_MS);
      attempt++;
    }
  } catch (err) {
    await reportFailure(WORKFLOW_NAME, toWorkflowFailure(err));
    await releaseBackfillClaim(payload.connectedAccountId, payload.token).catch(() => undefined);
    throw err;
  }
}
