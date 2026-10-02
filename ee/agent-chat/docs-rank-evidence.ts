import { fold } from "@/core/utils/search-text";
import type { LocaleCode } from "@/i18n/locale-registry";
import type { RetrievalEvidenceMatcher } from "@/core/retrieval/retrieval-evidence-matcher";

import { createRetrievalEvidenceMatcher } from "@/core/retrieval/retrieval-evidence-matcher";

const SENTENCES = new Intl.Segmenter("und", { granularity: "sentence" });
const TABLE_DIVIDER = /^\s*\|?[-:|\s]+\|\s*$/u;

type EvidenceUnit = {
  text: string;
  context?: string;
  block?: number;
  prose?: boolean;
};
export type DocsRankEvidenceContext = { label?: string; locale?: LocaleCode };

function plainInline(value: string): string {
  let rendered = "";
  let cursor = 0;
  const structural = (text: string) => text.replace(/\[([^\]]*)\]\([^)]*\)/gu, "$1").replace(/\*\*|`/gu, "");
  for (const match of value.matchAll(/(`+)([\s\S]*?)\1(?!`)/gu)) {
    rendered += structural(value.slice(cursor, match.index)) + match[2];
    cursor = match.index + match[0].length;
  }
  return rendered + structural(value.slice(cursor));
}

function plainLine(line: string): string {
  return plainInline(line.replace(/^\s{0,3}#{1,6}\s|^\s*>\s|^\s*(?:[-*+]|\d+[.)])\s/gu, ""))
    .replace(/\s+/gu, " ")
    .trim();
}

function evidenceLines(markdown: string): EvidenceUnit[] {
  return markdown.split("\n").flatMap<EvidenceUnit>((line, block) => {
    if (/^\*\*Link:\*\*|^ {0,3}(?:`{3,}|~{3,})|^\s*$/u.test(line) || TABLE_DIVIDER.test(line)) return [];
    if (line.trimStart().startsWith("|")) {
      const [context, ...cells] = line
        .trim()
        .replace(/^\||\|$/gu, "")
        .split("|")
        .map(plainLine);
      return [{ text: cells.join("; "), context }];
    }
    const text = plainLine(line);
    const prose = !/^\s*(?:#{1,6}\s|>\s|(?:[-*+]|\d+[.)])\s)/u.test(line);
    return text ? [{ text, block, prose }] : [];
  });
}

function fragment(
  text: string,
  maxChars: number,
  matcher: RetrievalEvidenceMatcher,
  active: readonly boolean[],
  weights: readonly number[],
  phrase: string,
): string {
  if (text.length <= maxChars) return text;
  if (maxChars < 2) return maxChars === 1 ? "…" : "";
  const budget = Math.max(0, maxChars - 2);
  const starts = new Set([0]);
  const boundaries = [...text.matchAll(/[,;:.!?]\s+/gu)].map((match) => match.index + match[0].length);
  for (const raw of matcher.offsets(text).flatMap((positions, index) => (active[index] ? positions : []))) {
    const clause = boundaries.findLast((boundary) => boundary <= raw) ?? 0;
    if (raw - clause < budget) starts.add(clause);
    const centered = Math.max(0, raw - Math.floor(budget / 2));
    const boundary = text.indexOf(" ", centered);
    starts.add(boundary >= 0 && boundary < raw ? boundary + 1 : raw);
  }
  let best = "";
  let bestStart = 0;
  let bestEnd = 0;
  let bestScore = -1;
  for (const start of starts) {
    let candidate = "";
    for (const point of text.slice(start)) {
      if (candidate.length + point.length > budget) break;
      candidate += point;
    }
    const boundary = candidate.lastIndexOf(" ");
    const cutsWord =
      /[\p{L}\p{M}\p{N}_]$/u.test(candidate) && /^[\p{L}\p{M}\p{N}_]/u.test(text.slice(start + candidate.length));
    if (cutsWord && boundary > budget / 2) candidate = candidate.slice(0, boundary);
    candidate = candidate.trim();
    const score =
      matcher.matches(candidate).reduce((sum, hit, index) => sum + (hit && active[index] ? weights[index] : 0), 0) +
      (phrase && active.some(Boolean) && fold(candidate).includes(phrase) ? 1 : 0);
    if (score > bestScore) {
      best = candidate;
      bestStart = start;
      bestEnd = start + candidate.length;
      bestScore = score;
    }
  }
  return `${bestStart > 0 ? "…" : ""}${best}${bestEnd < text.length ? "…" : ""}`;
}

