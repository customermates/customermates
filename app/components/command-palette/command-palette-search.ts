import { commandScore } from "@/components/ui/command";

export type PaletteScope = "lists" | "views" | "settings" | "docs" | "records";

export type PaletteCandidateKind = "list" | "view" | "page" | "setting" | "field" | "action";

export type PaletteCandidate = {
  key: string;
  kind: PaletteCandidateKind;
  label: string;
  keywords: readonly string[];
  listKey?: string;
  contextual?: boolean;
};

export type Ranked<T extends PaletteCandidate = PaletteCandidate> = T & { score: number };

export type ListGroup<T extends PaletteCandidate = PaletteCandidate> = { list: T; views: T[] };

export const BEST_MATCH_MIN_SCORE = 0.98;
export const BEST_MATCH_MIN_LENGTH = 2;
const MIN_SCORE = 0.1;
const CONTEXT_BOOST = 0.1;

const SCOPE_PREFIXES: Record<string, PaletteScope> = {
  l: "lists",
  v: "views",
  s: "settings",
  d: "docs",
  r: "records",
};

const KIND_PRIORITY: Record<PaletteCandidateKind, number> = {
  list: 0,
  page: 1,
  setting: 2,
  view: 3,
  field: 4,
  action: 5,
};

const SCOPE_KINDS: Record<PaletteScope, readonly PaletteCandidateKind[]> = {
  lists: ["list", "view"],
  views: ["view"],
  settings: ["page", "setting", "field"],
  docs: [],
  records: [],
};

export function foldText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{Mn}/gu, "")
    .toLocaleLowerCase("en")
    .replace(/\s+/g, " ")
    .trim();
}

export function parsePaletteQuery(raw: string): { scope: PaletteScope | null; term: string } {
  const match = /^([a-z]) (.*)$/.exec(raw.trimStart());
  const scope = match ? SCOPE_PREFIXES[match[1]] : undefined;
  if (!match || !scope) return { scope: null, term: raw.trim() };
  return { scope, term: match[2].trim() };
}

export function scopeIncludes(scope: PaletteScope | null, kind: PaletteCandidateKind): boolean {
  return scope === null || SCOPE_KINDS[scope].includes(kind);
}

const STOP_WORDS: ReadonlySet<string> = new Set([
  "a",
  "an",
  "and",
  "find",
  "for",
  "go",
  "in",
  "me",
  "my",
  "of",
  "on",
  "open",
  "please",
  "set",
  "show",
  "the",
  "to",
  "up",
  "auf",
  "bitte",
  "das",
  "der",
  "die",
  "ein",
  "eine",
  "einrichten",
  "gehe",
  "im",
  "mein",
  "meine",
  "offne",
  "offnen",
  "zeige",
  "zu",
  "zum",
  "zur",
]);
const FUZZY_MIN_LENGTH = 5;
const FUZZY_MIN_SCORE = 0.15;

