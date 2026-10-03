import type { WorkflowTenant } from "./workflow-tenant";

import { getWorkflowMetadata } from "workflow";

import {
  getFailWikiWebsiteCrawlInteractor,
  getWikiWebsiteCrawlService,
  getWikiWebsiteSynthesisService,
} from "@/core/di";
import { runAsBackgroundTenant } from "@/core/decorators/background-tenant";

import { reportFailure, toWorkflowFailure } from "./capture-failure";

const WORKFLOW_NAME = "crawl-wiki-website";

export type CrawlWikiWebsiteWorkflowPayload = {
  crawlId: string;
  userId: string;
  tenant?: WorkflowTenant;
};

async function claimWikiWebsiteStep(payload: CrawlWikiWebsiteWorkflowPayload, workflowRunId: string): Promise<boolean> {
  "use step";
  return runAsBackgroundTenant(payload.userId, () =>
    getWikiWebsiteCrawlService().claimWorkflow(payload.crawlId, workflowRunId),
  );
}

async function discoverWikiWebsiteStep(payload: CrawlWikiWebsiteWorkflowPayload): Promise<number> {
  "use step";
  return runAsBackgroundTenant(payload.userId, () => getWikiWebsiteCrawlService().discover(payload.crawlId));
}

async function fetchWikiWebsiteBatchStep(payload: CrawlWikiWebsiteWorkflowPayload, batch: number): Promise<void> {
  "use step";
  await runAsBackgroundTenant(payload.userId, () => getWikiWebsiteCrawlService().fetchBatch(payload.crawlId, batch));
}

async function importWikiWebsiteStep(payload: CrawlWikiWebsiteWorkflowPayload): Promise<void> {
  "use step";
  await runAsBackgroundTenant(payload.userId, () => getWikiWebsiteCrawlService().importSources(payload.crawlId));
}

async function finishWikiWebsiteStep(payload: CrawlWikiWebsiteWorkflowPayload): Promise<void> {
  "use step";
  await runAsBackgroundTenant(payload.userId, () => getWikiWebsiteCrawlService().finish(payload.crawlId));
}

async function planWikiWebsiteStep(payload: CrawlWikiWebsiteWorkflowPayload): Promise<number> {
  "use step";
  return runAsBackgroundTenant(payload.userId, () => getWikiWebsiteSynthesisService().plan(payload.crawlId));
}

async function writeWikiTopicStep(payload: CrawlWikiWebsiteWorkflowPayload, index: number): Promise<void> {
  "use step";
  await runAsBackgroundTenant(payload.userId, () =>
    getWikiWebsiteSynthesisService().writeTopic(payload.crawlId, index),
  );
}

async function settleWikiWebsiteStep(payload: CrawlWikiWebsiteWorkflowPayload): Promise<void> {
  "use step";
  await runAsBackgroundTenant(payload.userId, () => getWikiWebsiteSynthesisService().settle(payload.crawlId));
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
    if (!(await claimWikiWebsiteStep(payload, workflowRunId))) return;
    const batches = await discoverWikiWebsiteStep(payload);
    if (batches === 0) return;
    for (let batch = 0; batch < batches; batch += 1) await fetchWikiWebsiteBatchStep(payload, batch);
    await importWikiWebsiteStep(payload);
    await finishWikiWebsiteStep(payload);
    const topics = await planWikiWebsiteStep(payload);
    for (let index = 0; index < topics; index += 1) await writeWikiTopicStep(payload, index);
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
