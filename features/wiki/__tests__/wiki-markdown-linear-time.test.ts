import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { retrievalChunkText, retrievalWindows } from "@/core/retrieval/retrieval-chunks";

import { wikiSemanticChunks } from "../wiki-chunks";
import { wikiMarkdownSections } from "../wiki-markdown-sections";

const REGEX_HEADING_LINE = /^(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/u;
const REGEX_FENCE_LINE = /^[ \t]{0,3}(?:```|~~~)/u;

function regexHeadingText(raw: string): string {
  return raw
    .replace(/!?\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/[*_`~]/gu, "")
    .replace(/\\(.)/gu, "$1")
    .replace(/\s+/gu, " ")
    .trim();
}

function regexSections(markdown: string) {
  const sections: Array<{ level: number; path: string[]; offset: number; end: number }> = [];
  const stack: Array<{ level: number; heading: string }> = [];
  let current = { level: 0, path: [] as string[], offset: 0, end: markdown.length };
  let offset = 0;
  let inFence = false;
  for (const line of markdown.split("\n")) {
    const heading = inFence ? null : REGEX_HEADING_LINE.exec(line);
    if (REGEX_FENCE_LINE.test(line)) inFence = !inFence;
    if (heading) {
      const level = heading[1].length;
      if (offset > current.offset || current.level > 0) sections.push({ ...current, end: offset });
      while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop();
      stack.push({ level, heading: regexHeadingText(heading[2]) });
      current = { level, path: stack.map((entry) => entry.heading), offset, end: markdown.length };
    }
    offset += line.length + 1;
  }
  sections.push({ ...current, end: markdown.length });
  return sections.filter((section) => section.level > 0 || markdown.slice(section.offset, section.end).trim());
}

function regexChunks(title: string, markdown: string) {
  return regexSections(markdown).flatMap((section) => {
    const body = markdown.slice(section.offset, section.end);
    const newline = body.indexOf("\n");
    const content = (section.level === 0 ? body : newline < 0 ? "" : body.slice(newline + 1))
      .replace(/\]\([^)\n]*\)/gu, "]")
      .trim();
    const heading = section.path.at(-1) ?? "";
    if (!content && !heading) return [];
    const label = heading && heading !== title ? `${title} > ${heading}` : title;
    return retrievalWindows(content).map(({ text: part }) => {
      const text = retrievalChunkText(label, part);
      return {
        offset: section.offset,
        section: section.path.join(" > ") || null,
        text,
        contentHash: createHash("sha256").update(text).digest("hex"),
      };
    });
  });
}

function randomText(seed: number, alphabet: string[], lines: number, width: number): string {
  let state = seed;
  const next = () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
  return Array.from({ length: lines }, () =>
    Array.from({ length: Math.floor(next() * width) }, () => alphabet[Math.floor(next() * alphabet.length)]).join(""),
  ).join("\n");
}

function elapsedMs(run: () => unknown): number {
  const started = performance.now();
  run();
  return performance.now() - started;
}

const HEADING_ALPHABET = ["#", "#", "#", " ", " ", "\t", "a", "b", "\r", " ", "[", "]", "(", ")", "!", "*", "\\"];
const LINK_ALPHABET = ["]", "(", ")", "[", "!", "a", " ", "#", "\n"];

describe("wiki Markdown parsing in linear time", () => {
  it("finds exactly the headings, heading texts and offsets the regular expressions found", () => {
    for (let seed = 1; seed <= 400; seed += 1) {
      const markdown = randomText(seed, HEADING_ALPHABET, 12, 14);
      expect(wikiMarkdownSections(markdown), markdown).toEqual(regexSections(markdown));
    }
    for (const line of ["#", "# ", "#  ", "#\t\t", "# #", "## ##", "# a #", "# a#", "#  a  ##  ", "####### x"])
      expect(wikiMarkdownSections(`${line}\nbody`), line).toEqual(regexSections(`${line}\nbody`));
  });

  it("strips link targets from chunks exactly like the regular expression did", () => {
    for (let seed = 1; seed <= 400; seed += 1) {
      const markdown = `## Links\n${randomText(seed, LINK_ALPHABET, 6, 40)}`;
      expect(
        wikiSemanticChunks("Page", markdown).map(({ offset, section, text, contentHash }) => ({
          offset,
          section,
          text,
          contentHash,
        })),
        markdown,
      ).toEqual(regexChunks("Page", markdown));
    }
  });

  it("parses long runs of spaces, brackets and link openers without slowing down", () => {
    const spacedHeading = `# a${" ".repeat(400_000)}b\n\nBody`;
    const openBrackets = `# ${"[".repeat(400_000)}\n\nBody`;
    const openLinks = `# ${"[a](".repeat(100_000)}\n\nBody`;
    const linkOpeners = `## Notes\n${"](".repeat(400_000)}`;
    expect(elapsedMs(() => wikiMarkdownSections(spacedHeading))).toBeLessThan(500);
    expect(elapsedMs(() => wikiMarkdownSections(openBrackets))).toBeLessThan(500);
    expect(elapsedMs(() => wikiMarkdownSections(openLinks))).toBeLessThan(500);
    expect(elapsedMs(() => wikiSemanticChunks("Notes", linkOpeners, 10_000))).toBeLessThan(500);
    expect(wikiMarkdownSections(spacedHeading)[0].path).toEqual(["a b"]);
  });
});