export function docsRankEvidence(
  markdown: string,
  query: string,
  limit: number,
  context: DocsRankEvidenceContext = {},
): string {
  const maxChars = Math.max(0, Math.floor(limit));
  if (!maxChars) return "";
  const lines = evidenceLines(markdown);
  const whole = lines.map(({ text, context }) => [context, text].filter(Boolean).join(": ")).join(" ");
  if (whole.length <= maxChars) return whole;
  const units = lines.flatMap((line) =>
    line.prose && line.text.length <= maxChars
      ? [line]
      : [...SENTENCES.segment(line.text)].flatMap(({ segment }) =>
          segment.trim() ? [{ ...line, text: segment.trim() }] : [],
        ),
  );
  const matcher = createRetrievalEvidenceMatcher(query, context.locale);
  const labelMatches = matcher.matches(context.label ?? "");
  let active = matcher.units.map((_, index) => !labelMatches[index]);
  const allBodyMatches = units.map(({ text }) => matcher.matches(text));
  const hasResidualBodyMatch =
    active.some(Boolean) && allBodyMatches.some((hits) => hits.some((hit, index) => hit && active[index]));
  if (active.some(Boolean) && !hasResidualBodyMatch)
    active = active.map((hit, index) => hit || (labelMatches[index] && allBodyMatches.some((hits) => hits[index])));
  const bodies = units.map(({ text, context: unitContext }) => [unitContext, text].filter(Boolean).join(" "));
  const bodyMatches = allBodyMatches.map((hits) => hits.map((hit, index) => hit && active[index]));
  const matches = bodyMatches.map((hits, index) =>
    hits.some(Boolean) ? hits : matcher.matches(bodies[index]).map((hit, term) => hit && active[term]),
  );
  const frequencies = bodyMatches.some((hits) => hits.some(Boolean)) ? bodyMatches : matches;
  const weights = matcher.units.map((_, index) =>
    Math.log(1 + units.length / (1 + frequencies.filter((hits) => hits[index]).length)),
  );
  const phrase = fold(query).trim();
  const maximumBodyScore = bodyMatches.reduce(
    (maximum, hits, index) =>
      Math.max(
        maximum,
        hits.reduce((sum, hit, term) => sum + (hit ? weights[term] : 0), 0) +
          (phrase && active.some(Boolean) && fold(units[index].text).includes(phrase) ? 1 : 0),
      ),
    0,
  );
  const score = (index: number, seen: ReadonlySet<number>) => {
    const value =
      matches[index].reduce((sum, hit, term) => sum + (hit && !seen.has(term) ? weights[term] : 0), 0) +
      (phrase && active.some(Boolean) && fold(bodies[index]).includes(phrase) ? 1 : 0);
    return maximumBodyScore > 0 && !bodyMatches[index].some(Boolean) ? Math.min(value, maximumBodyScore) : value;
  };
  const contextScores = units.map((unit) =>
    matcher.matches(unit.context ?? "").reduce((sum, hit, term) => sum + (hit && active[term] ? weights[term] : 0), 0),
  );
  const relevant = units.map((_, index) => score(index, new Set()));
  const remaining = new Set(units.map((_, index) => index));
  const picked = new Map<number, string>();
  const seen = new Set<number>();
  const hasMatch = relevant.some((value) => value > 0);
  if (hasMatch) for (const index of remaining) if (relevant[index] === 0) remaining.delete(index);
  const firstLine =
    markdown.split("\n").find((line) => line.trim().length > 0 && !/^\s{0,3}#{1,6}\s/u.test(line)) ?? "";
  const opening = /^\s*(?:#{1,6}\s|>\s|(?:[-*+]|\d+[.)])\s|\||`{3,}|~{3,}|\*\*Link:\*\*)/u.test(firstLine)
    ? ""
    : plainLine(firstLine);
  const openingIndex = units.findIndex((unit) => unit.prose && unit.text === opening);
  const introductionBudget = Math.floor(maxChars / 3);
  if (opening && openingIndex >= 0 && opening.length <= maxChars) {
    const normalized = fold(opening);
    const openingHits = matcher.matches(opening);
    const openingMatches = openingHits.map((hit, index) => hit && active[index]);
    const openingScore =
      openingMatches.reduce((sum, hit, term) => sum + (hit ? weights[term] : 0), 0) +
      (phrase && active.some(Boolean) && normalized.includes(phrase) ? 1 : 0);
    if (!active.some(Boolean) || (openingScore > 0 && openingScore >= Math.max(0, ...relevant))) {
      const nextIndex = openingIndex + 1;
      const next = units[nextIndex];
      const nextMatches = next ? matcher.matches(next.text) : [];
      const complementary =
        active.some(Boolean) &&
        labelMatches.some(Boolean) &&
        next?.prose === true &&
        next.text === lines.find((line) => line.block === next.block)?.text &&
        next.block !== units[openingIndex].block &&
        (!hasResidualBodyMatch || labelMatches.some((hit, term) => hit && !openingHits[term] && nextMatches[term]));
      const openingBudget = complementary
        ? Math.min(opening.length, introductionBudget, maxChars - next.text.length - 1)
        : opening.length;
      const retainNext = complementary && openingBudget >= 16;
      const lead = retainNext ? fragment(opening, openingBudget, matcher, active, weights, phrase) : opening;
      picked.set(openingIndex, lead);
      remaining.delete(openingIndex);
      matcher.matches(lead).forEach((hit, term) => {
        if (hit && active[term]) seen.add(term);
      });
      if (retainNext) {
        picked.set(nextIndex, next.text);
        remaining.delete(nextIndex);
        nextMatches.forEach((hit, term) => {
          if (hit && active[term]) seen.add(term);
        });
      }
    }
  }
  const firstSentence = [...SENTENCES.segment(opening)][0]?.segment.trim() ?? "";
  const openingBlock = lines.find((line) => line.prose && line.text === opening)?.block;
  const openingUnitIndex = units.findIndex((unit) => unit.prose && unit.block === openingBlock);
  const introduction =
    picked.size === 0 &&
    hasResidualBodyMatch &&
    openingBlock !== undefined &&
    openingUnitIndex >= 0 &&
    !matches[openingUnitIndex].some(Boolean) &&
    introductionBudget >= 16 &&
    firstSentence.length > 0 &&
    firstSentence.length <= introductionBudget &&
    matcher.matches(firstSentence).some((hit, index) => hit && labelMatches[index])
      ? firstSentence
      : "";
  const render = () =>
    [introduction, ...[...picked].sort(([left], [right]) => left - right).map(([, text]) => text)]
      .filter(Boolean)
      .join(" ");
  while (remaining.size > 0) {
    let index = remaining.values().next().value;
    if (index === undefined) break;
    if (hasMatch) {
      for (const candidate of remaining) {
        const difference =
          score(candidate, seen) - score(index, seen) ||
          relevant[candidate] - relevant[index] ||
          (units[candidate].context && units[index].context ? contextScores[candidate] - contextScores[index] : 0);
        if (difference > 0) index = candidate;
      }
    }
    remaining.delete(index);
    const room = maxChars - render().length - (picked.size > 0 || introduction.length > 0 ? 1 : 0);
    if (room < 1 || (picked.size > 0 && room < 16)) break;
    const unit = units[index];
    const context = unit.context
      ? fragment(unit.context, Math.min(48, Math.floor(room / 3)), matcher, active, weights, phrase)
      : "";
    const text = fragment(unit.text, room - context.length - (context ? 2 : 0), matcher, active, weights, phrase);
    let body = [context, text].filter(Boolean).join(": ");
    if (!body) continue;
    if (text === unit.text && unit.prose) {
      for (let nextIndex = index + 1; nextIndex < units.length; nextIndex += 1) {
        const next = units[nextIndex];
        if (
          !next.prose ||
          next.block !== unit.block ||
          picked.has(nextIndex) ||
          body.length + 1 + next.text.length > room
        )
          break;
        body = `${body} ${next.text}`;
        remaining.delete(nextIndex);
      }
    }
    picked.set(index, body);
    matcher.matches(body).forEach((hit, termIndex) => {
      if (hit && active[termIndex]) seen.add(termIndex);
    });
    if (text !== unit.text) break;
  }
  return render();
}
