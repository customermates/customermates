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

  it.each([undefined, 0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER])(
    "uses the UTF-8 attempt estimate when an unreadable receipt reports %s input tokens",
    async (tokens) => {
      provider.embed.mockResolvedValueOnce({
        embeddings: [Array(WIKI_EMBEDDING_DIMENSIONS).fill(0.25)],
        usage: { tokens },
        providerMetadata: {},
      });
      provider.charge.mockReturnValueOnce({ outcome: "unreadable", reason: "missing receipt" });
      const onCharge = vi.fn();

      const result = await embedWikiTexts(["é😀"], "query", { onCharge });

      expect(result.charge).toEqual(wikiEmbeddingAttemptCharge(["é😀"]));
      expect(onCharge).toHaveBeenCalledExactlyOnceWith(result.charge);
    },
  );

  it.each([0, 30])("preserves a measured %s debit when token usage is missing", async (costMicrocents) => {
    provider.embed.mockResolvedValueOnce({
      embeddings: [Array(WIKI_EMBEDDING_DIMENSIONS).fill(0.25)],
      providerMetadata: {},
    });
    provider.charge.mockReturnValueOnce({ outcome: "measured", charge: { costMicrocents } });
    const onCharge = vi.fn();

    const result = await embedWikiTexts(["é😀"], "query", { onCharge });

    expect(result.charge).toEqual({
      model: "google/gemini-embedding-001",
      inputTokens: 6,
      costMicrocents,
      costSource: "measured",
    });
    expect(onCharge).toHaveBeenCalledExactlyOnceWith(result.charge);
  });

  it("preserves a safe attempt charge before rejecting vectors with missing usage and receipt", async () => {
    provider.embed.mockResolvedValueOnce({ embeddings: [[0.25]], providerMetadata: {} });
    provider.charge.mockReturnValueOnce({ outcome: "unreadable", reason: "missing receipt" });
    const onCharge = vi.fn();

    await expect(embedWikiTexts(["é😀"], "query", { onCharge })).rejects.toThrow("dimensions are invalid");

    expect(onCharge).toHaveBeenCalledExactlyOnceWith(wikiEmbeddingAttemptCharge(["é😀"]));
  });

  it("preserves Gateway-proven unbilled work with safe input counters", async () => {
    provider.embed.mockResolvedValueOnce({
      embeddings: [Array(WIKI_EMBEDDING_DIMENSIONS).fill(0.25)],
      usage: { tokens: Number.NaN },
      providerMetadata: {},
    });
    provider.charge.mockReturnValueOnce({ outcome: "notBilled" });

    const result = await embedWikiTexts(["é😀"], "query");

    expect(result.charge).toEqual({
      model: "google/gemini-embedding-001",
      inputTokens: 6,
      costMicrocents: 0,
      costSource: "measured",
    });
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
