import type { AgentRetrievalGrant, AgentUsageService } from "@/ee/agent-chat/agent-usage.service";

import { describe, expect, it, vi } from "vitest";

const provider = vi.hoisted(() => ({ embed: vi.fn() }));

vi.mock("../wiki-embedding-model", () => ({
  WIKI_EMBEDDING_MODEL: "embedding",
  wikiEmbeddingWorstCaseMicrocents: () => 90,
  wikiEmbeddingAttemptCharge: () => ({
    model: "embedding",
    inputTokens: 6,
    costMicrocents: 90,
    costSource: "estimated",
  }),
  embedWikiTexts: provider.embed,
}));

import { WikiEmbeddingService } from "../wiki-embedding.service";

const grant = { purpose: "wikiRetrieval", companyId: "company", userId: "user" } as AgentRetrievalGrant;
const charge = { model: "embedding", inputTokens: 4, costMicrocents: 60, costSource: "measured" as const };

function usage() {
  const reservation = { id: "hold", grant, reservedMicrocents: 90, reservedAt: new Date() };
  const reserveRetrieval = vi.fn(() => Promise.resolve(reservation));
  const settleRetrieval = vi.fn(() => Promise.resolve());
  return {
    service: { reserveRetrieval, settleRetrieval } as unknown as AgentUsageService,
    reservation,
    settleRetrieval,
  };
}

describe("Wiki embedding charging", () => {
  it("charges the grant for a used embedding and the platform for one no search took", async () => {
    provider.embed.mockResolvedValue({ vectors: [[0.1]], charge });

    const used = usage();
    await expect(new WikiEmbeddingService(used.service).embedTexts(grant, ["q"], "query")).resolves.toEqual([[0.1]]);
    expect(used.settleRetrieval).toHaveBeenCalledWith({ reservation: used.reservation, charge, payer: "grant" });

    const unused = usage();
    const claim = vi.fn(() => false);
    await expect(new WikiEmbeddingService(unused.service).embedTexts(grant, ["q"], "query", claim)).resolves.toEqual([
      [0.1],
    ]);
    expect(claim).toHaveBeenCalledTimes(1);
    expect(unused.settleRetrieval).toHaveBeenCalledWith({ reservation: unused.reservation, charge, payer: "platform" });
  });

  it("refunds the user and records attempted provider cost on the platform when the call fails", async () => {
    provider.embed.mockRejectedValue(new Error("gateway"));
    const failed = usage();
    const claim = vi.fn(() => true);

    await expect(new WikiEmbeddingService(failed.service).embedTexts(grant, ["q"], "query", claim)).rejects.toThrow(
      "gateway",
    );
    expect(claim).not.toHaveBeenCalled();
    expect(failed.settleRetrieval).toHaveBeenCalledWith({
      reservation: failed.reservation,
      charge: { model: "embedding", inputTokens: 6, costMicrocents: 90, costSource: "estimated" },
      payer: "platform",
    });
  });
  it("settles the measured receipt to the platform when provider vectors are invalid", async () => {
    provider.embed.mockImplementationOnce((_texts, _kind, options) => {
      options.onCharge(charge);
      return Promise.reject(new Error("invalid vectors"));
    });
    const failed = usage();
    await expect(new WikiEmbeddingService(failed.service).embedTexts(grant, ["q"], "query")).rejects.toThrow(
      "invalid vectors",
    );
    expect(failed.settleRetrieval).toHaveBeenCalledExactlyOnceWith({
      reservation: failed.reservation,
      charge,
      payer: "platform",
    });
    expect(provider.embed.mock.calls.at(-1)?.[2]).toEqual({ maxRetries: 0, onCharge: expect.any(Function) });
  });
});
