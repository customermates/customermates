import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ fetch: vi.fn(), discover: vi.fn() }));
vi.mock("../website-crawler", () => ({
  fetchWikiSource: calls.fetch,
  discoverWikiWebsite: calls.discover,
  WikiCrawlRobots: vi.fn(),
}));
vi.mock("@/env", () => ({ env: { APP_MODE: "self-hosted", BASE_URL: "http://localhost:4000" } }));

import { WikiWebsiteCrawlService } from "../wiki-website-crawl.service";

function fixture(status: "pending" | "reading" | "read" | "failed" = "pending") {
  const target = { url: "https://example.com/help", category: "help", status };
  const events: string[] = [];
  const repo = {
    getCrawl: vi.fn().mockResolvedValue({
      id: "crawl",
      status: "fetching",
      targets: [target],
      registrableDomain: "example.com",
      extraHosts: [],
      crawlDelayMs: 0,
    }),
    updateTargetStatus: vi.fn().mockImplementation((_id, _url, next) => {
      if (target.status === "read" || target.status === "failed") return false;
      target.status = next;
      events.push(next);
      return true;
    }),
    saveSource: vi.fn().mockImplementation(() => {
      events.push("saved");
    }),
    settleCrawl: vi.fn().mockResolvedValue(undefined),
    updateCrawl: vi.fn(),
    countSources: vi.fn(),
    claimCrawl: vi.fn().mockResolvedValue(true),
    listRefreshTargets: vi.fn(),
  };
  const service = new WikiWebsiteCrawlService(repo as never, {} as never, {} as never, () =>
    Promise.resolve({ conversationId: null, failureReason: "synthesisNotStarted" }),
  );
  return { target, repo, service, events };
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.useRealTimers());

