import type { WorkflowTenant } from "./workflow-tenant";

import { getWorkflowMetadata } from "workflow";

import {
  getFailWikiWebsiteCrawlInteractor,
  getWikiWebsiteCrawlService,
  getWikiWebsiteSynthesisService,
} from "@/core/di";
import { runAsBackgroundTenant } from "@/core/decorators/background-tenant";

import { reportFailure, reportWarning, toWorkflowFailure } from "./capture-failure";

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

async function planWikiWebsiteStep(
  payload: CrawlWikiWebsiteWorkflowPayload,
): Promise<{ topics: number; warnings: string[] }> {
  "use step";
  const service = getWikiWebsiteSynthesisService();
  const topics = await runAsBackgroundTenant(payload.userId, () => service.plan(payload.crawlId));
  return { topics, warnings: service.drainWarnings() };
}

async function writeWikiTopicStep(payload: CrawlWikiWebsiteWorkflowPayload, index: number): Promise<string[]> {
  "use step";
  const service = getWikiWebsiteSynthesisService();
  await runAsBackgroundTenant(payload.userId, () => service.writeTopic(payload.crawlId, index));
  return service.drainWarnings();
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
    const planned = await planWikiWebsiteStep(payload);
    for (const warning of planned.warnings) await reportWarning(WORKFLOW_NAME, warning, payload.tenant);
    for (let index = 0; index < planned.topics; index += 1) {
      for (const warning of await writeWikiTopicStep(payload, index))
        await reportWarning(WORKFLOW_NAME, warning, payload.tenant);
    }
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
