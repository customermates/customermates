import { beforeEach, describe, expect, it, vi } from "vitest";

const provider = vi.hoisted(() => ({ embed: vi.fn(), charge: vi.fn() }));
vi.mock("ai", () => ({ embedMany: provider.embed }));
vi.mock("@/ee/agent-chat/gateway-cost", () => ({ readAgentProviderCharge: provider.charge }));

import { embedWikiTexts, wikiEmbeddingAttemptCharge, WIKI_EMBEDDING_DIMENSIONS } from "../wiki-embedding-model";

beforeEach(() => {
  provider.embed.mockReset().mockResolvedValue({
    embeddings: [Array(WIKI_EMBEDDING_DIMENSIONS).fill(0.25)],
    usage: { tokens: 2 },
    providerMetadata: { receipt: true },
  });
  provider.charge.mockReset().mockReturnValue({ outcome: "measured", charge: { costMicrocents: 30 } });
});

describe("embedding provider boundary", () => {
  it("uses UTF-8 bytes for conservative attempted spend", () => {
    expect(wikiEmbeddingAttemptCharge(["é😀"])).toEqual({
      model: "google/gemini-embedding-001",
      inputTokens: 6,
      costMicrocents: 90,
      costSource: "estimated",
    });
  });

  it("returns validated vectors and preserves the measured charge", async () => {
    const onCharge = vi.fn();
    const result = await embedWikiTexts(["query"], "query", { maxRetries: 0, onCharge });
    expect(result.vectors).toHaveLength(1);
    expect(result.vectors[0]).toHaveLength(WIKI_EMBEDDING_DIMENSIONS);
    expect(onCharge).toHaveBeenCalledExactlyOnceWith(result.charge);
    expect(result.charge.costMicrocents).toBe(30);
    expect(provider.embed).toHaveBeenCalledWith(expect.objectContaining({ maxRetries: 0 }));
  });

  it.each(
    [
      [],
      [[0.25]],
      [Array(WIKI_EMBEDDING_DIMENSIONS).fill(Number.NaN)],
      [Array(WIKI_EMBEDDING_DIMENSIONS).fill(0.25), Array(WIKI_EMBEDDING_DIMENSIONS).fill(0.25)],
    ].map((embeddings) => ({ embeddings })),
  )("records the receipt before rejecting an invalid vector response", async ({ embeddings }) => {
    provider.embed.mockResolvedValueOnce({ embeddings, usage: { tokens: 2 }, providerMetadata: {} });
    const onCharge = vi.fn();
    await expect(embedWikiTexts(["query"], "query", { onCharge })).rejects.toThrow("dimensions are invalid");
    expect(onCharge).toHaveBeenCalledExactlyOnceWith({
      model: "google/gemini-embedding-001",
      inputTokens: 2,
      costMicrocents: 30,
      costSource: "measured",
    });
  });

  it("rejects an invalid batch without starting provider work", async () => {
    await expect(embedWikiTexts([], "query")).rejects.toThrow("batch size is invalid");
    expect(provider.embed).not.toHaveBeenCalled();
  });
});
