import type { RankableSection } from "@/core/retrieval/retrieval-context";
import type { SearchWikiPagesRepo } from "../search-wiki-pages.interactor";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { collectRetrievalTimings, runWithSectionRanking } from "@/core/retrieval/retrieval-context";
import {
  createMockDiModule,
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
} from "@/tests/helpers/interactor-test-setup";
import { createMockUser } from "@/tests/helpers/mock-user";

const envState = vi.hoisted(() => ({ APP_MODE: "cloud" as "cloud" | "demo" | "self-hosted" }));
const mockUser = createMockUser();

vi.mock("@/env", () => ({
  env: new Proxy(MOCK_ENV_MODULE.env as Record<string, unknown>, {
    get: (target, key: string) => (key in envState ? envState[key as keyof typeof envState] : target[key]),
  }),
}));
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import { SearchWikiPagesInteractor, WikiSearchOrders } from "../search-wiki-pages.interactor";
import { WikiMarkdownSchema } from "../wiki.schema";

const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const created = new Date("2026-01-01T00:00:00Z");
const page = (n: number, markdown: string) => ({
  id: id(n),
  title: `Page ${n}`,
  markdown: WikiMarkdownSchema.parse(markdown),
  kind: "knowledge" as const,
  whenToUse: null,
  draft: false,
  createdAt: created,
  updatedAt: created,
});
const pages = [
  page(1, "Intro.\n\n## Refunds\n\nRefunds take five days."),
  page(2, "Intro.\n\n## Approval\n\nThe finance lead approves refunds."),
  page(3, "Intro.\n\n## Annual plans\n\nProrated within 30 days."),
];

function repo(
  fullText: string[],
  semantic: { id: string; offset: number }[] | null,
  stale: string[] = [],
  corrected?: string,
  evidence: { coverage: number; similarity: number } = { coverage: 1, similarity: 0.8 },
) {
  return {
    semanticPageCandidates: vi.fn(() =>
      Promise.resolve(
        semantic
          ? {
              candidates: semantic.map((entry) => ({ ...entry, similarity: evidence.similarity })),
              stalePageIds: new Set(stale),
            }
          : null,
      ),
    ),
    getPagesByIds: vi.fn((ids: string[]) => Promise.resolve(pages.filter((entry) => ids.includes(entry.id)))),
    fullTextPageCandidates: vi.fn(() =>
      Promise.resolve({ keys: fullText, pinned: [], coverage: evidence.coverage, ...(corrected ? { corrected } : {}) }),
    ),
    rankPageSections: vi.fn((_query: string, sections: Array<{ key: number; heading: string }>) =>
      Promise.resolve(new Map(sections.filter((section) => section.heading).map((section) => [section.key, 1]))),
    ),
    sectionHeadlines: vi.fn((_query: string, bodies: string[]) => Promise.resolve(bodies.map((body) => `**${body}**`))),
  } satisfies SearchWikiPagesRepo;
}

function semanticRetrieval(vector: number[] | null) {
  return {
    embedder: { embedQuery: vi.fn(() => Promise.resolve(vector ? { vector, model: "m" } : null)) },
    scheduler: { schedule: vi.fn(() => Promise.resolve()) },
  };
}

const search = (interactor: SearchWikiPagesInteractor, pageNumber = 1) =>
  runWithTenant(mockUser, () => interactor.invoke({ query: "refund plans", page: pageNumber, pageSize: 5 }));

beforeEach(() => {
  envState.APP_MODE = "cloud";
});

