import { wikiCodePointBoundary } from "./wiki-page-chunk";

const WIKI_OUTLINE_MAX_ENTRIES = 30;
const WIKI_SECTION_MAX_LENGTH = 160;
const HEADING_LINE = /^(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/u;
const FENCE_LINE = /^[ \t]{0,3}(?:```|~~~)/u;

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

function headingText(raw: string): string {
  return raw
    .replace(/!?\[([^\]]*)\]\([^)]*\)/gu, "$1")
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
    const heading = inFence ? null : HEADING_LINE.exec(line);
    if (FENCE_LINE.test(line)) inFence = !inFence;
    if (heading) {
      const level = heading[1].length;
      const text = headingText(heading[2]);
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
