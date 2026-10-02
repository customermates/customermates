import type { AppLocale } from "@/i18n/locale-registry";

import MarkdownIt from "markdown-it";

import { wikiLanguageConflicts } from "@/features/wiki/wiki-language";

const markdown = new MarkdownIt({
  html: false,
  linkify: false,
  typographer: false,
});

export function wikiSynthesisQuotedLanguageConflicts(sections: readonly string[], locale: AppLocale): boolean {
  const quotedSamples = sections.map((content) => {
    const text = markdown
      .parse(content, {})
      .filter((token) => token.type === "inline")
      .map((token) =>
        (token.children ?? [])
          .map((child) =>
            child.type === "text"
              ? child.content
              : ["softbreak", "hardbreak", "code_inline", "image"].includes(child.type)
                ? " "
                : "",
          )
          .join(""),
      )
      .join("\n");
    return [...text.matchAll(/"([^"\n]+)"|“([^“”\n]+)”|„([^„“\n]+)“/gu)]
      .map((match) => match[1] ?? match[2] ?? match[3])
      .filter((quote) => (quote.match(/(?<![\p{L}\p{M}])\p{Ll}[\p{L}\p{M}-]*/gu)?.length ?? 0) >= 2);
  });
  return [
    ...quotedSamples.flat(),
    ...quotedSamples.map((quotes) => quotes.join("\n")),
    quotedSamples.flat().join("\n"),
  ].some((sample) => wikiLanguageConflicts(sample, locale));
}
