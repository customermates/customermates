import { fold } from "@/core/utils/search-text";

import { fullTextUnits, fullTextUnitTerms } from "./full-text-query";

type ContextLine = { order: number; text: string };
type ExcerptUnit = { text: string; context: ContextLine[]; table?: number; prose?: boolean };

const SENTENCES = new Intl.Segmenter("und", { granularity: "sentence" });
const TABLE_SEPARATOR = /^\|\s*:?-+/;
const LINK_LINE = /^\*\*Link:\*\*/;
const FENCE = /^ {0,3}(`{3,}|~{3,})([^\n]*)$/;
const LIST_LINE = /^\s*(?:[-*+]|\d+[.)])\s/u;

function unitsIn(markdown: string, maxUnitChars: number, preserveParagraphs: boolean): ExcerptUnit[] {
  const lines = markdown.split("\n");
  const units: ExcerptUnit[] = [];
  let heading: ContextLine[] = [];
  let table: ContextLine[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    if (LINK_LINE.test(line)) continue;
    if (/^#{1,6}\s/.test(line)) {
      heading = [{ order: index, text: line }];
      table = [];
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence) {
      const start = index;
      while (index + 1 < lines.length) {
        const closing = FENCE.exec(lines[++index]);
        if (closing && closing[1][0] === fence[1][0] && closing[1].length >= fence[1].length && !closing[2].trim())
          break;
      }
      units.push({ text: lines.slice(start, index + 1).join("\n"), context: heading });
      table = [];
      continue;
    }
    if (TABLE_SEPARATOR.test(lines[index + 1] ?? "")) {
      table = [
        { order: index, text: line },
        { order: index + 1, text: lines[++index] },
      ];
      continue;
    }
    if (line.startsWith("|")) {
      units.push({ text: line, context: [...heading, ...table], table: table[0]?.order });
      continue;
    }
    table = [];
    if (/[:：]$/u.test(line.trimEnd())) {
      let next = index + 1;
      while (next < lines.length && !lines[next].trim()) next += 1;
      if (LIST_LINE.test(lines[next] ?? "")) {
        let end = next;
        let cursor = next + 1;
        while (cursor < lines.length) {
          if (LIST_LINE.test(lines[cursor])) end = cursor;
          else if (lines[cursor].trim()) break;
          cursor += 1;
        }
        const block = lines.slice(index, end + 1).join("\n");
        const context = [...heading, { order: index, text: line }];
        if ([...heading.map(({ text }) => text), block].join("\n").length <= maxUnitChars)
          units.push({ text: block, context: heading });
        else {
          for (let item = next; item <= end; item += 1)
            if (lines[item].trim()) units.push({ text: lines[item], context });
        }
        index = end;
        continue;
      }
    }
    if (/^\s*(?:[-*+]|\d+[.)])\s|^\*\*[^*]+:\*\*/u.test(line)) {
      units.push({ text: line, context: heading });
      continue;
    }
    if (preserveParagraphs && [...heading.map(({ text }) => text), line].join("\n").length <= maxUnitChars) {
      units.push({ text: line, context: heading, prose: true });
      continue;
    }
    for (const { segment } of SENTENCES.segment(line))
      if (segment.trim()) units.push({ text: segment.trim(), context: heading });
  }
  return units;
}

function bounded(text: string, length: number): string {
  if (length < 1) return "";
  if (text.length <= length) return text;
  let prefix = "";
  for (const point of text) {
    if (prefix.length + point.length >= length) break;
    prefix += point;
  }
  const boundary = prefix.lastIndexOf(" ");
  return `${(boundary > length / 2 ? prefix.slice(0, boundary) : prefix).trimEnd().replace(/(?:\s*(?:…|\.\.\.))+$/u, "")}…`;
}

function boundedUnit(text: string, length: number): string {
  if (text.length <= length) return text;
  const opening = FENCE.exec(text.split("\n")[0]);
  if (!opening) return bounded(text, length);
  const firstLine = text.split("\n")[0];
  const suffix = `\n${opening[1]}`;
  const room = length - firstLine.length - 1 - suffix.length;
  if (room < 1) return length > 0 ? "…" : "";
  const body = text.slice(firstLine.length + 1).replace(new RegExp(`\\n${opening[1]}\\s*$`), "");
  return `${firstLine}\n${bounded(body, room)}${suffix}`;
}

function proseWindow(text: string, length: number, score: (value: string) => number): string {
  const sentences = [...SENTENCES.segment(text)].filter(({ segment }) => segment.trim());
  if (sentences.length < 2 || length < 1) return "";
  let best = 0;
  for (let index = 1; index < sentences.length; index += 1)
    if (score(sentences[index].segment) > score(sentences[best].segment)) best = index;
  if (score(sentences[best].segment) <= 0) return "";
  const span = (first: number, last: number) => {
    const start =
      sentences[first].index + sentences[first].segment.length - sentences[first].segment.trimStart().length;
    const end = sentences[last].index + sentences[last].segment.trimEnd().length;
    return `${start > 0 ? "… " : ""}${text.slice(start, end)}${end < text.trimEnd().length ? " …" : ""}`;
  };
  let first = best;
  let last = best;
  if (span(first, last).length > length) return "";
  while (true) {
    let changed = false;
    if (last + 1 < sentences.length && span(first, last + 1).length <= length) {
      last += 1;
      changed = true;
    }
    if (first > 0 && span(first - 1, last).length <= length) {
      first -= 1;
      changed = true;
    }
    if (!changed) break;
  }
  return span(first, last);
}

function linkSuffix(links: readonly string[], length: number): string {
  const first = links[0];
  if (!first || length < 1) return "";
  const routeOnly = first.split("**Mate:**")[0].trimEnd();
  const candidates = [first, routeOnly];
  const routes = routeOnly.match(/`\/[^`]+`/gu) ?? [];
  if (routes.length > 0) candidates.push(`**Link:** ${routes.join(", ")}`);
  return (
    candidates.find((line) => line.length <= length) ??
    (routes[0] && `**Link:** ${routes[0]}`.length <= length ? `**Link:** ${routes[0]}` : "")
  );
}

