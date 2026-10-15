import { wikiCodePointBoundary } from "./wiki-page-chunk";

const WIKI_OUTLINE_MAX_ENTRIES = 30;
const WIKI_SECTION_MAX_LENGTH = 160;
const FENCE_LINE = /^[ \t]{0,3}(?:```|~~~)/u;
const LINE_TERMINATOR = /[\r\u2028\u2029]/u;

type WikiMarkdownSection = {
  level: number;
  path: string[];
  offset: number;
  end: number;
};

export type WikiOutlineEntry = { level: number; heading: string; offset: number };

function boundedText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, wikiCodePointBoundary(value, maxLength - 1)).trimEnd()}…`;
}

function isBlank(character: string | undefined): boolean {
  return character === " " || character === "\t";
}

function headingLine(line: string): { level: number; raw: string } | null {
  let level = 0;
  while (line[level] === "#") level += 1;
  if (level === 0 || level > 6) return null;
  let start = level;
  while (isBlank(line[start])) start += 1;
  if (start === level || LINE_TERMINATOR.test(line)) return null;
  if (start === line.length) return start - level > 1 ? { level, raw: line[start - 1] } : null;
  let end = line.length;
  while (isBlank(line[end - 1])) end -= 1;
  let hashes = end;
  while (hashes > start && line[hashes - 1] === "#") hashes -= 1;
  let gap = hashes;
  while (gap > start && isBlank(line[gap - 1])) gap -= 1;
  return { level, raw: line.slice(start, hashes < end && gap < hashes ? gap : end) };
}

function linkLabels(text: string): string {
  let result = "";
  let from = 0;
  let close = -1;
  let paren = -1;
  for (let index = 0; index < text.length; index += 1) {
    const open = text[index] === "[" ? index : text[index] === "!" && text[index + 1] === "[" ? index + 1 : -1;
    if (open < 0) continue;
    if (close <= open) close = text.indexOf("]", open + 1);
    if (close < 0) break;
    if (text[close + 1] !== "(") continue;
    if (paren <= close + 1) paren = text.indexOf(")", close + 2);
    if (paren < 0) break;
    result += text.slice(from, index) + text.slice(open + 1, close);
    from = paren + 1;
    index = paren;
  }
  return result + text.slice(from);
}

function headingText(raw: string): string {
  return linkLabels(raw)
    .replace(/[*_`~]/gu, "")
    .replace(/\\(.)/gu, "$1")
    .replace(/\s+/gu, " ")
    .trim();
}

export function wikiMarkdownSections(markdown: string): WikiMarkdownSection[] {
  const sections: WikiMarkdownSection[] = [];
  const stack: Array<{ level: number; heading: string }> = [];
  let current: WikiMarkdownSection = { level: 0, path: [], offset: 0, end: markdown.length };
  let offset = 0;
  let inFence = false;
  for (const line of markdown.split("\n")) {
    const heading = inFence ? null : headingLine(line);
    if (FENCE_LINE.test(line)) inFence = !inFence;
    if (heading) {
      const { level } = heading;
      const text = headingText(heading.raw);
      if (offset > current.offset || current.level > 0) sections.push({ ...current, end: offset });
      while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop();
      stack.push({ level, heading: text });
      current = { level, path: stack.map((entry) => entry.heading), offset, end: markdown.length };
    }
    offset += line.length + 1;
  }
  sections.push({ ...current, end: markdown.length });
  return sections.filter((section) => section.level > 0 || markdown.slice(section.offset, section.end).trim());
}

export function wikiOutline(markdown: string): WikiOutlineEntry[] {
  return wikiMarkdownSections(markdown)
    .filter((section) => section.level >= 1 && section.level <= 3)
    .slice(0, WIKI_OUTLINE_MAX_ENTRIES)
    .map((section) => ({
      level: section.level,
      heading: boundedText(section.path.at(-1) ?? "", WIKI_SECTION_MAX_LENGTH),
      offset: section.offset,
    }));
}

export function wikiSectionOffsetIn(sourceMarkdown: string, sourceOffset: number, targetMarkdown: string): number {
  if (sourceOffset === 0) return 0;
  const index = wikiMarkdownSections(sourceMarkdown).findIndex((section) => section.offset === sourceOffset);
  const target = index >= 0 ? wikiMarkdownSections(targetMarkdown)[index] : undefined;
  return target?.offset ?? 0;
}
