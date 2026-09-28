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

import { SearchWikiPagesInteractor } from "../search-wiki-pages.interactor";
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

function repo(fullText: string[], semantic: { id: string; offset: number }[] | null, stale: string[] = []) {
  return {
    searchPages: vi.fn(),
    searchPageCandidates: vi.fn(),
    semanticPageCandidates: vi.fn(() =>
      Promise.resolve(
        semantic
          ? { candidates: semantic.map((entry) => ({ ...entry, similarity: 0.8 })), stalePageIds: new Set(stale) }
          : null,
      ),
    ),
    getPagesByIds: vi.fn((ids: string[]) => Promise.resolve(pages.filter((entry) => ids.includes(entry.id)))),
    fullTextPageCandidates: vi.fn(() => Promise.resolve({ keys: fullText, pinned: [] })),
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
    expect(timings).toEqual([expect.objectContaining({ corpus: "wiki", pipeline: "unified", embedding: "used" })]);
  });

  it("re-ranks the first page of results with the request's Wiki ranker and never a later page", async () => {
    const ranker = vi.fn((_query: string, candidates: readonly RankableSection[]) =>
      Promise.resolve([candidates.findIndex((candidate) => candidate.section.pageTitle === "Page 3")]),
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

  it("stays full-text only in demo mode, without an embedding or a re-rank", async () => {
    envState.APP_MODE = "demo";
    const semantic = semanticRetrieval([0.1]);
    const ranker = vi.fn(() => Promise.resolve([1]));

    const result = await runWithSectionRanking(
      () => ranker,
      () => search(new SearchWikiPagesInteractor(repo([id(2), id(1)], null), "stored", semantic)),
    );
    if (!result.ok) throw new Error("expected a search result");

    expect(result.data.items.map((item) => item.id)).toEqual([id(2), id(1)]);
    expect(semantic.embedder.embedQuery).not.toHaveBeenCalled();
    expect(ranker).not.toHaveBeenCalled();
  });
});
