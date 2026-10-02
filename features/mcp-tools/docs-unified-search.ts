import type { RankableSection, SectionRanker } from "@/core/retrieval/retrieval-context";
import type { QueryEmbedding, RelevanceFloor, RelevanceVerdict } from "@/core/retrieval/retrieval-pipeline";
import type { DocsSection } from "./docs-sections";
import type { DocsChunkRepo } from "@/features/mcp-tools/docs-chunk.repo";
import type { DocsScope, DocsSectionRow, DocsStoredBuild } from "./prisma-docs-chunk.repository";

import { retrievalWindows } from "@/core/retrieval/retrieval-chunks";
import { retrievalExcerpt } from "@/core/retrieval/retrieval-excerpt";
import { fullTextUnits, fullTextUnitTerms, type FullTextUnit } from "@/core/retrieval/full-text-query";
import { fuseFullTextAndSemantic, keepsResults, rerankSections } from "@/core/retrieval/retrieval-pipeline";
import { RetrievalStopwatch } from "@/core/retrieval/retrieval-stopwatch";
import { fold, slugifyHeading } from "@/core/utils/search-text";

import { docsCorpus, docsCorpusSection, docsSectionKey, docsSectionSearchBody } from "./docs-corpus";
import { docsCorpusSections, type DocsLocale, type DocsSource } from "./docs-manifest";
import { stableDocsRanker } from "./docs-section-ranking";

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
  scheduleIndexing?: (buildHash: string, seeded: boolean) => Promise<void>;
  relevanceFloor?: RelevanceFloor | null;
};

export type UnifiedDocsHit = { section: DocsSection; snippet: string };

export type UnifiedDocsSearch = {
  pages: UnifiedDocsHit[];
  total: number;
  chosen: DocsSection[] | null;
};

type RankedSection = { section: DocsSection; chunkOrdinal: number };

function rowKey(row: DocsSectionRow): string {
  return docsSectionKey({
    source: row.source,
    slug: row.slug,
    order: row.sectionOrder,
  });
}

function rowSection(locale: DocsLocale, row: DocsSectionRow, stored: DocsStoredBuild): DocsSection | undefined {
  if (stored.current) {
    return docsCorpusSection(locale, {
      source: row.source,
      slug: row.slug,
      order: row.sectionOrder,
    });
  }
  return docsCorpusSections(row.source, locale).find(
    (section) => section.slug === row.slug && section.anchor === row.anchor,
  );
}

