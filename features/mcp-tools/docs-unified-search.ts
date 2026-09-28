import type { RankableSection, SectionRanker } from "@/core/retrieval/retrieval-context";
import type { QueryEmbedding } from "@/core/retrieval/retrieval-pipeline";
import type { DocsSection } from "./docs-sections";
import type { DocsChunkRepo, DocsScope, DocsSectionRow } from "./prisma-docs-chunk.repository";

import { retrievalWindows } from "@/core/retrieval/retrieval-chunks";
import { fullTextUnits } from "@/core/retrieval/full-text-query";
import { fuseFullTextAndSemantic, rerankSections, RetrievalStopwatch } from "@/core/retrieval/retrieval-pipeline";
import { slugifyHeading } from "@/core/utils/search-text";

import { docsCorpus, docsCorpusSection, docsSectionKey } from "./docs-corpus";
import { docsCorpusSections, type DocsLocale, type DocsSource } from "./docs-manifest";

const DOCS_FULL_TEXT_CANDIDATES = 40;
const DOCS_SEMANTIC_CANDIDATES = 30;
const DOCS_RERANK_LEXICAL = 20;
const DOCS_RERANK_TOP_PAGES = 5;
const DOCS_RERANK_MAX_CANDIDATES = 120;
const DOCS_RERANK_RETURNED = 3;
const DOCS_PAGE_EXCERPT_CHARS = 1_400;
const DOCS_EXCERPT_MIN_PART = 40;
const DOCS_SNIPPET_CHARS = 240;

export type UnifiedDocsDeps = {
  repo: DocsChunkRepo;
  embed: QueryEmbedding | null;
  ranker: SectionRanker | undefined;
  scheduleIndexing?: (buildHash: string) => Promise<void>;
};

export type UnifiedDocsHit = { section: DocsSection; snippet: string };

export type UnifiedDocsSearch = {
  pages: UnifiedDocsHit[];
  total: number;
  chosen: DocsSection[] | null;
};

type RankedSection = { section: DocsSection; chunkOrdinal: number };

function rowKey(row: DocsSectionRow): string {
  return docsSectionKey({ source: row.source, slug: row.slug, order: row.sectionOrder });
}

function excerptHeading(section: DocsSection): string {
  return section.headingPath.length
    ? `${"#".repeat(Math.min(3, section.headingPath.length + 1))} ${section.headingPath.at(-1)}`
    : "";
}

function bounded(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, Math.max(0, maxChars - 1));
  const boundary = Math.max(cut.lastIndexOf("\n"), cut.lastIndexOf(" "));
  return `${(boundary > maxChars / 2 ? cut.slice(0, boundary) : cut).trimEnd().replace(/(?:\s*(?:…|\.\.\.))+$/u, "")}…`;
}

function sectionWindow(section: DocsSection, chunkOrdinal: number): string {
  const windows = retrievalWindows(section.text);
  return (windows[Math.min(chunkOrdinal, windows.length - 1)] ?? windows[0]).text;
}

function sectionSnippet(ranked: RankedSection): string {
  const heading = ranked.section.headingPath.at(-1);
  const text = bounded(
    sectionWindow(ranked.section, ranked.chunkOrdinal).replace(/\s+/g, " ").trim(),
    DOCS_SNIPPET_CHARS,
  );
  return heading ? `${heading}: ${text}` : text;
}

async function fusedSections(
  query: string,
  scope: DocsScope,
  deps: UnifiedDocsDeps,
  stopwatch: RetrievalStopwatch,
  limits: { fullText: number; semantic: number },
): Promise<RankedSection[]> {
  const units = fullTextUnits(query);
  const rows = new Map<string, DocsSectionRow>();
  const remember = (found: readonly DocsSectionRow[], replace: boolean) => {
    for (const row of found) if (replace || !rows.has(rowKey(row))) rows.set(rowKey(row), row);
    return found.map(rowKey);
  };
  const fused = await fuseFullTextAndSemantic({
    query,
    stopwatch,
    fullText: async () => ({ keys: remember(await deps.repo.fullTextSections(scope, units, limits.fullText), false) }),
    embed: deps.embed,
    semantic: async ({ vector, model }) => {
      const found = await deps.repo.semanticSections(scope, vector, model, limits.semantic);
      return found ? remember(found, true) : null;
    },
  });
  return fused.ranked.flatMap((key) => {
    const row = rows.get(key);
    const section = row
      ? docsCorpusSection(scope.locale as DocsLocale, { source: row.source, slug: row.slug, order: row.sectionOrder })
      : undefined;
    return row && section ? [{ section, chunkOrdinal: row.chunkOrdinal }] : [];
  });
}

async function prepared(deps: UnifiedDocsDeps) {
  const corpus = docsCorpus();
  await deps.repo.ensureCorpus(corpus);
  if (deps.scheduleIndexing) void deps.scheduleIndexing(corpus.buildHash).catch(() => undefined);
  return corpus;
}

