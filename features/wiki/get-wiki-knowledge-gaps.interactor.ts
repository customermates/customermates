import type { GetWikiKnowledgeGapsRepo } from "./get-wiki-knowledge-gaps.repo";
import type { Validated } from "@/core/validation/validation.utils";
import type { WikiKnowledgeGapList } from "./wiki.schema";

import { Action, Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

import { WIKI_KNOWLEDGE_GAP_LIST_SIZE } from "./wiki-knowledge-gaps";
import { WikiKnowledgeGapListSchema } from "./wiki.schema";

@TenantInteractor({ resource: Resource.wiki, action: Action.update })
export class GetWikiKnowledgeGapsInteractor extends AuthenticatedInteractor<void, WikiKnowledgeGapList> {
  constructor(private repo: GetWikiKnowledgeGapsRepo) {
    super();
  }

  @ValidateOutput(WikiKnowledgeGapListSchema)
  async invoke(): Validated<WikiKnowledgeGapList> {
    return {
      ok: true as const,
      data: {
        items: await this.repo.listKnowledgeGaps(WIKI_KNOWLEDGE_GAP_LIST_SIZE),
      },
    };
  }
}