function words(text: string): string[] {
  return foldText(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

export function significantWords(term: string): string[] {
  const all = words(term);
  const significant = all.filter((word) => !STOP_WORDS.has(word));
  return significant.length ? significant : all;
}

function everyWordPrefixes(query: readonly string[], candidates: readonly string[]): boolean {
  return query.every((word) => candidates.some((candidate) => candidate.startsWith(word)));
}

export function candidateScore(term: string, candidate: PaletteCandidate): number {
  const query = significantWords(term);
  if (!query.length) return 0;
  const phrase = query.join(" ");
  const label = words(candidate.label).join(" ");
  if (label === phrase) return 1;
  if (label.startsWith(phrase)) return 0.99;
  const labelWords = words(candidate.label);
  if (everyWordPrefixes(query, labelWords)) return 0.95;
  const keywords = candidate.keywords.map((keyword) => words(keyword));
  if (keywords.some((keyword) => keyword.join(" ") === phrase)) return 0.9;
  if (everyWordPrefixes(query, [...labelWords, ...keywords.flat()])) return 0.85;
  if (query.length > 1 || phrase.length < FUZZY_MIN_LENGTH) return 0;
  const fuzzy = commandScore(
    label,
    phrase,
    keywords.map((keyword) => keyword.join(" ")),
  );
  return fuzzy >= FUZZY_MIN_SCORE ? fuzzy * 0.6 : 0;
}

export function rankCandidates<T extends PaletteCandidate>(
  term: string,
  candidates: readonly T[],
  scope: PaletteScope | null,
): Ranked<T>[] {
  const scoped = candidates.filter((candidate) => scopeIncludes(scope, candidate.kind));
  if (!foldText(term)) return scope ? scoped.map((candidate) => ({ ...candidate, score: 0 })) : [];
  return scoped
    .map((candidate, index) => {
      const score = candidateScore(term, candidate);
      return {
        candidate,
        index,
        score: score > 0 && candidate.contextual ? Math.min(1, score + CONTEXT_BOOST) : score,
      };
    })
    .filter((entry) => entry.score >= MIN_SCORE)
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(Boolean(b.candidate.contextual)) - Number(Boolean(a.candidate.contextual)) ||
        KIND_PRIORITY[a.candidate.kind] - KIND_PRIORITY[b.candidate.kind] ||
        a.index - b.index,
    )
    .map((entry) => ({ ...entry.candidate, score: entry.score }));
}

export function bestCandidate<T extends PaletteCandidate>(
  term: string,
  ranked: readonly Ranked<T>[],
): Ranked<T> | null {
  const [top, runnerUp] = ranked;
  if (!top || foldText(term).length < BEST_MATCH_MIN_LENGTH || top.score < BEST_MATCH_MIN_SCORE) return null;
  const tied =
    runnerUp &&
    runnerUp.score === top.score &&
    Boolean(runnerUp.contextual) === Boolean(top.contextual) &&
    KIND_PRIORITY[runnerUp.kind] === KIND_PRIORITY[top.kind];
  return tied && foldText(top.label) !== foldText(term) ? null : top;
}

export function exactTitleMatch(term: string, title: string): boolean {
  const folded = foldText(term);
  return folded.length >= BEST_MATCH_MIN_LENGTH && foldText(title) === folded;
}

export function listGroups<T extends PaletteCandidate>(
  ranked: readonly Ranked<T>[],
  candidates: readonly T[],
  excludeKey?: string,
): ListGroup<T>[] {
  const groups = new Map<string, ListGroup<T>>();
  const listOf = (key: string) => candidates.find((candidate) => candidate.key === key);
  for (const entry of ranked) {
    if (entry.key === excludeKey) continue;
    if (entry.kind === "list" && !groups.has(entry.key))
      groups.set(entry.key, { list: entry, views: viewsOf(entry.key, candidates) });

    if (entry.kind === "view" && entry.listKey && entry.listKey !== excludeKey) {
      const list = listOf(entry.listKey);
      if (!list) continue;
      const group = groups.get(entry.listKey) ?? { list, views: [] };
      if (!group.views.some((view) => view.key === entry.key)) group.views.push(entry);
      groups.set(entry.listKey, group);
    }
  }
  return [...groups.values()];
}

export function viewsOf<T extends PaletteCandidate>(listKey: string, candidates: readonly T[]): T[] {
  return candidates.filter((candidate) => candidate.kind === "view" && candidate.listKey === listKey);
}

export function stableOrder(previous: readonly string[], next: readonly string[]): string[] {
  const present = new Set(next);
  const kept = previous.filter((key) => present.has(key));
  const keptSet = new Set(kept);
  return [...kept, ...next.filter((key) => !keptSet.has(key))];
}

export type SemanticHit = { key: string; similarity: number };

const RRF_K = 60;

export function fuseCandidates<T extends PaletteCandidate>(
  ranked: readonly Ranked<T>[],
  semantic: readonly SemanticHit[],
  candidates: readonly T[],
  scope: PaletteScope | null,
): Ranked<T>[] {
  const byKey = new Map(candidates.map((candidate) => [candidate.key, candidate]));
  const scores = new Map<string, number>();
  const add = (key: string, rank: number) => scores.set(key, (scores.get(key) ?? 0) + 1 / (RRF_K + rank + 1));
  ranked.forEach((entry, rank) => add(entry.key, rank));
  semantic
    .filter((hit) => {
      const candidate = byKey.get(hit.key);
      return candidate !== undefined && scopeIncludes(scope, candidate.kind);
    })
    .forEach((hit, rank) => add(hit.key, rank));
  return [...scores]
    .sort(([, a], [, b]) => b - a)
    .flatMap(([key, score]) => {
      const candidate = byKey.get(key);
      return candidate ? [{ ...candidate, score }] : [];
    });
}

export function semanticBestCandidate<T extends PaletteCandidate>(
  semantic: readonly SemanticHit[],
  candidates: readonly T[],
  scope: PaletteScope | null,
  threshold: { minSimilarity: number; margin: number },
): T | null {
  const byKey = new Map(candidates.map((candidate) => [candidate.key, candidate]));
  const hits = semantic.filter((hit) => {
    const candidate = byKey.get(hit.key);
    return candidate !== undefined && scopeIncludes(scope, candidate.kind);
  });
  const [top, next] = hits;
  if (!top || top.similarity < threshold.minSimilarity) return null;
  if (next && top.similarity - next.similarity < threshold.margin) return null;
  return byKey.get(top.key) ?? null;
}
