import type { AgentRetrievalGrant, AgentUsageService } from "@/ee/agent-chat/agent-usage.service";
import type { WikiEmbeddingKind } from "./wiki-embedding-model";

import { isAgentChatAvailable } from "@/ee/agent-chat/agent-availability";
import { env } from "@/env";

import { embedWikiTexts } from "./wiki-embedding-model";

export type WikiEmbeddingPayer = { id: string; companyId: string };

export function isWikiSemanticSearchAvailable() {
  return isAgentChatAvailable() && env.APP_MODE !== "demo";
}

export class WikiEmbeddingService {
  constructor(private usage: AgentUsageService) {}

  async authorize(payer: WikiEmbeddingPayer): Promise<AgentRetrievalGrant | null> {
    if (!isWikiSemanticSearchAvailable()) return null;
    return this.usage.prepareRetrieval(payer.id);
  }

  async embedTexts(
    payer: WikiEmbeddingPayer,
    grant: AgentRetrievalGrant,
    texts: string[],
    kind: WikiEmbeddingKind,
  ): Promise<number[][]> {
    const { vectors, charge } = await embedWikiTexts(texts, kind);
    await this.usage.accrueRetrieval({ companyId: payer.companyId, userId: payer.id, grant, charge });
    return vectors;
  }
}
