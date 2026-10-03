import type { WikiWebsiteCrawlCleanup, WikiWebsiteCrawlCleanupRepo } from "./wiki-website-crawl-cleanup.repo";

import { z } from "zod";

import { Enforce } from "@/core/decorators/enforce.decorator";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

const Schema = z.object({
  crawlId: z.uuid(),
  userId: z.uuid(),
  workflowRunId: z.string().min(1),
});

@SystemInteractor
export class FailWikiWebsiteCrawlInteractor {
  constructor(private readonly repo: WikiWebsiteCrawlCleanupRepo) {}

  @Enforce(Schema)
  async invoke(input: WikiWebsiteCrawlCleanup): Promise<void> {
    await this.repo.failWorkflowUnscoped(input);
  }
}
