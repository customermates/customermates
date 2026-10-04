export type WikiWebsiteCrawlCleanup = { crawlId: string; userId: string; workflowRunId: string };

export abstract class WikiWebsiteCrawlCleanupRepo {
  abstract failWorkflowUnscoped(input: WikiWebsiteCrawlCleanup): Promise<void>;
}
