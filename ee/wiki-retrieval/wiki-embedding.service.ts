import type { AgentRetrievalGrant, AgentUsageService } from "@/ee/agent-chat/agent-usage.service";
import type { WikiEmbeddingKind } from "./wiki-embedding-model";

import * as Sentry from "@sentry/node";

import { isAgentChatAvailable } from "@/ee/agent-chat/agent-availability";
import { env } from "@/env";

import { embedWikiTexts } from "./wiki-embedding-model";

export type WikiEmbeddingPayer = { id: string; companyId: string };

export function isWikiSemanticSearchAvailable() {
  return isAgentChatAvailable() && env.APP_MODE !== "demo";
}

export class WikiEmbeddingService {
  constructor(private usage: AgentUsageService) {}

  async authorizeQuery(payer: WikiEmbeddingPayer): Promise<AgentRetrievalGrant | null> {
    if (!isWikiSemanticSearchAvailable()) return null;
    try {
      return await this.usage.prepareRetrieval(payer.id);
    } catch (error) {
      Sentry.captureException(error);
      return null;
    }
  }

  async authorizeIndexing(companyId: string): Promise<AgentRetrievalGrant | null> {
    if (!isWikiSemanticSearchAvailable()) return null;
    try {
      return await this.usage.prepareWorkspaceIndexing(companyId);
    } catch (error) {
      Sentry.captureException(error);
      return null;
    }
  }

  async embedTexts(grant: AgentRetrievalGrant, texts: string[], kind: WikiEmbeddingKind): Promise<number[][]> {
    const { vectors, charge } = await embedWikiTexts(texts, kind);
    await this.usage.accrueRetrieval({ grant, charge });
    return vectors;
  }
}
