import type { AgentRetrievalGrant, AgentUsageService } from "@/ee/agent-chat/agent-usage.service";

import { describe, expect, it, vi } from "vitest";

const provider = vi.hoisted(() => ({ generate: vi.fn() }));

vi.mock("@/ee/agent-chat/structured-model-call", () => ({
  structuredCallWorstCaseMicrocents: () => 90,
  generateStructuredObject: provider.generate,
}));

import { WikiSummaryService } from "../wiki-summary.service";

const grant = {
  purpose: "wikiIndexing",
  companyId: "company",
  userId: null,
} as AgentRetrievalGrant;
const page = {
  title: "Refunds",
  markdown: "Money back within 30 days.",
  updatedAt: new Date(),
  summary: null,
  summaryContentHash: null,
  sourceImportedUpdatedAt: null,
};

function usage(reserved = true) {
  const reservation = {
    id: "hold",
    grant,
    reservedMicrocents: 90,
    reservedAt: new Date(),
  };
  const settleRetrieval = vi.fn(() => Promise.resolve());
  return {
    service: {
      reserveRetrieval: vi.fn(() => Promise.resolve(reserved ? reservation : null)),
      settleRetrieval,
    } as unknown as AgentUsageService,
    settleRetrieval,
  };
}

describe("Wiki summary outcomes", () => {
  it("returns a bounded summary charged to the grant", async () => {
    provider.generate.mockResolvedValue({
      output: { summary: "  Refund   rules. " },
      charge: null,
    });
    const used = usage();
    await expect(new WikiSummaryService(used.service).summarize(grant, page)).resolves.toEqual({
      status: "generated",
      summary: "Refund rules.",
    });
    expect(used.settleRetrieval).toHaveBeenCalledWith(expect.objectContaining({ payer: "grant" }));
  });

  it("reports a page-specific failure, so the indexer can move on to the next page", async () => {
    provider.generate.mockResolvedValue({
      output: null,
      charge: null,
      failureScope: "request",
    });
    const used = usage();
    await expect(new WikiSummaryService(used.service).summarize(grant, page)).resolves.toEqual({ status: "failed" });
    expect(used.settleRetrieval).toHaveBeenCalledWith(expect.objectContaining({ payer: "platform" }));
  });

  it("reports the provider as unavailable when a failure is not about the page", async () => {
    provider.generate.mockResolvedValue({
      output: null,
      charge: null,
      failureScope: "provider",
    });
    await expect(new WikiSummaryService(usage().service).summarize(grant, page)).resolves.toEqual({
      status: "unavailable",
    });
  });

  it("reports the provider as unavailable without calling it when credits refuse the reservation", async () => {
    provider.generate.mockClear();
    await expect(new WikiSummaryService(usage(false).service).summarize(grant, page)).resolves.toEqual({
      status: "unavailable",
    });
    expect(provider.generate).not.toHaveBeenCalled();
  });
});
