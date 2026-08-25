import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

function contentFiles(): string[] {
  return walkFiles(join(REPO_ROOT, "content"), (path) => path.endsWith(".mdx"));
}

function usesFaq(source: string): boolean {
  return source.includes("<Faq>");
}

describe("faq component", () => {
  it("is registered so MDX can resolve it", () => {
    const registry = readFileSync(join(REPO_ROOT, "core/fumadocs/mdx-components.tsx"), "utf8");
    expect(registry, "an unregistered component renders as an unknown tag").toContain("Faq,");
    expect(registry).toContain("FaqItem,");
  });

  it("emits FAQPage structured data from the same items it renders", () => {
    // Deriving the schema from anything other than the rendered children is how structured data
    // drifts from the page and starts describing questions that are not there.
    const component = readFileSync(join(REPO_ROOT, "components/marketing/faq.tsx"), "utf8");
    expect(component).toContain("faqPageSchema");
    expect(component, "the schema must come from the items, not a second source").toContain("items.map(");
  });

  it("keeps every question inside a Faq block and every block closed", () => {
    const problems: string[] = [];

    for (const file of contentFiles()) {
      const source = readFileSync(file, "utf8");
      const opens = (source.match(/<Faq>/gu) ?? []).length;
      const closes = (source.match(/<\/Faq>/gu) ?? []).length;
      const items = (source.match(/<FaqItem\b/gu) ?? []).length;
      const itemCloses = (source.match(/<\/FaqItem>/gu) ?? []).length;
      const relative = file.replace(REPO_ROOT + "/", "");

      if (opens !== closes) problems.push(`${relative}: ${opens} <Faq> but ${closes} </Faq>`);
      if (items !== itemCloses) problems.push(`${relative}: ${items} <FaqItem> but ${itemCloses} </FaqItem>`);
      if (items > 0 && opens === 0) problems.push(`${relative}: FaqItem outside any Faq block`);
      if (!usesFaq(source)) continue;

      const block = source.slice(source.indexOf("<Faq>"), source.indexOf("</Faq>"));
      if (/^### /mu.test(block)) problems.push(`${relative}: a heading inside the Faq block would leave the accordion`);
      if (/^\*\*.+\?\*\*$/mu.test(block)) problems.push(`${relative}: a bold question was not converted to FaqItem`);
    }

    expect(problems).toEqual([]);
  });

  it("converts a locale pair together or not at all", () => {
    // i18n parity is asserted elsewhere for file existence, not for structure. A converted English
    // page beside an unconverted German one is a visible inconsistency that nothing else catches.
    const byPair = new Map<string, Set<string>>();

    for (const file of contentFiles()) {
      const relative = file.replace(REPO_ROOT + "/", "");
      const match = /^content\/([^/]+)\/([^/]+)\/(.+)\.mdx$/u.exec(relative);
      if (!match) continue;

      const [, collection, locale, slug] = match;
      if (!usesFaq(readFileSync(file, "utf8"))) continue;

      const key = `${collection}/${slug}`;
      byPair.set(key, (byPair.get(key) ?? new Set()).add(locale));
    }

    const lonely = [...byPair.entries()].filter(([, locales]) => locales.size < 2).map(([key]) => key);
    expect(lonely, "these pages use Faq in one locale only").toEqual([]);
  });
});
