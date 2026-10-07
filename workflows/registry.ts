import { runAgentTurn } from "./agent-turn";
import { backfillConnectedAccount } from "./backfill-connected-account";
import { crawlWikiWebsite } from "./crawl-wiki-website";
import { deliverWebhook } from "./deliver-webhook";
import { indexDocsChunks } from "./index-docs-chunks";
import { indexWikiPages } from "./index-wiki-pages";
import { reconcileRoutineRuns } from "./reconcile-routine-runs";
import { runRoutine } from "./run-routine";
import { providerAvatarOperation } from "./provider-avatar-operation";
import { recordOperation } from "./record-operation";
import { processEvents } from "./process-events";
import { triggerTestError } from "./trigger-test-error";

export const WORKFLOW_REGISTRY = {
  "agent-turn": runAgentTurn,
  "backfill-connected-account": backfillConnectedAccount,
  "crawl-wiki-website": crawlWikiWebsite,
  "deliver-webhook": deliverWebhook,
  "index-docs-chunks": indexDocsChunks,
  "index-wiki-pages": indexWikiPages,
  "reconcile-routine-runs": reconcileRoutineRuns,
  "run-routine": runRoutine,
  "record-operation": recordOperation,
  "provider-avatar-operation": providerAvatarOperation,
  "process-events": processEvents,
  "trigger-test-error": triggerTestError,
} as const;

export type WorkflowId = keyof typeof WORKFLOW_REGISTRY;

export type WorkflowPayload<TId extends WorkflowId> = Parameters<(typeof WORKFLOW_REGISTRY)[TId]>[0];