describe("persisted per-page crawl progress", () => {
  it.each(["initial", "refresh"])("initializes explicit pending targets during %s discovery", async (mode) => {
    const { service, repo } = fixture();
    const target = { url: "https://example.com/help", category: "help" };
    repo.getCrawl.mockResolvedValue({ id: "crawl", status: "queued", mode, targets: [], extraHosts: [] });
    repo.listRefreshTargets.mockResolvedValue([target]);
    calls.discover.mockResolvedValue({ status: "ready", targets: [target], pendingHosts: [], crawlDelayMs: 0 });
    await service.discover("crawl");
    expect(repo.claimCrawl).toHaveBeenCalledWith(
      "crawl",
      ["discovering"],
      expect.objectContaining({
        targets: [{ ...target, status: "pending" }],
        discovered: 1,
      }),
    );
  });

  it("continues a legacy crawl with aggregate counters instead of resetting prior progress", async () => {
    const { service, repo } = fixture();
    const targets = Array.from({ length: 6 }, (_, i) => ({ url: `https://example.com/${i}`, category: "help" }));
    repo.getCrawl.mockResolvedValue({
      status: "fetching",
      targets,
      discovered: 6,
      fetched: 4,
      failed: 1,
      extraHosts: [],
      crawlDelayMs: 0,
    });
    repo.countSources.mockResolvedValue(5);
    calls.fetch.mockResolvedValue({
      url: targets[5].url,
      text: "Source",
      title: "Help",
      qaPairs: [],
      contentHash: "hash",
    });
    await service.fetchBatch("crawl", 1);
    expect(repo.saveSource).toHaveBeenCalledOnce();
    expect(repo.updateTargetStatus).not.toHaveBeenCalled();
    expect(repo.updateCrawl).toHaveBeenCalledWith("crawl", { fetched: 5, failed: 1 });
    expect(targets.every((target) => !("status" in target))).toBe(true);
  });

  it("marks reading before fetch and read only after the source has been saved", async () => {
    const { service, target, events, repo } = fixture();
    calls.fetch.mockImplementation(() => {
      expect(target.status).toBe("reading");
      events.push("fetched");
      return { url: target.url, text: "Source", title: "Help", qaPairs: [], contentHash: "hash" };
    });
    await service.fetchBatch("crawl", 0);
    expect(events).toEqual(["reading", "fetched", "saved", "read"]);
    expect(target.status).toBe("read");
    expect(repo.updateCrawl).not.toHaveBeenCalled();
    await service.fetchBatch("crawl", 0);
    expect(calls.fetch).toHaveBeenCalledOnce();
  });

  it.each(["read", "failed"] as const)("does not refetch settled %s targets on redelivery", async (status) => {
    const { service, repo } = fixture(status);
    await service.fetchBatch("crawl", 0);
    expect(calls.fetch).not.toHaveBeenCalled();
    expect(repo.updateTargetStatus).not.toHaveBeenCalled();
  });

  it("retries an interrupted reading target and settles an unavailable page as failed", async () => {
    const { service, events, target } = fixture("reading");
    calls.fetch.mockResolvedValue(null);
    await service.fetchBatch("crawl", 0);
    expect(events).toEqual(["reading", "failed"]);
    expect(target.status).toBe("failed");
    await service.fetchBatch("crawl", 0);
    expect(calls.fetch).toHaveBeenCalledOnce();
  });

  it("does not fetch after the atomic status guard refuses a stale target", async () => {
    const { service, repo } = fixture();
    repo.updateTargetStatus.mockResolvedValue(false);
    await service.fetchBatch("crawl", 0);
    expect(calls.fetch).not.toHaveBeenCalled();
    expect(repo.saveSource).not.toHaveBeenCalled();
  });

  it("settles a throwing fetch as failed without aborting the batch", async () => {
    const { service, events } = fixture();
    const error = new Error("fetch failed");
    calls.fetch.mockRejectedValue(error);
    await expect(service.fetchBatch("crawl", 0)).resolves.toBeUndefined();
    expect(events).toEqual(["reading", "failed"]);
  });

  it.each([false, true])(
    "continues after thrown and empty pages to save a later source (legacy=%s)",
    async (legacy) => {
      vi.useFakeTimers();
      const { service, repo } = fixture();
      const targets = Array.from({ length: 3 }, (_, i) => ({
        url: `https://example.com/${i}`,
        category: "help",
        ...(legacy ? {} : { status: "pending" }),
      }));
      repo.getCrawl.mockResolvedValue({ status: "fetching", targets, discovered: 3, extraHosts: [], crawlDelayMs: 0 });
      repo.updateTargetStatus.mockImplementation((_id, url, status) => {
        const target = targets.find((item) => item.url === url);
        if (!target) throw new Error("Missing fixture target");
        target.status = status;
        return true;
      });
      repo.countSources.mockResolvedValue(1);
      calls.fetch
        .mockRejectedValueOnce(new Error("network failure"))
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          url: targets[2].url,
          text: "Source",
          title: "Help",
          qaPairs: [],
          contentHash: "hash",
        });
      const run = service.fetchBatch("crawl", 0);
      await vi.runAllTimersAsync();
      await run;
      expect(calls.fetch.mock.calls.map(([url]) => url)).toEqual(targets.map(({ url }) => url));
      expect(repo.saveSource).toHaveBeenCalledExactlyOnceWith(
        "crawl",
        expect.objectContaining({ url: targets[2].url }),
      );
      if (legacy) {
        expect(repo.updateTargetStatus).not.toHaveBeenCalled();
        expect(repo.updateCrawl).toHaveBeenCalledWith("crawl", { fetched: 1, failed: 2 });
      } else expect(targets.map(({ status }) => status)).toEqual(["failed", "failed", "read"]);
    },
  );

  it("propagates persistence failure when recording a failed page", async () => {
    const { service, repo } = fixture();
    calls.fetch.mockRejectedValue(new Error("network failure"));
    repo.updateTargetStatus.mockResolvedValueOnce(true).mockRejectedValueOnce(new Error("database failed"));
    await expect(service.fetchBatch("crawl", 0)).rejects.toThrow("database failed");
    expect(repo.saveSource).not.toHaveBeenCalled();
  });

  it.each(["initial", "extend"])("does not start paid synthesis when %s has no stored sources", async (mode) => {
    const { repo } = fixture();
    repo.getCrawl.mockResolvedValue({ status: "importing", mode, discovered: 3, fetched: 0 });
    repo.countSources.mockResolvedValue(0);
    const start = vi.fn();
    const service = new WikiWebsiteCrawlService(
      { ...repo, deleteEarlierSources: vi.fn() } as never,
      {} as never,
      {} as never,
      start,
    );
    await service.finish("crawl");
    expect(start).not.toHaveBeenCalled();
    expect(repo.claimCrawl).toHaveBeenCalledExactlyOnceWith(
      "crawl",
      ["importing"],
      expect.objectContaining({ status: "failed", failureReason: "unavailable" }),
    );
  });

  it("keeps reading retryable when source persistence fails", async () => {
    const { service, target, repo } = fixture();
    calls.fetch.mockResolvedValue({ url: target.url, text: "Source", title: "Help", qaPairs: [], contentHash: "hash" });
    repo.saveSource.mockRejectedValue(new Error("database failed"));
    await expect(service.fetchBatch("crawl", 0)).rejects.toThrow("database failed");
    expect(target.status).toBe("reading");
  });
});
