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

export function wikiEmbeddingAttemptCharge(texts: readonly string[]): AgentRetrievalCharge {
  return {
    model: WIKI_EMBEDDING_MODEL,
    inputTokens: texts.reduce((total, text) => total + Buffer.byteLength(text, "utf8"), 0),
    costMicrocents: wikiEmbeddingWorstCaseMicrocents(texts),
    costSource: "estimated",
  };
}

function wikiEmbeddingCharge(
  metadata: unknown,
  reportedInputTokens: number | undefined,
  texts: readonly string[],
): AgentRetrievalCharge {
  const inputTokens =
    typeof reportedInputTokens === "number" &&
    reportedInputTokens > 0 &&
    Number.isSafeInteger(reportedInputTokens) &&
    Number.isSafeInteger(reportedInputTokens * WIKI_EMBEDDING_MICROCENTS_PER_TOKEN)
      ? reportedInputTokens
      : wikiEmbeddingAttemptCharge(texts).inputTokens;
  const estimated = inputTokens * WIKI_EMBEDDING_MICROCENTS_PER_TOKEN;
  const reading = readAgentProviderCharge(metadata, WIKI_EMBEDDING_SERVING_PROVIDER);
  if (reading.outcome !== "unreadable") {
    return {
      model: WIKI_EMBEDDING_MODEL,
      inputTokens,
      costMicrocents: reading.outcome === "measured" ? reading.charge.costMicrocents : 0,
      costSource: "measured",
    };
  }
  return {
    model: WIKI_EMBEDDING_MODEL,
    inputTokens,
    costMicrocents: estimated,
    costSource: "estimated",
  };
}

export async function embedWikiTexts(
  texts: string[],
  kind: WikiEmbeddingKind,
  options: { maxRetries?: number; onCharge?: (charge: AgentRetrievalCharge) => void } = {},
): Promise<{ vectors: number[][]; charge: AgentRetrievalCharge }> {
  if (texts.length === 0 || texts.length > WIKI_EMBEDDING_BATCH_SIZE)
    throw new Error("Knowledge Base embedding batch size is invalid.");
  const result = await embedMany({
    model: WIKI_EMBEDDING_MODEL,
    values: texts,
    maxRetries: options.maxRetries ?? (kind === "query" ? 0 : 2),
    abortSignal: AbortSignal.timeout(kind === "query" ? WIKI_QUERY_TIMEOUT_MS : WIKI_DOCUMENT_TIMEOUT_MS),
    providerOptions: wikiEmbeddingProviderOptions(kind),
  });
  const charge = wikiEmbeddingCharge(
    (result.responses?.length ?? 1) === 1 ? result.providerMetadata : undefined,
    result.usage?.tokens,
    texts,
  );
  options.onCharge?.(charge);
  if (
    result.embeddings.length !== texts.length ||
    result.embeddings.some(
      (vector) => vector.length !== WIKI_EMBEDDING_DIMENSIONS || vector.some((value) => !Number.isFinite(value)),
    )
  )
    throw new Error("Knowledge Base embedding dimensions are invalid.");
  return {
    vectors: result.embeddings,
    charge,
  };
}
