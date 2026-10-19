import type { WorkflowTenant } from "./workflow-tenant";

import { getWorkflowMetadata, sleep } from "workflow";

import {
  getFailWikiWebsiteCrawlInteractor,
  getWikiWebsiteCrawlService,
  getWikiWebsiteSynthesisService,
} from "@/core/di";

import { asBackgroundOwner, ranForOwner } from "./background-owner";
import { GONE } from "./owner-gone";
import { reportFailure, reportWarning, toWorkflowFailure } from "./capture-failure";

const WORKFLOW_NAME = "crawl-wiki-website";
const BRIEF_WAIT_ROUNDS = 360;
const BRIEF_FAST_ROUNDS = 40;
const BRIEF_FAST_WAIT = "15s";
const BRIEF_WAIT = "1m";
const TOPIC_LANES = 5;

export type CrawlWikiWebsiteWorkflowPayload = {
  crawlId: string;
  userId: string;
  tenant?: WorkflowTenant;
};

async function claimWikiWebsiteStep(
  payload: CrawlWikiWebsiteWorkflowPayload,
  workflowRunId: string,
): Promise<boolean | typeof GONE> {
  "use step";
  return asBackgroundOwner(payload.userId, () =>
    getWikiWebsiteCrawlService().claimWorkflow(payload.crawlId, workflowRunId),
  );
}

async function discoverWikiWebsiteStep(payload: CrawlWikiWebsiteWorkflowPayload): Promise<number | typeof GONE> {
  "use step";
  return asBackgroundOwner(payload.userId, () => getWikiWebsiteCrawlService().discover(payload.crawlId));
}

async function fetchWikiWebsiteBatchStep(payload: CrawlWikiWebsiteWorkflowPayload, batch: number): Promise<boolean> {
  "use step";
  return ranForOwner(payload.userId, () => getWikiWebsiteCrawlService().fetchBatch(payload.crawlId, batch));
}

async function importWikiWebsiteStep(payload: CrawlWikiWebsiteWorkflowPayload): Promise<boolean> {
  "use step";
  return ranForOwner(payload.userId, () => getWikiWebsiteCrawlService().importSources(payload.crawlId));
}

async function finishWikiWebsiteStep(payload: CrawlWikiWebsiteWorkflowPayload): Promise<boolean> {
  "use step";
  return ranForOwner(payload.userId, () => getWikiWebsiteCrawlService().finish(payload.crawlId));
}

async function planWikiWebsiteStep(
  payload: CrawlWikiWebsiteWorkflowPayload,
  giveUp: boolean,
): Promise<{ topics: number | "wait" | typeof GONE; warnings: string[] }> {
  "use step";
  const service = getWikiWebsiteSynthesisService();
  const topics = await asBackgroundOwner(payload.userId, () => service.plan(payload.crawlId, giveUp));
  return { topics, warnings: service.drainWarnings() };
}

async function writeWikiTopicStep(
  payload: CrawlWikiWebsiteWorkflowPayload,
  index: number,
): Promise<{ gone: boolean; warnings: string[] }> {
  "use step";
  const service = getWikiWebsiteSynthesisService();
  const written = await asBackgroundOwner(payload.userId, () => service.writeTopic(payload.crawlId, index));
  return { gone: written === GONE, warnings: service.drainWarnings() };
}

async function settleWikiWebsiteStep(payload: CrawlWikiWebsiteWorkflowPayload): Promise<boolean> {
  "use step";
  return ranForOwner(payload.userId, () => getWikiWebsiteSynthesisService().settle(payload.crawlId));
}

planWikiWebsiteStep.maxRetries = 1;
writeWikiTopicStep.maxRetries = 1;

async function failWikiWebsiteStep(payload: CrawlWikiWebsiteWorkflowPayload, workflowRunId: string): Promise<void> {
  "use step";
  await getFailWikiWebsiteCrawlInteractor().invoke({
    crawlId: payload.crawlId,
    userId: payload.userId,
    workflowRunId,
  });
}

export async function crawlWikiWebsite(payload: CrawlWikiWebsiteWorkflowPayload): Promise<void> {
  "use workflow";
  const { workflowRunId } = getWorkflowMetadata();
  try {
    const claimed = await claimWikiWebsiteStep(payload, workflowRunId);
    if (claimed !== true) return;
    const batches = await discoverWikiWebsiteStep(payload);
    if (batches === GONE || batches === 0) return;
    for (let batch = 0; batch < batches; batch += 1) if (!(await fetchWikiWebsiteBatchStep(payload, batch))) return;
    if (!(await importWikiWebsiteStep(payload))) return;
    if (!(await finishWikiWebsiteStep(payload))) return;
    let topics = 0;
    for (let round = 0; round <= BRIEF_WAIT_ROUNDS; round += 1) {
      const planned = await planWikiWebsiteStep(payload, round === BRIEF_WAIT_ROUNDS);
      for (const warning of planned.warnings) await reportWarning(WORKFLOW_NAME, warning, payload.tenant);
      if (planned.topics === GONE) return;
      if (planned.topics !== "wait") {
        topics = planned.topics;
        break;
      }
      await sleep(round < BRIEF_FAST_ROUNDS ? BRIEF_FAST_WAIT : BRIEF_WAIT);
    }
    let gone = false;
    await Promise.all(
      Array.from({ length: Math.min(TOPIC_LANES, topics) }, async (_lane, lane) => {
        for (let index = lane; index < topics && !gone; index += TOPIC_LANES) {
          const written = await writeWikiTopicStep(payload, index);
          for (const warning of written.warnings) await reportWarning(WORKFLOW_NAME, warning, payload.tenant);
          gone ||= written.gone;
        }
      }),
    );
    if (gone) return;
    await settleWikiWebsiteStep(payload);
  } catch (err) {
    try {
      await failWikiWebsiteStep(payload, workflowRunId);
    } finally {
      await reportFailure(WORKFLOW_NAME, toWorkflowFailure(err), payload.tenant);
    }
    throw err;
  }
}
