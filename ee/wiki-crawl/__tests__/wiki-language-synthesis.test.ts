import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  create: vi.fn(),
  crawl: vi.fn(),
  sources: vi.fn(),
  count: vi.fn(),
  imported: vi.fn(),
}));
vi.mock("@/core/di", () => ({
  getCreateWikiPagesInteractor: () => ({ invoke: harness.create }),
  getWikiWebsiteCrawlRepo: () => ({
    getCrawl: harness.crawl,
    listSources: harness.sources,
    countSynthesizedPages: harness.count,
    findImportedPage: harness.imported,
  }),
}));
vi.mock("@/i18n/get-translator", () => ({
  getTranslator: () => Promise.resolve((key: string) => key),
}));

import { createWikiFromCrawlTool, readWebsiteSourceTool } from "../wiki-crawl-synthesis-tools";

const ENGLISH =
  "Customers can contact our support team whenever they have questions about their subscription. We explain the available options and provide clear information about the next steps. The customer can request a refund within thirty days after purchasing the annual subscription.";
const GERMAN =
  "Kunden können sich bei Fragen zu ihrem Vertrag an unseren Kundendienst wenden. Wir erklären die verfügbaren Möglichkeiten und informieren über die nächsten Schritte. Eine Rückerstattung kann innerhalb von dreißig Tagen nach dem Kauf des jährlichen Abonnements beantragt werden.";
const SOURCE_ID = "00000000-0000-4000-8000-000000000001";
const page = (content: string, kind: "knowledge" | "guide" = "knowledge") => ({
  title: "Company",
  kind,
  sections: [{ heading: "Support", content }],
  sourceIds: [SOURCE_ID],
});

beforeEach(() => {
  vi.clearAllMocks();
  harness.crawl.mockResolvedValue({
    locale: "en",
    mode: "initial",
    startedAt: new Date(),
  });
  harness.count.mockResolvedValue(0);
  harness.imported.mockResolvedValue(null);
  harness.sources.mockResolvedValue([
    {
      id: SOURCE_ID,
      url: "https://example.com/de/help",
      category: "help",
      title: "Support",
      text: GERMAN,
      contentHash: "hash-1",
      fetchedAt: new Date(),
      readAt: new Date(),
    },
  ]);
  harness.create.mockResolvedValue({ ok: true, data: [] });
});

describe("single language Wiki synthesis", () => {
  it("reports actual persisted imports, including quota and failed-create omissions", async () => {
    const tool = readWebsiteSourceTool("crawl-1");
    harness.sources.mockResolvedValue([
      {
        id: SOURCE_ID,
        url: "https://example.com/help",
        category: "help",
        text: ENGLISH,
        contentHash: "hash-1",
        readAt: null,
      },
    ]);
    for (const existing of [null, { sourceContentHash: "older-version" }]) {
      harness.imported.mockResolvedValue(existing);
      expect(await tool.execute({ action: "list" })).toMatchObject({
        structuredContent: { items: [{ imported: false }] },
      });
    }
    harness.imported.mockResolvedValue({ sourceContentHash: "hash-1" });
    expect(await tool.execute({ action: "list" })).toMatchObject({
      structuredContent: { items: [{ imported: true }] },
    });
    expect(harness.imported).toHaveBeenCalledWith("https://example.com/help");
  });

  it("rejects a substantive foreign trigger even when section bodies match", async () => {
    const value = { ...page(ENGLISH), kind: "procedure" as const, whenToUse: GERMAN };
    const result = await createWikiFromCrawlTool("en", "crawl-1").execute({ action: "create", pages: [value] });
    expect(JSON.stringify(result)).toContain("Write every page in en");
    expect(harness.create).not.toHaveBeenCalled();
  });

  it("rejects confidently foreign output using the persisted target even when tool locale differs", async () => {
    const result = await createWikiFromCrawlTool("de", "crawl-1").execute({
      action: "create",
      pages: [page(GERMAN)],
    });
    expect(JSON.stringify(result)).toContain("Write every page in en");
    expect(harness.create).not.toHaveBeenCalled();
  });

  it("rejects a foreign section hidden inside otherwise target-language content", async () => {
    const value = page(ENGLISH);
    value.sections.push({ heading: "Details", content: GERMAN });
    await createWikiFromCrawlTool("en", "crawl-1").execute({
      action: "create",
      pages: [value],
    });
    expect(harness.create).not.toHaveBeenCalled();
  });

  it("accepts target-language synthesis grounded in foreign sources", async () => {
    await createWikiFromCrawlTool("de", "crawl-1").execute({
      action: "create",
      pages: [page(ENGLISH)],
    });
    expect(harness.create).toHaveBeenCalledWith(
      expect.objectContaining({
        pages: [
          expect.objectContaining({
            markdown: expect.stringContaining(ENGLISH),
          }),
        ],
      }),
    );
  });

  it("an extension can add translated knowledge but cannot duplicate guides", async () => {
    harness.crawl.mockResolvedValue({
      locale: "en",
      mode: "extend",
      startedAt: new Date(),
    });
    const tool = createWikiFromCrawlTool("en", "crawl-1");
    const result = await tool.execute({
      action: "create",
      pages: [page(ENGLISH, "guide")],
    });
    expect(JSON.stringify(result)).toContain("knowledge pages only");
    expect(harness.create).not.toHaveBeenCalled();
    await tool.execute({ action: "create", pages: [page(ENGLISH)] });
    expect(harness.create).toHaveBeenCalledOnce();
  });
});
