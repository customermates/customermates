import { fold } from "@/core/utils/search-text";

import { fullTextUnits } from "./full-text-query";

type ContextLine = { order: number; text: string };
type ExcerptUnit = { text: string; context: ContextLine[]; table?: number };

const SENTENCES = new Intl.Segmenter("und", { granularity: "sentence" });
const TABLE_SEPARATOR = /^\|\s*:?-+/;
const LINK_LINE = /^\*\*Link:\*\*/;
const FENCE = /^ {0,3}(`{3,}|~{3,})([^\n]*)$/;

function unitsIn(markdown: string): { units: ExcerptUnit[]; links: string[] } {
  const lines = markdown.split("\n");
  const units: ExcerptUnit[] = [];
  const links: string[] = [];
  let heading: ContextLine[] = [];
  let table: ContextLine[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    if (LINK_LINE.test(line)) {
      links.push(line);
      continue;
    }
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
    if (/^\s*(?:[-*+]|\d+[.)])\s|^\*\*[^*]+:\*\*/u.test(line)) {
      units.push({ text: line, context: heading });
      continue;
    }
    for (const { segment } of SENTENCES.segment(line))
      if (segment.trim()) units.push({ text: segment.trim(), context: heading });
  }
  return { units, links };
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
  const { units, links } = unitsIn(args.markdown);
  const link = linkSuffix(links, Math.max(0, Math.min(Math.floor(maxChars / 3), maxChars - heading.length - 43)));
  const suffix = link ? `\n\n${link}` : "";
  const terms = [
    ...new Set(
      fullTextUnits(args.query)
        .filter((unit) => unit.substring || unit.text.length >= 3)
        .map((unit) => fold(unit.text)),
    ),
  ];
  const bodies = units.map((unit) => fold(unit.text));
  const weights = terms.map((term) =>
    Math.log(1 + units.length / (1 + bodies.filter((body) => body.includes(term)).length)),
  );
  const matches = bodies.map((body) => terms.map((term) => body.includes(term)));
  const score = (index: number, seen: ReadonlySet<number>) =>
    matches[index].reduce((sum, hit, term) => sum + (hit && !seen.has(term) ? weights[term] : 0), 0);
  const relevance = (index: number) => score(index, new Set());
  const seen = new Set<number>();
  const remaining = new Set(units.map((_, index) => index));
  const picked = new Map<number, string>();
  const hasMatch = [...remaining].some((index) => relevance(index) > 0);
  while (remaining.size > 0) {
    const [index] = [...remaining].sort(
      (left, right) => score(right, seen) - score(left, seen) || relevance(right) - relevance(left) || left - right,
    );
    remaining.delete(index);
    if (hasMatch && relevance(index) === 0) continue;
    const unit = units[index];
    picked.set(index, unit.text);
    if (render(units, picked, heading).length + suffix.length <= maxChars) {
      matches[index].forEach((hit, term) => {
        if (hit) seen.add(term);
      });
    } else {
      picked.delete(index);
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
