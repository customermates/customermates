import { describe, expect, it, vi } from "vitest";

import { WorkspaceSetupCrawlStarter } from "../workspace-setup-crawl-starter";

const CRAWL = {
  id: "00000000-0000-4000-8000-000000000009",
  userId: "00000000-0000-4000-8000-000000000001",
  status: "queued",
  failureReason: null,
  mode: "initial" as const,
  homepageUrl: "https://example.com/",
  registrableDomain: "example.com",
  pendingHosts: [],
  extraHosts: [],
};
const FAILED = { ...CRAWL, status: "failed", failureReason: "dispatch" };
const ARGS = { setupId: "00000000-0000-4000-8000-000000000002", attempt: 0, homepage: "example.com", locale: "en" };

function harness(existing: typeof CRAWL | typeof FAILED, retried: typeof CRAWL | null) {
  const crawls = {
    createCrawl: vi.fn(),
    findCrawlByClientRequest: vi.fn().mockResolvedValue(existing),
    failDispatch: vi.fn().mockResolvedValue(undefined),
    retryFailedDispatch: vi.fn().mockResolvedValue(retried),
  };
  const background = { dispatch: vi.fn().mockResolvedValue(undefined) };
  const wiki = { wikiIsEmpty: vi.fn().mockResolvedValue(true), dominantWikiLanguage: vi.fn().mockResolvedValue(null) };
  return { crawls, background, starter: new WorkspaceSetupCrawlStarter(wiki, crawls, background as never) };
}

describe("WorkspaceSetupCrawlStarter", () => {
  it("requeues and dispatches a crawl whose earlier dispatch failed", async () => {
    const { crawls, background, starter } = harness(FAILED, CRAWL);

    await expect(starter.start(ARGS)).resolves.toEqual({ status: "started", crawlId: CRAWL.id });
    expect(crawls.retryFailedDispatch).toHaveBeenCalledWith(CRAWL.id);
    expect(background.dispatch).toHaveBeenCalledWith("crawl-wiki-website", { crawlId: CRAWL.id, userId: CRAWL.userId });
  });

  it("reports an active crawl when the failed dispatch cannot be requeued", async () => {
    const { background, starter } = harness(FAILED, null);

    await expect(starter.start(ARGS)).resolves.toEqual({ status: "active" });
    expect(background.dispatch).not.toHaveBeenCalled();
  });
});
