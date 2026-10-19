import type {
  AgentRetrievalGrant,
  AgentUsageService,
  PlatformRetrievalPurpose,
} from "@/ee/agent-chat/agent-usage.service";
import type { WikiEmbeddingKind } from "./wiki-embedding-model";

import * as Sentry from "@sentry/node";

import { isAgentChatAvailable } from "@/ee/agent-chat/agent-availability";
import { env } from "@/env";

import {
  embedWikiTexts,
  WIKI_EMBEDDING_MODEL,
  wikiEmbeddingAttemptCharge,
  wikiEmbeddingWorstCaseMicrocents,
} from "./wiki-embedding-model";
import { reserveWikiIndexSpend } from "./wiki-index-spend";

type WikiEmbeddingPayer = { id: string; companyId: string };

export function isWikiSemanticSearchAvailable() {
  return isAgentChatAvailable() && env.APP_MODE !== "demo";
}

export async function embedPlatformTexts(
  usage: AgentUsageService,
  purpose: PlatformRetrievalPurpose,
  texts: string[],
): Promise<number[][] | null> {
  const reservationId = await usage.reservePlatformRetrieval({
    purpose,
    model: WIKI_EMBEDDING_MODEL,
    worstCaseMicrocents: wikiEmbeddingWorstCaseMicrocents(texts),
  });
  if (!reservationId) return null;
  let charge = wikiEmbeddingAttemptCharge(texts);
  try {
    const embedded = await embedWikiTexts(texts, "document", {
      maxRetries: 0,
      onCharge: (measured) => {
        charge = measured;
      },
    });
    charge = embedded.charge;
    return embedded.vectors;
  } finally {
    await usage.settlePlatformRetrieval({ reservationId, charge });
  }
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

  async embedTexts(
    grant: AgentRetrievalGrant,
    texts: string[],
    kind: WikiEmbeddingKind,
    used: () => boolean = () => true,
    rebuild = false,
  ): Promise<number[][] | null> {
    const spend = await reserveWikiIndexSpend(this.usage, {
      grant,
      worstCaseMicrocents: wikiEmbeddingWorstCaseMicrocents(texts),
      model: WIKI_EMBEDDING_MODEL,
      rebuild,
    });
    if (!spend) return null;
    let attemptedCharge = wikiEmbeddingAttemptCharge(texts);
    let embedded: Awaited<ReturnType<typeof embedWikiTexts>>;
    try {
      embedded = await embedWikiTexts(texts, kind, {
        maxRetries: 0,
        onCharge: (charge) => {
          attemptedCharge = charge;
        },
      });
    } catch (error) {
      await spend.settle(attemptedCharge, "platform");
      throw error;
    }
    await spend.settle(embedded.charge, used() ? "grant" : "platform");
    return embedded.vectors;
  }
}
