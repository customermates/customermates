import { slugifyHeading } from "@/core/utils/search-text";

import { wikiCodePointBoundary } from "./wiki-page-chunk";
import { WIKI_EXCERPT_MAX_LENGTH, wikiPlainText } from "./wiki-content";
import { wikiMarkdownSections } from "./wiki-search";

const WIKI_SECTION_LABEL_MAX_LENGTH = 160;

export type WikiSectionText = { offset: number; heading: string; body: string; markdown: string };
export type WikiSectionLocation = { offset: number; section?: string; anchor?: string };

function boundedText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, wikiCodePointBoundary(value, maxLength - 1)).trimEnd()}…`;
}

export function wikiSectionTexts(markdown: string): WikiSectionText[] {
  return wikiMarkdownSections(markdown).map((section) => {
    const body = markdown.slice(section.offset, section.end);
    const newline = body.indexOf("\n");
    const content = section.level === 0 ? body : newline < 0 ? "" : body.slice(newline + 1);
    return {
      offset: section.offset,
      heading: section.path.join(" > "),
      body: content.replace(/\]\([^)\n]*\)/gu, "]"),
      markdown: content,
    };
  });
}

export function wikiSectionLocation(markdown: string, offset: number): WikiSectionLocation {
  const section = wikiMarkdownSections(markdown).find((candidate) => candidate.offset === offset);
  if (!section || section.level === 0) return { offset: section?.offset ?? 0 };
  const anchor = slugifyHeading(section.path.at(-1) ?? "");
  return {
    offset: section.offset,
    section: boundedText(section.path.join(" > "), WIKI_SECTION_LABEL_MAX_LENGTH),
    ...(anchor ? { anchor } : {}),
  };
}

export function wikiSectionPlainText(section: WikiSectionText): string {
  return wikiPlainText(section.markdown) || section.heading.split(" > ").at(-1) || "";
}

export function wikiSnippet(headline: string): string {
  const compact = headline.normalize("NFC").replace(/\s+/gu, " ").trim();
  let snippet = compact;
  if (compact.replaceAll("**", "").length > WIKI_EXCERPT_MAX_LENGTH) {
    let visible = 0;
    let cut = 0;
    while (cut < compact.length && visible < WIKI_EXCERPT_MAX_LENGTH - 1) {
      if (compact.startsWith("**", cut)) cut += 2;
      else {
        cut += 1;
        visible += 1;
      }
    }
    const space = compact.lastIndexOf(" ", cut);
    snippet = `${compact.slice(0, space > cut / 2 ? space : wikiCodePointBoundary(compact, cut)).trimEnd()}…`;
  }
  return (snippet.match(/\*\*/g)?.length ?? 0) % 2 === 1
    ? snippet.slice(0, snippet.lastIndexOf("**")) + snippet.slice(snippet.lastIndexOf("**") + 2)
    : snippet;
}
