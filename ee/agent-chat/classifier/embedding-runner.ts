import type { DocsEmbeddingModelKey } from "@/core/config/environment";

import { embedMany } from "ai";

import { readAgentProviderCharge } from "../gateway-cost";

export type DocsEmbeddingModelSpec = {
  modelId: string;
  servingProvider: string;
  microcentsPerToken: number;
  queryPrefix: string;
};

export const DOCS_EMBEDDING_MODELS: Readonly<Record<DocsEmbeddingModelKey, DocsEmbeddingModelSpec>> = {
  "qwen3-8b": {
    modelId: "alibaba/qwen3-embedding-8b",
    servingProvider: "deepinfra",
    microcentsPerToken: 1,
    queryPrefix:
      "Instruct: Given a question about the Customermates CRM, retrieve the documentation section that answers it\nQuery: ",
  },
  "google-multilingual": {
    modelId: "google/text-multilingual-embedding-002",
    servingProvider: "vertex",
    microcentsPerToken: 2.5,
    queryPrefix: "",
  },
};

const ESTIMATE_BYTES_PER_TOKEN = 3;

export type EmbeddingRun = { embeddings: number[][]; costMicrocents: number | null; latencyMs: number };

export type EmbeddingRunnerOptions = { timeoutMs?: number; now?: () => number };

export function estimateEmbeddingCostMicrocents(model: DocsEmbeddingModelKey, values: readonly string[]): number {
  const bytes = values.reduce((total, value) => total + Buffer.byteLength(value, "utf8"), 0);
  return Math.ceil(Math.ceil(bytes / ESTIMATE_BYTES_PER_TOKEN) * DOCS_EMBEDDING_MODELS[model].microcentsPerToken);
}

export async function runEmbedding(
  model: DocsEmbeddingModelKey,
  values: string[],
  options: EmbeddingRunnerOptions = {},
): Promise<EmbeddingRun> {
  const spec = DOCS_EMBEDDING_MODELS[model];
  const now = options.now ?? (() => performance.now());
  const started = now();
  const result = await embedMany({
    model: spec.modelId,
    values,
    maxRetries: 0,
    maxParallelCalls: 4,
    ...(options.timeoutMs ? { abortSignal: AbortSignal.timeout(options.timeoutMs) } : {}),
    providerOptions: {
      gateway: { only: [spec.servingProvider], zeroDataRetention: true, disallowPromptTraining: true },
    },
  });
  if (result.embeddings.length !== values.length) throw new Error("the embedding endpoint returned a wrong count");
  const charge = readAgentProviderCharge(result.providerMetadata, spec.servingProvider);
  return {
    embeddings: result.embeddings,
    costMicrocents: charge.outcome === "measured" ? charge.charge.costMicrocents : null,
    latencyMs: now() - started,
  };
}