function inMemorySections(scope: DocsScope, units: readonly FullTextUnit[], limit: number): RankedSection[] {
  const terms = units.map((unit) => fullTextUnitTerms(unit).map((parts) => parts.map(fold)));
  if (terms.length === 0) return [];
  const matches = (value: string, alternatives: string[][]) =>
    alternatives.some((parts) => parts.every((term) => value.includes(term)));
  const documents = scope.sources
    .flatMap((source) => docsCorpusSections(source, scope.locale))
    .filter((section) => scope.slug === undefined || section.slug === scope.slug)
    .map((section) => ({
      section,
      title: fold(`${section.pageTitle} ${section.headingPath.join(" ")}`),
      body: fold(section.text),
    }));
  const frequency = terms.map(
    (term) => documents.filter((document) => matches(document.title, term) || matches(document.body, term)).length,
  );
  return documents
    .map((document, order) => ({
      document,
      order,
      score: terms.reduce((sum, term, index) => {
        if (frequency[index] === 0) return sum;
        const weight = matches(document.title, term) ? 2 : matches(document.body, term) ? 1 : 0;
        return sum + weight * Math.log(1 + documents.length / frequency[index]);
      }, 0),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.order - right.order)
    .slice(0, limit)
    .map(({ document }) => ({ section: document.section, chunkOrdinal: 0 }));
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
  const windows = retrievalWindows(docsSectionSearchBody(section));
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
  scope: Omit<DocsScope, "buildHash">,
  stored: DocsStoredBuild | null,
  deps: UnifiedDocsDeps,
  stopwatch: RetrievalStopwatch,
  limits: { fullText: number; semantic: number },
): Promise<{ sections: RankedSection[]; relevance: RelevanceVerdict }> {
  const units = fullTextUnits(query);
  if (!stored) {
    return {
      sections: inMemorySections({ ...scope, buildHash: "" }, units, limits.fullText),
      relevance: "kept",
    };
  }
  const storedScope = { ...scope, buildHash: stored.buildHash };
  const rows = new Map<string, DocsSectionRow>();
  const remember = (found: readonly DocsSectionRow[], replace: boolean) => {
    for (const row of found) if (replace || !rows.has(rowKey(row))) rows.set(rowKey(row), row);
    return found.map(rowKey);
  };
  const fused = await fuseFullTextAndSemantic({
    query,
    stopwatch,
    fullText: async () => {
      const found = await deps.repo.fullTextSections(storedScope, units, limits.fullText);
      return {
        keys: remember(found, false),
        coverage: Math.max(0, ...found.map(({ coverage }) => coverage)),
      };
    },
    embed: deps.embed,
    semantic: async ({ vector, model }) => {
      const [found, complete] = await Promise.all([
        deps.repo.semanticSections(storedScope, vector, model, limits.semantic),
        deps.repo.semanticIndexComplete(storedScope, model),
      ]);
      if (!found) return null;
      const similarity = complete ? Math.max(0, ...found.map((row) => row.similarity)) : null;
      return { keys: remember(found, true), similarity };
    },
    relevanceFloor: deps.relevanceFloor,
  });
  const sections = fused.ranked.flatMap((key) => {
    const row = rows.get(key);
    const section = row ? rowSection(scope.locale, row, stored) : undefined;
    return row && section ? [{ section, chunkOrdinal: row.chunkOrdinal }] : [];
  });
  return { sections, relevance: fused.relevance };
}

async function storedBuild(deps: UnifiedDocsDeps): Promise<DocsStoredBuild | null> {
  const corpus = docsCorpus();
  const stored = await deps.repo.storedBuild(corpus);
  if (deps.scheduleIndexing)
    void deps.scheduleIndexing(corpus.buildHash, stored?.current === true).catch(() => undefined);
  return stored;
}

function rerankCandidates(
  ranked: readonly RankedSection[],
  locale: DocsLocale,
  sources: readonly DocsSource[],
): RankableSection[] {
  const lexical = ranked.slice(0, DOCS_RERANK_LEXICAL).map(({ section }) => section);
  const lexicalKeys = new Set(lexical.map(docsSectionKey));
  const topPages: string[] = [];
  for (const { section } of ranked) {
    const page = `${section.source}:${section.slug}`;
    if (!topPages.includes(page)) topPages.push(page);
    if (topPages.length === DOCS_RERANK_TOP_PAGES) break;
  }
  for (const section of lexical) {
    const page = `${section.source}:${section.slug}`;
    if (!topPages.includes(page)) topPages.push(page);
  }
  const siblings = topPages.flatMap((page) =>
    sources
      .flatMap((source) => docsCorpusSections(source, locale))
      .filter((section) => `${section.source}:${section.slug}` === page && !lexicalKeys.has(docsSectionKey(section))),
  );
  return [
    ...lexical.map((section, id) => ({ id, section, locale })),
    ...siblings.map((section, index) => ({
      id: lexical.length + index,
      section,
      locale,
    })),
  ].slice(0, DOCS_RERANK_MAX_CANDIDATES);
}

async function selectedDocsSections(
  input: { query: string; locale: DocsLocale; source: DocsSource | "all" },
  deps: UnifiedDocsDeps,
  stored: DocsStoredBuild | null,
  stopwatch: RetrievalStopwatch,
): Promise<UnifiedDocsSearch> {
  const sources: DocsSource[] = input.source === "all" ? ["docs", "api"] : [input.source];
  const { sections: ranked, relevance } = await fusedSections(
    input.query,
    { locale: input.locale, sources },
    stored,
    deps,
    stopwatch,
    { fullText: DOCS_FULL_TEXT_CANDIDATES, semantic: DOCS_SEMANTIC_CANDIDATES },
  );
  if (relevance === "dropped") return { pages: [], total: 0, chosen: null };
  const pageBest = new Map<string, RankedSection>();
  for (const entry of ranked) {
    const page = `${entry.section.source}:${entry.section.slug}`;
    if (!pageBest.has(page)) pageBest.set(page, entry);
  }

  let chosen: DocsSection[] | null = null;
  {
    const candidates = rerankCandidates(ranked, input.locale, sources);
    const ranking = await rerankSections({
      query: input.query,
      stopwatch,
      candidates,
      ranker: stableDocsRanker({
        ranker: deps.ranker,
        buildHash: stored?.buildHash ?? docsCorpus().buildHash,
        locale: input.locale,
        source: input.source,
      }),
      relevance,
    });
    if (!keepsResults(relevance, ranking)) return { pages: [], total: 0, chosen: null };
    const picked = (ranking?.order ?? [])
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
    .map(([, entry]) => ({
      section: entry.section,
      snippet: sectionSnippet(entry),
    }));
  const pages = [...chosenHits, ...others].slice(0, DOCS_RERANK_TOP_PAGES);
  const total = Math.max(pageBest.size, new Set(pages.map(({ section }) => section.slug)).size);
  return { pages, total, chosen };
}

export async function unifiedDocsSearch(
  input: { query: string; locale: DocsLocale; source: DocsSource | "all" },
  deps: UnifiedDocsDeps,
): Promise<UnifiedDocsSearch> {
  const stopwatch = new RetrievalStopwatch("docs");
  try {
    const stored = await storedBuild(deps);
    return await selectedDocsSections(input, deps, stored, stopwatch);
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
    const stored = await storedBuild(deps);
    const own = docsCorpusSections(page.source, page.locale).filter((section) => section.slug === page.slug);
    const target = slugifyHeading(query);
    const named = own.find(
      (section) =>
        target.length > 0 && (section.anchor === target || slugifyHeading(section.headingPath.at(-1) ?? "") === target),
    );
    const search = await selectedDocsSections(
      { query, locale: page.locale, source: page.source },
      deps,
      stored,
      stopwatch,
    );
    const selected = search.pages.filter(({ section }) => section.source === page.source && section.slug === page.slug);
    let preferred =
      named ?? search.chosen?.find((section) => section.source === page.source && section.slug === page.slug);
    let ranked = selected.map(({ section }) => ({ section, chunkOrdinal: 0 }));
    if (!preferred) {
      const fallback = await fusedSections(
        query,
        { locale: page.locale, sources: [page.source], slug: page.slug },
        stored,
        deps,
        stopwatch,
        { fullText: own.length, semantic: own.length },
      );
      ranked = fallback.sections;
      const candidates: RankableSection[] = own.slice(0, DOCS_RERANK_MAX_CANDIDATES).map((section, id) => ({
        id,
        section,
        locale: page.locale,
      }));
      const ranking = await rerankSections({
        query,
        stopwatch,
        candidates,
        ranker: stableDocsRanker({
          ranker: deps.ranker,
          buildHash: stored?.buildHash ?? docsCorpus().buildHash,
          locale: page.locale,
          source: page.source,
        }),
      });
      const top = ranking?.order[0];
      preferred = top === undefined ? undefined : own[top];
    }
    const ordered = [...(preferred ? [preferred] : []), ...ranked.map((entry) => entry.section)].filter(
      (section, index, all) => all.findIndex((other) => other.order === section.order) === index,
    );

    if (ordered.length === 0) {
      return own
        .map((section) => section.text)
        .join("\n\n")
        .slice(0, DOCS_PAGE_EXCERPT_CHARS)
        .trim();
    }

    const [first, second] = ordered;
    const heading = excerptHeading(first);
    const lead = retrievalExcerpt({
      heading,
      markdown: first.text,
      query,
      maxChars: DOCS_PAGE_EXCERPT_CHARS,
    });
    const room = DOCS_PAGE_EXCERPT_CHARS - lead.length - 2;
    const secondary =
      second && room > DOCS_EXCERPT_MIN_PART
        ? retrievalExcerpt({
            heading: excerptHeading(second),
            markdown: second.text,
            query,
            maxChars: room,
          })
        : "";
    if (
      second &&
      search.chosen?.includes(second) &&
      !first.text.split("\n").some((line) => line.startsWith("**Link:**")) &&
      !(secondary.length > DOCS_EXCERPT_MIN_PART && secondary.split("\n").some((line) => line.startsWith("**Link:**")))
    ) {
      const link = second.text
        .split("\n")
        .find((line) => line.startsWith("**Link:**"))
        ?.split("**Mate:**")[0]
        .trimEnd();
      if (link) {
        const metadata = [excerptHeading(second), link].filter(Boolean).join("\n\n");
        const primaryChars = DOCS_PAGE_EXCERPT_CHARS - metadata.length - 2;
        if (
          metadata.length <= Math.floor(DOCS_PAGE_EXCERPT_CHARS / 3) &&
          primaryChars > heading.length + DOCS_EXCERPT_MIN_PART
        ) {
          const primary = retrievalExcerpt({ heading, markdown: first.text, query, maxChars: primaryChars });
          return `${primary}\n\n${metadata}`;
        }
      }
    }
    return secondary.length > DOCS_EXCERPT_MIN_PART ? `${lead}\n\n${secondary}` : lead;
  } finally {
    stopwatch.finish();
  }
}
