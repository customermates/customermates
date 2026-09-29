import type { McpToolResult } from "@/features/mcp-tools/mcp-tool";
import { executeMcpTool } from "@/features/mcp-tools/mcp-tool";
import { agentToolOutcomeStatus } from "@/ee/agent-chat/agent-durable-stream";
import { encodeToToon } from "@/features/mcp-tools/utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  create: vi.fn(),
  crawl: vi.fn(),
  sources: vi.fn(),
  count: vi.fn(),
  createdTitles: vi.fn(),
  imported: vi.fn(),
  advance: vi.fn(),
}));
vi.mock("@/core/di", () => ({
  getCreateWikiPagesInteractor: () => ({ invoke: harness.create }),
  getWikiWebsiteCrawlRepo: () => ({
    getCrawl: harness.crawl,
    listSources: harness.sources,
    countSynthesizedPages: harness.count,
    listSynthesizedPageTitles: harness.createdTitles,
    findImportedPage: harness.imported,
    advanceSourceReads: harness.advance,
  }),
}));
vi.mock("@/i18n/get-translator", () => ({
  getTranslator: () => Promise.resolve((key: string) => key),
}));

import { createWikiFromCrawlTool, readWebsiteSourceTool } from "../wiki-crawl-synthesis-tools";
import { WIKI_SOURCE_RESULT_MAX_CHARS } from "../wiki-source-coverage";

function structured(result: McpToolResult) {
  if (typeof result === "string" || !("structuredContent" in result))
    throw new Error("Expected structured tool result");
  return result.structuredContent;
}

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
  harness.createdTitles.mockResolvedValue([]);
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
      readOffset: GERMAN.length,
    },
  ]);
  harness.create.mockResolvedValue({ ok: true, data: [] });
});

