import { createHash } from "node:crypto";

import { createRetrievalEvidenceMatcher } from "@/core/retrieval/retrieval-evidence-matcher";

import type { RankableSection, SectionRanker, SectionRanking } from "@/core/retrieval/retrieval-context";
import type { DocsLocale, DocsSource } from "./docs-manifest";

const DOCS_RANKING_CACHE_SIZE = 64;
const rankings = new WeakMap<SectionRanker, Map<string, SectionRanking>>();

export function docsDestinationFallbackOrder(query: string, candidates: readonly RankableSection[]): number[] | null {
  const matcher = createRetrievalEvidenceMatcher(query, candidates[0]?.locale);
  if (matcher.units.length === 0) return null;
  const matched = candidates.filter(({ section }) => {
    const link = section.text.match(/^\*\*Link:\*\*([^\n]*)$/mu)?.[1].split("**Mate:**")[0];
    if (!link || !/`\/[^`]+`/u.test(link)) return false;
    const destination = link
      .replace(/`[^`]*`/gu, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/gu, "$1")
      .replace(/[*_]/gu, "");
    return matcher.matches(destination).every(Boolean);
  });
  if (matched.length === 0) return null;
  const ids = new Set(matched.map(({ id }) => id));
  return [...ids, ...candidates.filter(({ id }) => !ids.has(id)).map(({ id }) => id)];
}

export function stableDocsRanker(args: {
  ranker: SectionRanker | undefined;
  buildHash: string;
  locale: DocsLocale;
  source: DocsSource | "all";
}): SectionRanker | undefined {
  const ranker = args.ranker;
  if (!ranker) return undefined;
  let cache = rankings.get(ranker);
  if (!cache) {
    cache = new Map();
    rankings.set(ranker, cache);
  }
  const entries = cache;
  return async (query, candidates) => {
    const key = createHash("sha256")
      .update(
        JSON.stringify({
          buildHash: args.buildHash,
          locale: args.locale,
          source: args.source,
          query: query.normalize("NFC").replace(/\s+/gu, " ").trim(),
          candidates,
        }),
      )
      .digest("hex");
    const known = entries.get(key);
    if (known) {
      entries.delete(key);
      entries.set(key, known);
      return { order: [...known.order], abstained: false };
    }
    const ranked = await ranker(query, candidates);
    if (
      !ranked ||
      ranked.abstained ||
      ranked.order.length === 0 ||
      new Set(ranked.order).size !== ranked.order.length ||
      ranked.order.some((id) => !candidates.some((candidate) => candidate.id === id))
    )
      return ranked;
    const first = entries.get(key);
    const stable = first ?? { order: [...ranked.order], abstained: false };
    entries.set(key, stable);
    const oldest = entries.keys().next().value;
    if (entries.size > DOCS_RANKING_CACHE_SIZE && oldest !== undefined) entries.delete(oldest);
    return { order: [...stable.order], abstained: false };
  };
}
