import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ fetch: vi.fn(), discover: vi.fn(), robots: vi.fn() }));
vi.mock("../wiki-crawl-robots", () => ({
  WikiCrawlRobots: vi.fn(function () {
    return { forUrl: calls.robots };
  }),
}));
vi.mock("../website-crawler", () => ({
  fetchWikiSource: calls.fetch,
  discoverWikiWebsite: calls.discover,
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

beforeEach(() => {
  vi.clearAllMocks();
  calls.robots.mockResolvedValue({ crawlDelayMs: 0 });
});
afterEach(() => vi.useRealTimers());

describe("persisted per-page crawl progress", () => {
  it.each([1_000, 2_000])("spaces actual fetch starts after delayed claims by %i ms", async (delay) => {
    vi.useFakeTimers();
    const { service, repo } = fixture();
    const targets = [0, 1, 2].map((i) => ({ url: `https://example.com/${i}`, category: "help", status: "pending" }));
    repo.getCrawl.mockResolvedValue({ status: "fetching", targets, extraHosts: [], crawlDelayMs: 0 });
    calls.robots.mockResolvedValue({ crawlDelayMs: delay });
    repo.updateTargetStatus.mockImplementation(async (_id, url, status) => {
      if (url === targets[0].url && status === "reading")
        await new Promise((resolve) => setTimeout(resolve, delay + 500));

      return true;
    });
    const starts: number[] = [];
    calls.fetch.mockImplementation(async (url: string) => {
      starts.push(Date.now());
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      return { url, text: "Source", title: "Help", qaPairs: [], contentHash: url };
    });
    const run = service.fetchBatch("crawl", 0);
    await vi.advanceTimersByTimeAsync(delay + 500);
    expect(starts).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(delay * 2);
    expect(starts).toHaveLength(3);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(delay);
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(delay);
    expect(repo.saveSource).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
    await run;
    expect(repo.saveSource).toHaveBeenCalledTimes(3);
  });

  it("overlaps slow page reads while preserving robots delays and tolerating a failed page", async () => {
    vi.useFakeTimers();
    const { service, repo } = fixture();
    const targets = Array.from({ length: 3 }, (_, i) => ({
      url: `https://example.com/${i}`,
      category: "help",
      status: "pending",
    }));
    repo.getCrawl.mockResolvedValue({ status: "fetching", targets, extraHosts: [], crawlDelayMs: 0 });
    repo.updateTargetStatus.mockImplementation((_id, url, status) => {
      const target = targets.find((item) => item.url === url);
      if (!target) throw new Error("Missing fixture target");
      target.status = status;
      return true;
    });
    calls.robots.mockResolvedValue({ crawlDelayMs: 2_000 });
    let finishFirst!: () => void;
    calls.fetch.mockImplementation(async (url: string) => {
      if (url === targets[0].url) {
        await new Promise<void>((resolve) => {
          finishFirst = resolve;
        });
      }
      if (url === targets[1].url) throw new Error("Unavailable page");
      return { url, text: "Source", title: "Help", qaPairs: [], contentHash: url };
    });
    const run = service.fetchBatch("crawl", 0);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(calls.fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls.fetch).toHaveBeenCalledTimes(2);
    expect(targets[0].status).toBe("reading");
    await vi.advanceTimersByTimeAsync(2_000);
    expect(calls.fetch).toHaveBeenCalledTimes(3);
    expect(targets.map(({ status }) => status)).toEqual(["reading", "failed", "read"]);
    finishFirst();
    await run;
    expect(targets.map(({ status }) => status)).toEqual(["read", "failed", "read"]);
    expect(repo.saveSource).toHaveBeenCalledTimes(2);
  });

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

  it.each(["initial", "extend", "refresh"] as const)(
    "completes an empty %s target set and remains terminal on replay",
    async (mode) => {
      const { service, repo } = fixture();
      const crawl = {
        id: "crawl",
        status: "queued",
        mode,
        targets: [],
        extraHosts: ["docs.example.com"],
        crawlDelayMs: 0,
      };
      repo.getCrawl.mockImplementation(() => Promise.resolve(crawl));
      repo.claimCrawl.mockImplementation((_id, from, patch) => {
        if (!from.includes(crawl.status)) return Promise.resolve(false);
        Object.assign(crawl, patch);
        return Promise.resolve(true);
      });
      repo.listRefreshTargets.mockResolvedValue([]);
      calls.discover.mockResolvedValue({
        status: "ready",
        targets: mode === "extend" ? [{ url: "https://example.com/help", category: "help" }] : [],
        pendingHosts: [],
        crawlDelayMs: 0,
      });

      await expect(service.discover("crawl")).resolves.toBe(0);
      expect(crawl).toMatchObject({ status: "completed", targets: [], discovered: 0, finishedAt: expect.any(Date) });
      expect(repo.claimCrawl).toHaveBeenLastCalledWith(
        "crawl",
        ["discovering"],
        expect.objectContaining({
          status: "completed",
          targets: [],
          discovered: 0,
          finishedAt: expect.any(Date),
        }),
      );
      const discoveryCalls = calls.discover.mock.calls.length;
      const claimCalls = repo.claimCrawl.mock.calls.length;
      await expect(service.discover("crawl")).resolves.toBe(0);
      expect(calls.discover).toHaveBeenCalledTimes(discoveryCalls);
      expect(repo.claimCrawl).toHaveBeenCalledTimes(claimCalls);
      expect(calls.fetch).not.toHaveBeenCalled();
      expect(calls.robots).not.toHaveBeenCalled();
      expect(repo.updateTargetStatus).not.toHaveBeenCalled();
      expect(repo.saveSource).not.toHaveBeenCalled();
    },
  );

  it("continues a per-target batch without refetching settled pages or resetting prior progress", async () => {
    vi.useFakeTimers();
    const { service, repo } = fixture();
    const statuses = ["read", "read", "read", "read", "failed", "pending"] as const;
    const targets = statuses.map((status, index) => ({
      url: `https://example.com/${index}`,
      category: "help",
      status,
    }));
    repo.getCrawl.mockResolvedValue({
      status: "fetching",
      targets,
      discovered: 6,
      fetched: 4,
      failed: 1,
      extraHosts: [],
      crawlDelayMs: 0,
    });
    repo.updateTargetStatus.mockImplementation((_id, url, status) => {
      const target = targets.find((item) => item.url === url);
      if (!target || target.status === "read" || target.status === "failed") return false;
      target.status = status;
      return true;
    });
    calls.fetch.mockResolvedValue({
      url: targets[5].url,
      text: "Source",
      title: "Help",
      qaPairs: [],
      contentHash: "hash",
    });
    const run = service.fetchBatch("crawl", 1);
    await vi.runAllTimersAsync();
    await run;
    expect(repo.saveSource).toHaveBeenCalledExactlyOnceWith("crawl", expect.objectContaining({ url: targets[5].url }));
    expect(calls.fetch).toHaveBeenCalledExactlyOnceWith(targets[5].url, expect.anything(), expect.anything());
    expect(repo.updateTargetStatus.mock.calls).toEqual([
      ["crawl", targets[5].url, "reading"],
      ["crawl", targets[5].url, "read"],
    ]);
    expect(repo.updateCrawl).not.toHaveBeenCalled();
    expect(targets.map(({ status }) => status)).toEqual(["read", "read", "read", "read", "failed", "read"]);
    expect(targets.filter(({ status }) => status === "read")).toHaveLength(5);
    expect(targets.filter(({ status }) => status === "failed")).toHaveLength(1);
    await service.fetchBatch("crawl", 0);
    await service.fetchBatch("crawl", 1);
    expect(calls.fetch).toHaveBeenCalledOnce();
    expect(repo.saveSource).toHaveBeenCalledOnce();
  });

  it("rejects persisted targets with missing progress status without inventing an aggregate fallback", async () => {
    const { service, repo } = fixture();
    const targets = [{ url: "https://example.com/help", category: "help" }];
    repo.getCrawl.mockResolvedValue({
      status: "fetching",
      targets,
      discovered: 1,
      fetched: 0,
      failed: 0,
      extraHosts: [],
      crawlDelayMs: 0,
    });
    await expect(service.fetchBatch("crawl", 0)).rejects.toThrow("Knowledge Base crawl progress is invalid.");
    expect(calls.robots).not.toHaveBeenCalled();
    expect(calls.fetch).not.toHaveBeenCalled();
    expect(repo.updateTargetStatus).not.toHaveBeenCalled();
    expect(repo.saveSource).not.toHaveBeenCalled();
    expect(repo.updateCrawl).not.toHaveBeenCalled();
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

  it.each(["pending", "reading"] as const)(
    "continues a %s batch after thrown and empty pages to save a later source",
    async (initialStatus) => {
      vi.useFakeTimers();
      const { service, repo } = fixture();
      const targets = Array.from({ length: 3 }, (_, i) => ({
        url: `https://example.com/${i}`,
        category: "help",
        status: initialStatus as "pending" | "reading" | "read" | "failed",
      }));
      repo.getCrawl.mockResolvedValue({ status: "fetching", targets, discovered: 3, extraHosts: [], crawlDelayMs: 0 });
      repo.updateTargetStatus.mockImplementation((_id, url, status) => {
        const target = targets.find((item) => item.url === url);
        if (!target) throw new Error("Missing fixture target");
        if (target.status === "read" || target.status === "failed") return false;
        target.status = status;
        return true;
      });
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
      expect(repo.updateCrawl).not.toHaveBeenCalled();
      expect(targets.map(({ status }) => status)).toEqual(["failed", "failed", "read"]);
      expect(targets.filter(({ status }) => status === "failed")).toHaveLength(2);
      await service.fetchBatch("crawl", 0);
      expect(calls.fetch).toHaveBeenCalledTimes(3);
      expect(repo.saveSource).toHaveBeenCalledOnce();
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