function render(units: readonly ExcerptUnit[], picked: ReadonlyMap<number, string>, heading: string): string {
  let text = heading;
  let previous: number | undefined;
  const contexts = new Set<number>();
  for (const [index, body] of [...picked].sort(([left], [right]) => left - right)) {
    const unit = units[index];
    const context = unit.context.filter(({ order }) => !contexts.has(order));
    const part = [...context.map(({ text }) => text), body].join("\n");
    const adjacentRows = previous !== undefined && unit.table !== undefined && unit.table === units[previous].table;
    const separator = !text ? "" : adjacentRows ? "\n" : "\n\n";
    text += `${separator}${part}`;
    context.forEach(({ order }) => contexts.add(order));
    previous = index;
  }
  return text;
}

export function retrievalExcerpt(args: {
  markdown: string;
  query: string;
  heading?: string;
  maxChars: number;
}): string {
  const maxChars = Math.max(0, Math.floor(args.maxChars));
  if (!maxChars) return "";
  const heading = args.heading ?? "";
  const whole = [heading, args.markdown].filter(Boolean).join("\n");
  if (whole.length <= maxChars) return whole;
  if (heading.length >= maxChars) return bounded(heading, maxChars);
  const links = args.markdown.split("\n").filter((line) => LINK_LINE.test(line));
  const link = linkSuffix(links, Math.max(0, Math.min(128, Math.floor(maxChars / 3), maxChars - heading.length - 43)));
  const suffix = link ? `\n\n${link}` : "";
  const units = unitsIn(args.markdown, maxChars - heading.length - (heading ? 2 : 0) - suffix.length, Boolean(heading));
  const terms = fullTextUnits(args.query)
    .filter((unit) => unit.substring || unit.text.length >= 3)
    .map((unit) => fullTextUnitTerms(unit).map((parts) => parts.map(fold)));
  const bodies = units.map((unit) => fold(unit.text));
  const matches = bodies.map((body) =>
    terms.map((alternatives) => alternatives.some((parts) => parts.every((term) => body.includes(term)))),
  );
  const weights = terms.map((_, index) =>
    Math.log(1 + units.length / (1 + matches.filter((hits) => hits[index]).length)),
  );
  const score = (index: number, seen: ReadonlySet<number>) =>
    matches[index].reduce((sum, hit, term) => sum + (hit && !seen.has(term) ? weights[term] : 0), 0);
  const relevance = (index: number) => score(index, new Set());
  const seen = new Set<number>();
  const relevant = units.map((_, index) => relevance(index));
  const remaining = new Set(units.map((_, index) => index));
  const picked = new Map<number, string>();
  if (
    heading &&
    relevant[0] > 0 &&
    (relevant[0] >= Math.max(0, ...relevant) ||
      units[0].text.length <= ((maxChars - heading.length - suffix.length - 2) * 2) / 3)
  ) {
    picked.set(0, units[0].text);
    if (render(units, picked, heading).length + suffix.length <= maxChars) {
      remaining.delete(0);
      matches[0].forEach((hit, term) => {
        if (hit) seen.add(term);
      });
    } else picked.delete(0);
  }
  const hasMatch = relevant.some((weight) => weight > 0);
  if (hasMatch) for (const index of remaining) if (relevant[index] === 0) remaining.delete(index);
  while (remaining.size > 0) {
    let index = remaining.values().next().value;
    if (index === undefined) break;
    if (hasMatch) {
      for (const candidate of remaining) {
        const difference = score(candidate, seen) - score(index, seen) || relevant[candidate] - relevant[index];
        if (difference > 0) index = candidate;
      }
    }
    remaining.delete(index);
    const unit = units[index];
    picked.set(index, unit.text);
    if (render(units, picked, heading).length + suffix.length <= maxChars) {
      matches[index].forEach((hit, term) => {
        if (hit) seen.add(term);
      });
    } else {
      picked.delete(index);
      if (unit.prose && score(index, seen) > 0) {
        picked.set(index, "");
        const room = maxChars - render(units, picked, heading).length - suffix.length;
        picked.delete(index);
        const body = proseWindow(unit.text, room, (value) => {
          const folded = fold(value);
          return terms.reduce(
            (sum, alternatives, term) =>
              sum +
              (!seen.has(term) && alternatives.some((parts) => parts.every((part) => folded.includes(part)))
                ? weights[term]
                : 0),
            0,
          );
        });
        if (body) {
          picked.set(index, body);
          terms.forEach((alternatives, term) => {
            if (alternatives.some((parts) => parts.every((part) => fold(body).includes(part)))) seen.add(term);
          });
        }
      }
      if (picked.size === 0) {
        const context = unit.context.map(({ text }) => text).join("\n");
        const prefix = [heading, context].filter(Boolean).join("\n\n");
        const room = maxChars - prefix.length - (prefix ? 2 : 0) - suffix.length;
        if (room > 0) picked.set(index, boundedUnit(unit.text, room));
      }
    }
  }
  return `${render(units, picked, heading)}${suffix}`;
}