describe("unified Wiki search", () => {
  it("fuses full-text and semantic pages, opens semantic hits at their section and schedules stale pages", async () => {
    const annual = pages[2].markdown.indexOf("## Annual plans");
    const chunks = repo([id(1), id(2)], [{ id: id(3), offset: annual }], [id(2)]);
    const semantic = semanticRetrieval([0.1, 0.2]);

    const { value: result, timings } = await collectRetrievalTimings(() =>
      search(new SearchWikiPagesInteractor(chunks, "stored", semantic)),
    );
    if (!result.ok) throw new Error("expected a search result");

    expect(result.data.items.map((item) => item.id)).toEqual([id(1), id(3), id(2)]);
    expect(result.data.items[1]).toMatchObject({ offset: annual, section: "Annual plans" });
    expect(result.data.items[0]).toMatchObject({ section: "Refunds" });
    expect(result.data).toMatchObject({ total: 3, retrieval: "semantic" });
    expect(semantic.scheduler.schedule).toHaveBeenCalledTimes(1);
    expect(timings).toEqual([expect.objectContaining({ corpus: "wiki", embedding: "used" })]);
  });

  it("re-ranks results with the request's Wiki ranker and skips a page past the last result", async () => {
    const ranker = vi.fn((_query: string, candidates: readonly RankableSection[]) =>
      Promise.resolve({
        order: [candidates.findIndex((candidate) => candidate.section.pageTitle === "Page 3")],
        abstained: false,
      }),
    );
    const interactor = new SearchWikiPagesInteractor(
      repo([id(1), id(2), id(3)], null),
      "stored",
      semanticRetrieval(null),
    );

    const first = await runWithSectionRanking(
      () => ranker,
      () => search(interactor),
    );
    const later = await runWithSectionRanking(
      () => ranker,
      () => search(interactor, 2),
    );
    if (!first.ok || !later.ok) throw new Error("expected search results");

    expect(first.data.items.map((item) => item.id)).toEqual([id(3), id(1), id(2)]);
    expect(first.data.retrieval).toBe("keyword");
    expect(ranker).toHaveBeenCalledTimes(1);
    expect(later.data).toMatchObject({ items: [], total: 3, page: 2 });
  });

  it("pages through one consistent re-ranked order without overlap or gaps", async () => {
    const manyId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    const many = Array.from({ length: 13 }, (_, index) => ({
      ...page(1, `Intro.\n\n## Refunds ${index}\n\nRefund plan ${index}.`),
      id: manyId(index + 1),
      title: `Page ${index + 1}`,
    }));
    const chunks = {
      ...repo([], null),
      getPagesByIds: vi.fn((ids: string[]) => Promise.resolve(many.filter((entry) => ids.includes(entry.id)))),
      fullTextPageCandidates: vi.fn(() =>
        Promise.resolve({ keys: many.map((entry) => entry.id), pinned: [], coverage: 1 }),
      ),
    } satisfies SearchWikiPagesRepo;
    const ranker = vi.fn((_query: string, candidates: readonly RankableSection[]) =>
      Promise.resolve({ order: candidates.map((_, index) => candidates.length - 1 - index), abstained: false }),
    );
    const interactor = new SearchWikiPagesInteractor(chunks, "stored", semanticRetrieval(null));
    const pageIds = async (pageNumber: number) => {
      const result = await runWithSectionRanking(
        () => ranker,
        () => search(interactor, pageNumber),
      );
      if (!result.ok) throw new Error("expected search results");
      return result.data.items.map((item) => item.id);
    };

    const pagesSeen = [await pageIds(1), await pageIds(2), await pageIds(3), await pageIds(4)];

    const reranked = [...many.slice(0, 10).reverse(), ...many.slice(10)].map((entry) => entry.id);
    expect(pagesSeen).toEqual([reranked.slice(0, 5), reranked.slice(5, 10), reranked.slice(10, 13), []]);
    expect(new Set(pagesSeen.flat()).size).toBe(13);
    expect(ranker).toHaveBeenCalledTimes(1);
    expect(chunks.fullTextPageCandidates).toHaveBeenCalledTimes(1);
  });

  it("keeps page 1's re-ranked and semantic order on page 2 when the re-rank and the embedding change in between", async () => {
    const manyId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    const many = Array.from({ length: 12 }, (_, index) => ({
      ...page(1, `Intro.\n\n## Refunds ${index}\n\nRefund plan ${index}.`),
      id: manyId(index + 1),
      title: `Page ${index + 1}`,
    }));
    const chunks = {
      ...repo([], null),
      getPagesByIds: vi.fn((ids: string[]) => Promise.resolve(many.filter((entry) => ids.includes(entry.id)))),
      fullTextPageCandidates: vi.fn(() =>
        Promise.resolve({ keys: many.map((entry) => entry.id), pinned: [], coverage: 1 }),
      ),
    } satisfies SearchWikiPagesRepo;
    let rerankerAvailable = true;
    const ranker = vi.fn((_query: string, candidates: readonly RankableSection[]) =>
      rerankerAvailable
        ? Promise.resolve({ order: candidates.map((_, index) => candidates.length - 1 - index), abstained: false })
        : Promise.reject(new Error("classifier timed out")),
    );
    const semantic = semanticRetrieval(null);
    const orders = new WikiSearchOrders();
    const interactor = new SearchWikiPagesInteractor(chunks, "stored", semantic, orders);
    const colleague = createMockUser({ id: crypto.randomUUID(), companyId: mockUser.companyId });
    const pageIds = async (pageNumber: number, user = mockUser) => {
      const result = await runWithSectionRanking(
        () => ranker,
        () => runWithTenant(user, () => interactor.invoke({ query: "refund plans", page: pageNumber, pageSize: 5 })),
      );
      if (!result.ok) throw new Error("expected search results");
      return result.data.items.map((item) => item.id);
    };

    const first = await pageIds(1);
    rerankerAvailable = false;
    semantic.embedder.embedQuery.mockResolvedValue({ vector: [0.3], model: "m" });
    const second = await pageIds(2);
    const third = await pageIds(3);

    const reranked = [...many.slice(0, 10).reverse(), ...many.slice(10)].map((entry) => entry.id);
    expect([first, second, third]).toEqual([reranked.slice(0, 5), reranked.slice(5, 10), reranked.slice(10, 12)]);
    expect(ranker).toHaveBeenCalledTimes(1);
    expect(semantic.embedder.embedQuery).toHaveBeenCalledTimes(1);

    const colleagueSecond = await pageIds(2, colleague);
    expect(ranker).toHaveBeenCalledTimes(2);
    expect(colleagueSecond).toEqual(many.slice(5, 10).map((entry) => entry.id));

    const refreshed = await pageIds(1);
    expect(refreshed).toEqual(many.slice(0, 5).map((entry) => entry.id));
    expect(chunks.fullTextPageCandidates).toHaveBeenCalledTimes(3);
  });

  it("extends a remembered order past its full-text window without reordering what earlier pages showed", async () => {
    const manyId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    const many = Array.from({ length: 40 }, (_, index) => ({
      ...page(1, `Intro.\n\n## Refunds ${index}\n\nRefund plan ${index}.`),
      id: manyId(index + 1),
      title: `Page ${index + 1}`,
    }));
    const chunks = {
      ...repo([], null),
      getPagesByIds: vi.fn((ids: string[]) => Promise.resolve(many.filter((entry) => ids.includes(entry.id)))),
      fullTextPageCandidates: vi.fn((_query: string, limit: number) =>
        Promise.resolve({ keys: many.slice(0, limit).map((entry) => entry.id), pinned: [], coverage: 1 }),
      ),
    } satisfies SearchWikiPagesRepo;
    const ranker = vi.fn((_query: string, candidates: readonly RankableSection[]) =>
      Promise.resolve({ order: candidates.map((_, index) => candidates.length - 1 - index), abstained: false }),
    );
    const interactor = new SearchWikiPagesInteractor(chunks, "stored", semanticRetrieval(null), new WikiSearchOrders());
    const pageOf = async (pageNumber: number) => {
      const result = await runWithSectionRanking(
        () => ranker,
        () => search(interactor, pageNumber),
      );
      if (!result.ok) throw new Error("expected search results");
      return result.data;
    };

    const first = await pageOf(1);
    const sixth = await pageOf(6);
    chunks.getPagesByIds.mockClear();
    chunks.rankPageSections.mockClear();
    const seventh = await pageOf(7);

    const ids = many.map((entry) => entry.id);
    const fetched = chunks.getPagesByIds.mock.calls.flatMap(([requested]) => requested);
    expect(ids.slice(30, 35).map((pageId) => fetched.filter((entry) => entry === pageId).length)).toEqual([
      1, 1, 1, 1, 1,
    ]);
    expect(chunks.rankPageSections.mock.calls.filter(([, sections]) => sections.length > 0)).toHaveLength(1);
    expect(first.items.map((item) => item.id)).toEqual(ids.slice(0, 10).reverse().slice(0, 5));
    expect(sixth.items.map((item) => item.id)).toEqual(ids.slice(25, 30));
    expect(seventh.items.map((item) => item.id)).toEqual(ids.slice(30, 35));
    expect(chunks.fullTextPageCandidates.mock.calls.map(([, limit]) => limit)).toEqual([30, 31, 36]);
    expect(seventh.total).toBe(36);
    expect(seventh).toMatchObject({ hasMore: true, totalIsExact: false });
    expect(ranker).toHaveBeenCalledTimes(1);
  });

  it.each([5, 25] as const)(
    "traverses every hit with the consumer continuation contract at page size %i",
    async (pageSize) => {
      const many = Array.from({ length: 60 }, (_, index) => ({
        ...page(1, `## Refunds\n\nRefund policy ${index}.`),
        id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      }));
      const chunks = {
        ...repo([], null),
        getPagesByIds: vi.fn((ids: string[]) => Promise.resolve(many.filter((entry) => ids.includes(entry.id)))),
        fullTextPageCandidates: vi.fn((_query: string, limit: number) =>
          Promise.resolve({
            keys: many.slice(0, limit).map((entry) => entry.id),
            pinned: [],
            coverage: 1,
          }),
        ),
      };
      const interactor = new SearchWikiPagesInteractor(chunks, "stored", null, new WikiSearchOrders());
      const all: string[] = [];
      for (let number = 1; number <= 13; number += 1) {
        const result = await runWithTenant(mockUser, () =>
          interactor.invoke({ query: "refund", page: number, pageSize }),
        );
        if (!result.ok) throw new Error("Expected search results");
        all.push(...result.data.items.map((item) => item.id));
        if (!result.data.hasMore) {
          expect(result.data).toMatchObject({ total: 60, totalIsExact: true });
          break;
        }
        expect(result.data.total).toBeGreaterThan(number * pageSize);
      }
      expect(all).toEqual(many.map((item) => item.id));
    },
  );

  it.each([5, 25] as const)(
    "traverses all semantic-only hits at page size %i using one query embedding",
    async (pageSize) => {
      const many = Array.from({ length: 60 }, (_, index) => ({
        ...page(1, `## Policy\n\nCompany rule ${index}.`),
        id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      }));
      const chunks = {
        ...repo([], null),
        fullTextPageCandidates: vi.fn(() => Promise.resolve({ keys: [], pinned: [], coverage: 0 })),
        getPagesByIds: vi.fn((ids: string[]) => Promise.resolve(many.filter((entry) => ids.includes(entry.id)))),
        semanticPageCandidates: vi.fn((_vector: number[], _model: string, limit: number) =>
          Promise.resolve({
            candidates: many.slice(0, limit).map((entry) => ({ id: entry.id, offset: 0, similarity: 0.8 })),
            stalePageIds: new Set<string>(),
          }),
        ),
      };
      const semantic = semanticRetrieval([1]);
      const ranker = vi.fn((_query: string, candidates: readonly RankableSection[]) =>
        Promise.resolve({ order: candidates.map((_, index) => candidates.length - 1 - index), abstained: false }),
      );
      const interactor = new SearchWikiPagesInteractor(chunks, "stored", semantic, new WikiSearchOrders());
      const all: string[] = [];
      for (let number = 1; number <= 13; number += 1) {
        const result = await runWithSectionRanking(
          () => ranker,
          () => runWithTenant(mockUser, () => interactor.invoke({ query: "policy", page: number, pageSize })),
        );
        if (!result.ok) throw new Error("Expected search results");
        all.push(...result.data.items.map((item) => item.id));
        if (!result.data.hasMore) {
          expect(result.data).toMatchObject({ total: 60, totalIsExact: true, retrieval: "semantic" });
          break;
        }
        expect(result.data.total).toBeGreaterThan(number * pageSize);
        expect(result.data.totalIsExact).toBe(false);
      }
      const ids = many.map((item) => item.id);
      expect(all).toEqual([...ids.slice(0, 10).reverse(), ...ids.slice(10)]);
      expect(semantic.embedder.embedQuery).toHaveBeenCalledOnce();
      expect(ranker).toHaveBeenCalledOnce();
      expect(chunks.semanticPageCandidates.mock.calls.at(-1)?.[2]).toBeGreaterThan(60);
    },
  );

  it.each(["unavailable", "late"] as const)(
    "keeps a %s first-page embedding fallback stable and retries on a fresh search",
    async (availability) => {
      const many = Array.from({ length: 60 }, (_, index) => ({
        ...page(1, `## Refunds\n\nRefund policy ${index}.`),
        id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      }));
      const chunks = {
        ...repo([], null),
        fullTextPageCandidates: vi.fn((_query: string, limit: number) =>
          Promise.resolve({ keys: many.slice(0, limit).map((entry) => entry.id), pinned: [], coverage: 1 }),
        ),
        getPagesByIds: vi.fn((ids: string[]) => Promise.resolve(many.filter((entry) => ids.includes(entry.id)))),
      };
      const semantic = semanticRetrieval(null);
      if (availability === "late") semantic.embedder.embedQuery.mockImplementationOnce(() => new Promise(() => {}));
      const interactor = new SearchWikiPagesInteractor(chunks, "stored", semantic, new WikiSearchOrders());
      const pageOf = (number: number) =>
        runWithTenant(mockUser, () => interactor.invoke({ query: "refund", page: number, pageSize: 25 }));
      expect(await pageOf(1)).toMatchObject({ ok: true, data: { retrieval: "keyword", hasMore: true } });
      semantic.embedder.embedQuery.mockResolvedValue({ vector: [1], model: "m" });
      expect(await pageOf(2)).toMatchObject({ ok: true, data: { retrieval: "keyword", hasMore: true } });
      expect(await pageOf(3)).toMatchObject({ ok: true, data: { retrieval: "keyword", hasMore: false, total: 60 } });
      expect(semantic.embedder.embedQuery).toHaveBeenCalledOnce();
      await pageOf(1);
      expect(semantic.embedder.embedQuery).toHaveBeenCalledTimes(2);
    },
  );

  it("returns nothing below the relevance floor or when the re-rank rejects a loose match", async () => {
    const annual = pages[2].markdown.indexOf("## Annual plans");
    const loose = (similarity: number, stale: string[] = []) =>
      repo([id(1), id(2)], [{ id: id(3), offset: annual }], stale, undefined, { coverage: 0.3, similarity });
    const abstaining = vi.fn(() => Promise.resolve({ order: [0], abstained: true }));
    const run = (chunks: ReturnType<typeof repo>, vector: number[] | null) =>
      runWithSectionRanking(
        () => abstaining,
        () => search(new SearchWikiPagesInteractor(chunks, "stored", semanticRetrieval(vector))),
      );

    const unrelated = await run(loose(0.55), [0.1]);
    const rejected = await run(loose(0.7), [0.1]);
    const unjudged = await run(loose(0.55), null);
    const indexing = await run(loose(0.55, [id(2)]), [0.1]);
    if (!unrelated.ok || !rejected.ok || !unjudged.ok || !indexing.ok) throw new Error("expected search results");

    expect(unrelated.data).toMatchObject({ items: [], total: 0 });
    expect(rejected.data).toMatchObject({ items: [], total: 0 });
    expect(abstaining).toHaveBeenCalledTimes(3);
    expect(unjudged.data.items.map((item) => item.id)).toEqual([id(1), id(2)]);
    expect(indexing.data.items.length).toBeGreaterThan(0);
  });

  it("lets the re-rank reject a single loose semantic match", async () => {
    const chunks = repo([id(1)], [{ id: id(1), offset: 0 }], [], undefined, { coverage: 0.3, similarity: 0.7 });
    const abstaining = vi.fn(() => Promise.resolve({ order: [0], abstained: true }));
    const result = await runWithSectionRanking(
      () => abstaining,
      () => search(new SearchWikiPagesInteractor(chunks, "stored", semanticRetrieval([0.1]))),
    );

    expect(abstaining).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ ok: true, data: { items: [], total: 0 } });
  });

  it("stays full-text only in demo mode, without an embedding or a re-rank", async () => {
    envState.APP_MODE = "demo";
    const semantic = semanticRetrieval([0.1]);
    const ranker = vi.fn(() => Promise.resolve({ order: [1], abstained: false }));

    const result = await runWithSectionRanking(
      () => ranker,
      () => search(new SearchWikiPagesInteractor(repo([id(2), id(1)], null), "stored", semantic)),
    );
    if (!result.ok) throw new Error("expected a search result");

    expect(result.data.items.map((item) => item.id)).toEqual([id(2), id(1)]);
    expect(semantic.embedder.embedQuery).not.toHaveBeenCalled();
    expect(ranker).not.toHaveBeenCalled();
  });

  it("locates sections and snippets with the typo-corrected query and returns it as didYouMean", async () => {
    const chunks = repo([id(1)], null, [], "refund plans");

    const result = await runWithTenant(mockUser, () =>
      new SearchWikiPagesInteractor(chunks, "stored").invoke({ query: "refnud plans", page: 1, pageSize: 5 }),
    );
    if (!result.ok) throw new Error("expected a search result");

    expect(result.data).toMatchObject({ didYouMean: ["refund plans"], items: [{ id: id(1), section: "Refunds" }] });
    expect(chunks.fullTextPageCandidates).toHaveBeenCalledWith("refnud plans", expect.any(Number));
    expect(chunks.rankPageSections).toHaveBeenCalledWith("refund plans", expect.any(Array));
    expect(chunks.sectionHeadlines).toHaveBeenCalledWith("refund plans", expect.any(Array));
  });

  it("returns no didYouMean when every query word matched", async () => {
    const result = await search(new SearchWikiPagesInteractor(repo([id(1)], null), "stored"));
    if (!result.ok) throw new Error("expected a search result");

    expect(result.data).not.toHaveProperty("didYouMean");
  });
});