function rerankCandidates(ranked: readonly RankedSection[], locale: DocsLocale): RankableSection[] {
  const lexical = ranked.slice(0, DOCS_RERANK_LEXICAL).map(({ section }) => section);
  const lexicalKeys = new Set(lexical.map(docsSectionKey));
  const topPages: string[] = [];
  for (const { section } of ranked) {
    const page = `${section.source}:${section.slug}`;
    if (!topPages.includes(page)) topPages.push(page);
    if (topPages.length === DOCS_RERANK_TOP_PAGES) break;
  }
  const titles = topPages.flatMap((page) =>
    docsCorpusSections("docs", locale).filter(
      (section) => `${section.source}:${section.slug}` === page && !lexicalKeys.has(docsSectionKey(section)),
    ),
  );
  return [
    ...lexical.map((section, id) => ({ id, section, titleOnly: false })),
    ...titles.map((section, index) => ({ id: lexical.length + index, section, titleOnly: true })),
  ].slice(0, DOCS_RERANK_MAX_CANDIDATES);
}

export async function unifiedDocsSearch(
  input: { query: string; locale: DocsLocale; source: DocsSource | "all" },
  deps: UnifiedDocsDeps,
): Promise<UnifiedDocsSearch> {
  const stopwatch = new RetrievalStopwatch("docs");
  try {
    const corpus = await prepared(deps);
    const sources: DocsSource[] = input.source === "all" ? ["docs", "api"] : [input.source];
    const ranked = await fusedSections(
      input.query,
      { buildHash: corpus.buildHash, locale: input.locale, sources },
      deps,
      stopwatch,
      { fullText: DOCS_FULL_TEXT_CANDIDATES, semantic: DOCS_SEMANTIC_CANDIDATES },
    );
    const pageBest = new Map<string, RankedSection>();
    for (const entry of ranked) {
      const page = `${entry.section.source}:${entry.section.slug}`;
      if (!pageBest.has(page)) pageBest.set(page, entry);
    }

    let chosen: DocsSection[] | null = null;
    if (input.source === "docs") {
      const candidates = rerankCandidates(ranked, input.locale);
      const order = await rerankSections({ query: input.query, stopwatch, candidates, ranker: deps.ranker });
      const picked = (order ?? [])
        .flatMap((id) => candidates.find((candidate) => candidate.id === id)?.section ?? [])
        .slice(0, DOCS_RERANK_RETURNED) as DocsSection[];
      chosen = picked.length > 0 ? picked : null;
    }

    const chosenHits = (chosen ?? []).map((section) => ({
      section,
      snippet: sectionSnippet({ section, chunkOrdinal: 0 }),
    }));
    const chosenPages = new Set((chosen ?? []).map((section) => `${section.source}:${section.slug}`));
    const others = [...pageBest.entries()]
      .filter(([page]) => !chosenPages.has(page))
      .map(([, entry]) => ({ section: entry.section, snippet: sectionSnippet(entry) }));
    const pages = [...chosenHits, ...others].slice(0, DOCS_RERANK_TOP_PAGES);
    const total = Math.max(pageBest.size, new Set(pages.map(({ section }) => section.slug)).size);
    return { pages, total, chosen };
  } finally {
    stopwatch.finish();
  }
}

export async function unifiedDocsExcerpt(
  page: { source: DocsSource; locale: DocsLocale; slug: string },
  query: string,
  deps: UnifiedDocsDeps,
): Promise<string> {
  const stopwatch = new RetrievalStopwatch("docs");
  try {
    const corpus = await prepared(deps);
    const own = docsCorpusSections(page.source, page.locale).filter((section) => section.slug === page.slug);
    const ranked = await fusedSections(
      query,
      { buildHash: corpus.buildHash, locale: page.locale, sources: [page.source], slug: page.slug },
      deps,
      stopwatch,
      { fullText: own.length, semantic: own.length },
    );
    const candidates: RankableSection[] = own
      .slice(0, DOCS_RERANK_MAX_CANDIDATES)
      .map((section, id) => ({ id, section, titleOnly: false }));
    const order = await rerankSections({ query, stopwatch, candidates, ranker: deps.ranker });
    const preferred = order?.[0] === undefined ? undefined : own[order[0]];
    const target = slugifyHeading(query);
    const named = own.find(
      (section) =>
        target.length > 0 && (section.anchor === target || slugifyHeading(section.headingPath.at(-1) ?? "") === target),
    );
    const chunkOf = new Map(ranked.map((entry) => [docsSectionKey(entry.section), entry.chunkOrdinal]));
    const ordered = [
      ...(preferred ? [preferred] : []),
      ...(named ? [named] : []),
      ...ranked.map((entry) => entry.section),
    ].filter((section, index, all) => all.findIndex((other) => other.order === section.order) === index);

    if (ordered.length === 0) {
      return own
        .map((section) => section.text)
        .join("\n\n")
        .slice(0, DOCS_PAGE_EXCERPT_CHARS)
        .trim();
    }

    const [first, second] = ordered;
    const heading = excerptHeading(first);
    const whole = [heading, first.text].filter(Boolean).join("\n");
    const lead =
      whole.length <= DOCS_PAGE_EXCERPT_CHARS
        ? whole
        : bounded(
            [heading, sectionWindow(first, chunkOf.get(docsSectionKey(first)) ?? 0)].filter(Boolean).join("\n"),
            DOCS_PAGE_EXCERPT_CHARS,
          );
    const room = DOCS_PAGE_EXCERPT_CHARS - lead.length - 2;
    if (!second || room <= DOCS_EXCERPT_MIN_PART) return lead;
    const secondary = bounded([excerptHeading(second), second.text].filter(Boolean).join("\n"), room);
    return secondary.length > DOCS_EXCERPT_MIN_PART ? `${lead}\n\n${secondary}` : lead;
  } finally {
    stopwatch.finish();
  }
}
