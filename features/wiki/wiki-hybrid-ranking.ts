export const WIKI_SEMANTIC_CANDIDATES = 30;
export const WIKI_SEMANTIC_MIN_SIMILARITY = 0.5;
const WIKI_RRF_K = 60;
const WIKI_STALE_KEYWORD_WEIGHT = 0.5;

export type WikiKeywordCandidate = { id: string; allTerms: boolean; identifier: boolean };
export type WikiSemanticCandidate = { id: string; offset: number; similarity: number };
export type WikiRankedCandidate = { id: string; offset?: number };

export function fuseWikiSearchCandidates(
  semantic: WikiSemanticCandidate[],
  keyword: WikiKeywordCandidate[],
  stalePageIds: ReadonlySet<string>,
): WikiRankedCandidate[] {
  const semanticRank = new Map(semantic.map((candidate, index) => [candidate.id, index]));
  const semanticOffset = new Map(semantic.map((candidate) => [candidate.id, candidate.offset]));

  const pinned = keyword
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => candidate.identifier)
    .sort(
      (left, right) =>
        (semanticRank.get(left.candidate.id) ?? Number.MAX_SAFE_INTEGER) -
          (semanticRank.get(right.candidate.id) ?? Number.MAX_SAFE_INTEGER) || left.index - right.index,
    )
    .map(({ candidate }) => candidate.id);
  const placed = new Set(pinned);

  const scores = new Map<string, number>();
  semantic.forEach((candidate, index) => {
    if (!placed.has(candidate.id)) scores.set(candidate.id, 1 / (WIKI_RRF_K + index + 1));
  });
  keyword
    .filter((candidate) => candidate.allTerms && !placed.has(candidate.id) && stalePageIds.has(candidate.id))
    .forEach((candidate, index) => {
      scores.set(candidate.id, (scores.get(candidate.id) ?? 0) + WIKI_STALE_KEYWORD_WEIGHT / (WIKI_RRF_K + index + 1));
    });
  const fused = [...scores.entries()].sort((left, right) => right[1] - left[1]).map(([id]) => id);
  for (const id of fused) placed.add(id);

  const tail = keyword.filter((candidate) => !placed.has(candidate.id)).map((candidate) => candidate.id);
  return [
    ...pinned.map((id) => ({ id })),
    ...fused.map((id) => {
      const offset = semanticOffset.get(id);
      return offset === undefined ? { id } : { id, offset };
    }),
    ...tail.map((id) => ({ id })),
  ];
}
