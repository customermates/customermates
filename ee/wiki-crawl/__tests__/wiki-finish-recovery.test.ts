import { describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({ env: { APP_MODE: "self-hosted", BASE_URL: "http://localhost:4000" } }));
vi.mock("@/i18n/get-translator", () => ({ getTranslator: () => Promise.resolve(() => "Create the Wiki") }));

import { WikiWebsiteCrawlService, type WikiCrawlRecord } from "../wiki-website-crawl.service";
import { wikiCrawlSynthesisStarter } from "../wiki-crawl-synthesis";

function fixture(status = "importing") {
  const row = {
    id: "crawl",
    clientRequestId: "request",
    homepageUrl: "https://example.com/",
    locale: "en",
    mode: "initial",
    status,
    conversationId: null,
  } as unknown as WikiCrawlRecord;
  const repo = {
    settleCrawl: vi.fn((_id: string, result: { conversationId: string | null; failureReason: string | null }) => {
      if (row.status === "synthesizing")
        Object.assign(row, result, { status: result.conversationId ? "completed" : "failed" });
      return Promise.resolve();
    }),
    getCrawl: vi.fn(() => Promise.resolve({ ...row })),
    deleteEarlierSources: vi.fn(),
    countSources: vi.fn().mockResolvedValue(1),
    claimCrawl: vi.fn((_id: string, from: string[], patch: Partial<WikiCrawlRecord>) => {
      if (!from.includes(row.status)) return Promise.resolve(false);
      Object.assign(row, patch);
      return Promise.resolve(true);
    }),
  };
  return { row, repo };
}

describe("Wiki synthesis finish recovery", () => {
  it("resumes a crash after claiming synthesis without abandoning the crawl", async () => {
    const { row, repo } = fixture("synthesizing");
    const invoke = vi
      .fn()
      .mockResolvedValue({ ok: true, data: { disposition: "run", conversationId: "conversation" } });
    const service = new WikiWebsiteCrawlService(
      repo as never,
      {} as never,
      {} as never,
      wikiCrawlSynthesisStarter({ invoke }),
    );
    await service.finish("crawl");
    expect(invoke).toHaveBeenCalledWith(expect.objectContaining({ clientRequestId: "request" }));
    expect(row).toMatchObject({ status: "completed", conversationId: "conversation" });
  });

  it("replays the same admitted request after transport loss without dispatching twice", async () => {
    const { row, repo } = fixture();
    const dispatch = vi.fn().mockResolvedValue(undefined);
    let admitted = false;
    const invoke = vi.fn(async (input: { clientRequestId: string }) => {
      expect(input.clientRequestId).toBe("request");
      if (!admitted) {
        admitted = true;
        await dispatch();
        throw new Error("Local workflow transport closed after admission");
      }
      return {
        ok: true as const,
        data: {
          disposition: "running" as const,
          clientRequestId: "request",
          conversationId: "conversation",
          retryAllowed: false,
        },
      };
    });
    const service = new WikiWebsiteCrawlService(
      repo as never,
      {} as never,
      {} as never,
      wikiCrawlSynthesisStarter({ invoke }),
    );
    await expect(service.finish("crawl")).rejects.toThrow("transport closed");
    expect(row.status).toBe("synthesizing");
    await service.finish("crawl");
    expect(row).toMatchObject({ status: "completed", conversationId: "conversation" });
    expect(dispatch).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("keeps a busy concurrent admission retryable until the winning attempt completes", async () => {
    const { row, repo } = fixture("synthesizing");
    const start = vi
      .fn()
      .mockResolvedValueOnce({ conversationId: null, failureReason: "synthesisAdmission:agentTurnAlreadyRunning" })
      .mockResolvedValueOnce({ conversationId: "conversation", failureReason: null });
    const service = new WikiWebsiteCrawlService(repo as never, {} as never, {} as never, start);
    await expect(service.finish("crawl")).rejects.toThrow("still busy");
    expect(row.status).toBe("synthesizing");
    await service.finish("crawl");
    expect(row).toMatchObject({ status: "completed", conversationId: "conversation" });
  });
});
