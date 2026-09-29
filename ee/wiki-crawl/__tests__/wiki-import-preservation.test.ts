import { describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({
  env: { APP_MODE: "self-hosted", BASE_URL: "http://localhost:4000" },
}));
vi.mock("@/i18n/get-translator", () => ({
  getTranslator: () =>
    Promise.resolve((key: string, values?: { url: string }) => (key === "source" ? `Source: ${values?.url}` : "FAQ")),
}));

import { WikiWebsiteCrawlService } from "../wiki-website-crawl.service";

function harness(offset: number, knownRevision = true) {
  const importedAt = new Date("2026-09-29T00:00:00.000Z");
  const source = {
    id: "source-1",
    url: "https://example.com/pricing",
    category: "pricing",
    title: "Pricing",
    text: "New remote price. Customers can contact our support team whenever they have questions about their subscription. We explain the available options and provide clear information about the next steps. The customer can request a refund within thirty days after purchasing the annual subscription.",
    qaPairs: [],
    contentHash: "new",
    fetchedAt: new Date(),
    readAt: null,
  };
  const repo = {
    claimCrawl: vi.fn().mockResolvedValue(true),
    getCrawl: vi.fn().mockResolvedValue({
      id: "crawl-1",
      status: "importing",
      mode: "refresh",
      locale: "en",
      startedAt: new Date(),
    }),
    listSources: vi.fn().mockResolvedValue([source]),
    countImportedPages: vi.fn().mockResolvedValue(0),
    claimSourceImport: vi.fn().mockResolvedValue(true),
    findImportedPage: vi.fn().mockResolvedValue({
      id: "page-1",
      updatedAt: new Date(importedAt.getTime() + offset),
      sourceFetchedAt: importedAt,
      sourceImportedUpdatedAt: knownRevision ? importedAt : null,
      sourceContentHash: "old",
    }),
    markImported: vi.fn().mockResolvedValue(undefined),
    updateCrawl: vi.fn().mockResolvedValue(undefined),
  };
  const update = vi.fn().mockResolvedValue({
    ok: true,
    data: { id: "page-1", updatedAt: new Date(importedAt.getTime() + 2_000) },
  });
  const service = new WikiWebsiteCrawlService(
    repo as never,
    { invoke: vi.fn() } as never,
    { invoke: update } as never,
    () => Promise.resolve(null),
  );
  return { service, repo, update, importedAt, source };
}

describe("Wiki imported revision protection", () => {
  it.each([
    "Short unknown text",
    "Kunden können sich bei Fragen zu ihrem Vertrag an unseren Kundendienst wenden. Wir erklären die verfügbaren Möglichkeiten und informieren über die nächsten Schritte. Eine Rückerstattung kann innerhalb von dreißig Tagen nach dem Kauf des jährlichen Abonnements beantragt werden.",
  ])("does not import a foreign or uncertain source: %s", async (text) => {
    const { service, repo, update, source } = harness(0);
    source.text = text;
    await service.importSources("crawl-1");
    expect(update).not.toHaveBeenCalled();
    expect(repo.claimSourceImport).not.toHaveBeenCalled();
    expect(repo.markImported).not.toHaveBeenCalled();
  });

  it("excludes structured foreign FAQs before claiming an otherwise matching body", async () => {
    const { service, repo, source } = harness(0);
    source.qaPairs = [
      {
        question: "Refunds?",
        answer:
          "Kunden können sich bei Fragen zu ihrem Vertrag an unseren Kundendienst wenden. Wir erklären die verfügbaren Möglichkeiten und informieren über die nächsten Schritte. Eine Rückerstattung kann innerhalb von dreißig Tagen nach dem Kauf des jährlichen Abonnements beantragt werden.",
      },
    ] as never;
    await service.importSources("crawl-1");
    expect(repo.claimSourceImport).not.toHaveBeenCalled();
  });

  it("starts synthesis for an extension while leaving refresh synthesis disabled", async () => {
    const { repo } = harness(0);
    const crawl = {
      mode: "extend",
      locale: "de",
      discovered: 1,
      fetched: 1,
      status: "importing",
    };
    const extensionRepo = {
      ...repo,
      getCrawl: vi.fn().mockResolvedValue(crawl),
      deleteEarlierSources: vi.fn(),
    };
    const start = vi.fn().mockResolvedValue("conversation-1");
    const service = new WikiWebsiteCrawlService(extensionRepo as never, {} as never, {} as never, start);
    await service.finish("crawl-1");
    expect(start).toHaveBeenCalledExactlyOnceWith(crawl);
    expect(repo.claimCrawl).toHaveBeenCalledWith("crawl-1", ["importing"], {
      status: "synthesizing",
    });
  });

  it.each([1, 500, 1_000])("preserves an edit %s milliseconds after import", async (offset) => {
    const { service, update, repo } = harness(offset);
    await service.importSources("crawl-1");
    expect(update).not.toHaveBeenCalled();
    expect(repo.markImported).not.toHaveBeenCalled();
  });

  it("refreshes an exact imported revision and records the revision actually written", async () => {
    const { service, update, repo, importedAt, source } = harness(0);
    await service.importSources("crawl-1");
    expect(update).toHaveBeenCalledExactlyOnceWith({
      id: "page-1",
      expectedUpdatedAt: importedAt,
      markdown: expect.stringContaining("New remote price"),
    });
    expect(repo.markImported).toHaveBeenCalledExactlyOnceWith("page-1", {
      url: source.url,
      fetchedAt: source.fetchedAt,
      importedUpdatedAt: new Date(importedAt.getTime() + 2_000),
      contentHash: "new",
    });
  });

  it("does not infer an imported revision from old timestamps", async () => {
    const { service, update } = harness(0, false);
    await service.importSources("crawl-1");
    expect(update).not.toHaveBeenCalled();
  });

  it("does not advance source metadata when an edit wins the optimistic update race", async () => {
    const { service, update, repo } = harness(0);
    update.mockResolvedValue({ ok: false } as never);
    await service.importSources("crawl-1");
    expect(repo.markImported).not.toHaveBeenCalled();
  });
  it("surfaces a refresh that cannot read any saved source as retryable failure", async () => {
    const { repo } = harness(0);
    const unavailableRepo = {
      ...repo,
      getCrawl: vi.fn().mockResolvedValue({ mode: "refresh", discovered: 2, fetched: 0 }),
      deleteEarlierSources: vi.fn().mockResolvedValue(undefined),
    };
    const unavailable = new WikiWebsiteCrawlService(unavailableRepo as never, {} as never, {} as never, () =>
      Promise.resolve(null),
    );
    await unavailable.finish("crawl-1");
    expect(unavailableRepo.claimCrawl).toHaveBeenCalledWith(
      "crawl-1",
      ["importing"],
      expect.objectContaining({
        status: "failed",
        failureReason: "unavailable",
      }),
    );
  });
});