describe("single language Wiki synthesis", () => {
  it("rejects serialized tool fields accidentally included in a generated title", async () => {
    const result = await createWikiFromCrawlTool("en", "crawl-1").execute({
      action: "create",
      pages: [{ ...page(ENGLISH), title: "Sales Messaging and FAQs},{gaps:[" }],
    });
    expect(result).toMatchObject({ failure: { kind: "validation" } });
    expect(harness.create).not.toHaveBeenCalled();
  });

  it("carries previously saved topics into every create result after conversation compaction", async () => {
    harness.count.mockResolvedValue(1);
    harness.createdTitles.mockResolvedValue(["Product A"]);
    harness.create.mockResolvedValue({
      ok: true,
      data: [
        {
          id: "00000000-0000-4000-8000-000000000002",
          title: "Company",
          kind: "knowledge",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });
    const result = await createWikiFromCrawlTool("en", "crawl-1").execute({ action: "create", pages: [page(ENGLISH)] });
    expect(structured(result)).toMatchObject({ createdPageTitles: ["Product A", "Company"], remainingPageSlots: 14 });
    expect(harness.createdTitles).toHaveBeenCalledWith(expect.any(Date), 16);
  });

  it("keeps the source topic inventory and actual import count available after reading completes", async () => {
    harness.sources.mockResolvedValue([
      {
        id: SOURCE_ID,
        title: "Company",
        url: "https://example.com/products",
        category: "product",
        text: "# Product A\n\n## Integrations\n\nVerified facts.\n\n# Product B",
        contentHash: "hash-1",
        readOffset: 1000,
      },
    ]);
    const result = await readWebsiteSourceTool("crawl-1").execute({ action: "list" });
    expect(structured(result)).toMatchObject({
      remainingSources: 0,
      importedSources: 0,
      items: [{ headings: ["Product A", "Integrations", "Product B"], imported: false, read: true }],
    });
  });

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
        readOffset: 0,
      },
    ]);
    for (const existing of [null, { sourceContentHash: "older-version" }]) {
      harness.imported.mockResolvedValue(existing);
      expect(await tool.execute({ action: "list" })).toMatchObject({
        structuredContent: { items: [{ imported: false }] },
      });
    }
    harness.imported.mockResolvedValue({
      sourceContentHash: "hash-1",
      updatedAt: new Date(1000),
      sourceImportedUpdatedAt: new Date(1000),
    });
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

describe("complete stored source coverage", () => {
  const source = (index: number, text: string, readOffset = 0) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    url: `https://example.com/page-${index}`,
    category: "other",
    title: `Topic ${index}`,
    text,
    contentHash: `hash-${index}`,
    fetchedAt: new Date(),
    readAt: null as Date | null,
    readOffset,
  });

  function stored(sources: ReturnType<typeof source>[]) {
    harness.sources.mockImplementation(() => Promise.resolve(sources));
    harness.advance.mockImplementation((_crawlId, chunks: Array<{ id: string; offset: number; end: number }>) => {
      for (const chunk of chunks) {
        const entry = sources.find(({ id }) => id === chunk.id);
        if (!entry) throw new Error("Missing fixture");
        expect(chunk.offset).toBeLessThanOrEqual(entry.readOffset);
        entry.readOffset = Math.max(entry.readOffset, chunk.end);
        entry.readAt = entry.readOffset === entry.text.length ? new Date() : null;
      }
      return Promise.resolve();
    });
  }

  it("reads forty rich sources completely in at most twelve bounded batches and resumes persisted cursors", async () => {
    const sources = Array.from({ length: 40 }, (_, i) => source(i + 1, ENGLISH.repeat(30)));
    stored(sources);
    let calls = 0;
    const delivered = new Map<string, string>();
    while (sources.some(({ readOffset, text }) => readOffset < text.length)) {
      const result = await readWebsiteSourceTool("crawl-1").execute({ action: "next" });
      const value = structured(result) as { items: Array<{ id: string; text: string }>; remainingSources: number };
      expect(value.items.length).toBeLessThanOrEqual(8);
      expect(value.items[0]).toMatchObject({
        title: expect.stringContaining("Topic"),
        url: expect.stringContaining("https://example.com/page-"),
        category: "other",
      });
      const encoded = encodeToToon(structured(result));
      expect(encoded.length).toBeLessThanOrEqual(WIKI_SOURCE_RESULT_MAX_CHARS);
      expect(new TextEncoder().encode(JSON.stringify(encoded)).byteLength).toBeLessThanOrEqual(
        WIKI_SOURCE_RESULT_MAX_CHARS,
      );
      expect(value.items.reduce((sum, item) => sum + item.text.length, 0)).toBeGreaterThan(6_000);
      for (const item of value.items) delivered.set(item.id, (delivered.get(item.id) ?? "") + item.text);
      calls += 1;
      expect(calls).toBeLessThanOrEqual(12);
    }
    expect(sources.every(({ readAt }) => readAt !== null)).toBe(true);
    expect(harness.advance).toHaveBeenCalledTimes(calls);
    for (const source of sources) expect(delivered.get(source.id)).toBe(source.text);
  });

  it("finishes initial coverage before allowing citation rereads and preserves completed cursors", async () => {
    const sources = [source(1, ENGLISH, ENGLISH.length), source(2, GERMAN)];
    stored(sources);
    const tool = readWebsiteSourceTool("crawl-1");
    for (const id of sources.map((item) => item.id)) {
      const denied = await executeMcpTool(tool, [{ action: "get", id, offset: 0 }]);
      expect(denied).toMatchObject({ ok: false, failure: { kind: "validation" } });
      expect(JSON.stringify(denied)).toContain("action=next");
    }
    expect(harness.advance).not.toHaveBeenCalled();
    expect(structured(await tool.execute({ action: "next" }))).toMatchObject({ remainingSources: 0 });
    const reread = await tool.execute({ action: "get", id: sources[0].id, offset: 0 });
    expect(structured(reread)).toMatchObject({ remainingSources: 0, items: [{ text: ENGLISH, offset: 0 }] });
    expect(sources.map(({ readOffset, text }) => readOffset === text.length)).toEqual([true, true]);
  });

  it("returns a forty-page topic inventory without extra pagination calls", async () => {
    stored(Array.from({ length: 40 }, (_, i) => source(i + 1, `# Topic ${i}\n\n${ENGLISH}`)));
    const result = structured(await readWebsiteSourceTool("crawl-1").execute({ action: "list" })) as {
      items: unknown[];
      nextOffset: number | null;
    };
    expect(result.items).toHaveLength(40);
    expect(result.nextOffset).toBeNull();
  });

  it("keeps multibyte evidence within the provider byte bound and advances only delivered text", async () => {
    const sources = Array.from({ length: 8 }, (_, i) => source(i + 1, "🌍知識".repeat(4000)));
    stored(sources);
    const result = structured(await readWebsiteSourceTool("crawl-1").execute({ action: "next" })) as {
      items: Array<{ id: string; offset: number; text: string }>;
    };
    expect(new TextEncoder().encode(JSON.stringify(encodeToToon(result))).byteLength).toBeLessThanOrEqual(
      WIKI_SOURCE_RESULT_MAX_CHARS,
    );
    for (const chunk of result.items)
      expect(sources.find(({ id }) => id === chunk.id)?.readOffset).toBe(chunk.offset + chunk.text.length);
  });

  it("rejects skipped text and premature creation even after the first chunk was read", async () => {
    const sources = [source(1, ENGLISH.repeat(80))];
    stored(sources);
    const tool = readWebsiteSourceTool("crawl-1");
    expect(JSON.stringify(await tool.execute({ action: "get", id: SOURCE_ID, offset: 100 }))).toContain(
      "without skipping",
    );
    expect(harness.advance).not.toHaveBeenCalled();
    await tool.execute({ action: "next" });
    expect(sources[0].readAt).toBeNull();
    const premature = await createWikiFromCrawlTool("en", "crawl-1").execute({
      action: "create",
      pages: [page(ENGLISH)],
    });
    expect(structured(premature)).toMatchObject({ remainingSources: 1 });
    const outcome = await executeMcpTool(createWikiFromCrawlTool("en", "crawl-1"), [
      { action: "create", pages: [page(ENGLISH)] },
    ]);
    expect(outcome).toMatchObject({ ok: false, failure: { kind: "validation" } });
    expect(agentToolOutcomeStatus(outcome)).toMatchObject({ failed: true, status: "error" });
    expect(harness.create).not.toHaveBeenCalled();
    await tool.execute({ action: "next" });
    await createWikiFromCrawlTool("en", "crawl-1").execute({ action: "create", pages: [page(ENGLISH)] });
    expect(harness.create).toHaveBeenCalledOnce();
  });

  it("shares complete exact-content coverage and excludes only actual imported revisions", async () => {
    const original = source(1, ENGLISH, ENGLISH.length);
    const duplicate = { ...source(2, ENGLISH), contentHash: original.contentHash };
    const imported = source(3, GERMAN);
    const stale = source(4, GERMAN);
    stored([original, duplicate, imported, stale]);
    harness.imported.mockImplementation((url) =>
      Promise.resolve(
        url === imported.url
          ? {
              sourceContentHash: imported.contentHash,
              updatedAt: new Date(1000),
              sourceImportedUpdatedAt: new Date(1000),
            }
          : { sourceContentHash: "stale" },
      ),
    );
    const result = await readWebsiteSourceTool("crawl-1").execute({ action: "list" });
    expect(structured(result)).toMatchObject({
      remainingSources: 1,
      items: [{ read: true }, { read: true }, { imported: true }, { imported: false }],
    });
  });

  it("requires reading manually edited imported pages even when their source hash still matches", async () => {
    stored([source(1, ENGLISH)]);
    for (const baseline of [null, new Date(1000)]) {
      harness.imported.mockResolvedValue({
        sourceContentHash: "hash-1",
        updatedAt: new Date(2000),
        sourceImportedUpdatedAt: baseline,
      });
      expect(structured(await readWebsiteSourceTool("crawl-1").execute({ action: "list" }))).toMatchObject({
        remainingSources: 1,
        items: [{ imported: false }],
      });
      await createWikiFromCrawlTool("en", "crawl-1").execute({ action: "create", pages: [page(ENGLISH)] });
      expect(harness.create).not.toHaveBeenCalled();
    }
  });

  it("does not treat legacy readAt as complete coverage", async () => {
    stored([{ ...source(1, ENGLISH), readAt: new Date() }]);
    expect(structured(await readWebsiteSourceTool("crawl-1").execute({ action: "list" }))).toMatchObject({
      remainingSources: 1,
      items: [{ read: false, nextOffset: 0 }],
    });
  });

  it("bounds escaped source output without advancing beyond returned text", async () => {
    const sources = Array.from({ length: 4 }, (_, i) => source(i + 1, '\n\t"'.repeat(4000)));
    stored(sources);
    const result = await readWebsiteSourceTool("crawl-1").execute({ action: "next" });
    const value = structured(result) as { items: Array<{ id: string; offset: number; text: string }> };
    const encoded = encodeToToon(structured(result));
    expect(encoded.length).toBeLessThanOrEqual(WIKI_SOURCE_RESULT_MAX_CHARS);
    expect(new TextEncoder().encode(JSON.stringify(encoded)).byteLength).toBeLessThanOrEqual(
      WIKI_SOURCE_RESULT_MAX_CHARS,
    );
    for (const chunk of value.items)
      expect(sources.find(({ id }) => id === chunk.id)?.readOffset).toBe(chunk.offset + chunk.text.length);
  });
});
