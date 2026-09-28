import type { AgentRetrievalGrant, AgentUsageService } from "@/ee/agent-chat/agent-usage.service";
import type { WikiEmbeddingKind } from "./wiki-embedding-model";

import * as Sentry from "@sentry/node";

import { isAgentChatAvailable } from "@/ee/agent-chat/agent-availability";
import { env } from "@/env";

import { embedWikiTexts, WIKI_EMBEDDING_MODEL, wikiEmbeddingWorstCaseMicrocents } from "./wiki-embedding-model";

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

  async embedTexts(grant: AgentRetrievalGrant, texts: string[], kind: WikiEmbeddingKind): Promise<number[][] | null> {
    const reservation = await this.usage.reserveRetrieval({
      grant,
      worstCaseMicrocents: wikiEmbeddingWorstCaseMicrocents(texts),
      model: WIKI_EMBEDDING_MODEL,
    });
    if (!reservation) return null;
    let embedded: Awaited<ReturnType<typeof embedWikiTexts>>;
    try {
      embedded = await embedWikiTexts(texts, kind);
    } catch (error) {
      await this.usage.settleRetrieval({ reservation, charge: null });
      throw error;
    }
    await this.usage.settleRetrieval({ reservation, charge: embedded.charge });
    return embedded.vectors;
  }
}
