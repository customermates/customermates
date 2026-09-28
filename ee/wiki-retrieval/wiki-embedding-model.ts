import type { AgentRetrievalCharge } from "@/ee/agent-chat/agent-usage.service";

import { embedMany } from "ai";

import { readAgentProviderCharge } from "@/ee/agent-chat/gateway-cost";

export const WIKI_EMBEDDING_MODEL = "google/gemini-embedding-001";
export const WIKI_EMBEDDING_SERVING_PROVIDER = "vertex";
export const WIKI_EMBEDDING_DIMENSIONS = 768;
export const WIKI_EMBEDDING_BATCH_SIZE = 32;
const WIKI_EMBEDDING_MICROCENTS_PER_TOKEN = 15;
const WIKI_QUERY_TIMEOUT_MS = 5_000;
const WIKI_DOCUMENT_TIMEOUT_MS = 30_000;

export type WikiEmbeddingKind = "query" | "document";

function wikiEmbeddingProviderOptions(kind: WikiEmbeddingKind) {
  return {
    gateway: {
      only: [WIKI_EMBEDDING_SERVING_PROVIDER],
      zeroDataRetention: true,
      disallowPromptTraining: true,
    },
    vertex: {
      outputDimensionality: WIKI_EMBEDDING_DIMENSIONS,
      taskType: kind === "query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT",
    },
  };
}

export function wikiEmbeddingWorstCaseMicrocents(texts: readonly string[]): number {
  return (
    texts.reduce((total, text) => total + Buffer.byteLength(text, "utf8"), 0) * WIKI_EMBEDDING_MICROCENTS_PER_TOKEN
  );
}

function wikiEmbeddingCharge(metadata: unknown, inputTokens: number): AgentRetrievalCharge {
  const estimated = inputTokens * WIKI_EMBEDDING_MICROCENTS_PER_TOKEN;
  const reading = readAgentProviderCharge(metadata, WIKI_EMBEDDING_SERVING_PROVIDER);
  if (reading.outcome === "measured") {
    return {
      model: WIKI_EMBEDDING_MODEL,
      inputTokens,
      costMicrocents: reading.charge.costMicrocents,
      costSource: "measured",
    };
  }
  return { model: WIKI_EMBEDDING_MODEL, inputTokens, costMicrocents: estimated, costSource: "estimated" };
}

export async function embedWikiTexts(
  texts: string[],
  kind: WikiEmbeddingKind,
): Promise<{ vectors: number[][]; charge: AgentRetrievalCharge }> {
  if (texts.length === 0 || texts.length > WIKI_EMBEDDING_BATCH_SIZE)
    throw new Error("Wiki embedding batch size is invalid.");
  const result = await embedMany({
    model: WIKI_EMBEDDING_MODEL,
    values: texts,
    maxRetries: kind === "query" ? 0 : 2,
    abortSignal: AbortSignal.timeout(kind === "query" ? WIKI_QUERY_TIMEOUT_MS : WIKI_DOCUMENT_TIMEOUT_MS),
    providerOptions: wikiEmbeddingProviderOptions(kind),
  });
  if (result.embeddings.some((vector) => vector.length !== WIKI_EMBEDDING_DIMENSIONS))
    throw new Error("Wiki embedding dimensions are invalid.");
  return {
    vectors: result.embeddings,
    charge: wikiEmbeddingCharge(
      (result.responses?.length ?? 1) === 1 ? result.providerMetadata : undefined,
      result.usage.tokens,
    ),
  };
}
