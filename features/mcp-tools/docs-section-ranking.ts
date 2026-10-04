import { createHash } from "node:crypto";

import type { SectionRanker, SectionRanking } from "@/core/retrieval/retrieval-context";
import type { DocsLocale, DocsSource } from "./docs-manifest";

export const DOCS_RANKING_CACHE_SIZE = 256;
const rankings = new WeakMap<SectionRanker, Map<string, SectionRanking>>();

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
