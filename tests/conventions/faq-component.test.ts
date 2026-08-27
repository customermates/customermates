import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

function contentFiles(): string[] {
  return walkFiles(join(REPO_ROOT, "content"), (path) => path.endsWith(".mdx"));
}

function landingFiles(): string[] {
  return ["feature-pages", "for-pages", "compare-pages"].flatMap((collection) =>
    walkFiles(join(REPO_ROOT, "content", collection), (path) => path.endsWith(".mdx")),
  );
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

  it("renders every answer without JavaScript, open or closed", () => {
    // Radix AccordionContent renders a closed item as <div hidden></div> with no children, so an
    // answer that is not the default-open one never reaches the server HTML. That was live before
    // this component existed: 6 of 7 answers on /en/pricing and 4 of 5 on the homepage were absent.
    // A native disclosure keeps its contents in the DOM in both states, which is the whole reason
    // this is details/summary rather than the shared Accordion.
    const component = readFileSync(join(REPO_ROOT, "components/marketing/faq.tsx"), "utf8");
    expect(component, "a closed Radix accordion item ships no answer").not.toContain("Accordion");
    expect(component, "the disclosure has to be native to render closed").toContain("<details");
    expect(component, "the trigger has to be native to render closed").toContain("<summary");

    const section = readFileSync(join(REPO_ROOT, "components/marketing/faq-section.tsx"), "utf8");
    expect(section, "the frontmatter FAQ must use the same primitive").toContain("FaqItem");
    expect(section, "it had the same defect and must not keep it").not.toContain("Accordion");
  });

  it("emits FAQPage structured data from the same items it renders", () => {
    // Deriving the schema from anything other than the rendered children is how structured data
    // drifts from the page and starts describing questions that are not there.
    const component = readFileSync(join(REPO_ROOT, "components/marketing/faq.tsx"), "utf8");
    expect(component).toContain("faqPageSchema");
    expect(component, "the schema must come from the items, not a second source").toContain("items.map(");
  });

  it("keeps landing-page FAQs in frontmatter instead of rendering a duplicate MDX block", () => {
    const duplicateAuthorities = landingFiles()
      .filter((file) => readFileSync(file, "utf8").includes("<Faq>"))
      .map((file) => file.replace(REPO_ROOT + "/", ""));

    expect(duplicateAuthorities, "a landing page would render two FAQ sections and two FAQPage schemas").toEqual([]);
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

  it("keeps markdown out of the question, since an attribute cannot render it", () => {
    // A question is a JSX attribute, so a link or emphasis written there ships as literal
    // "[CRM system](/blog/crm-system)" in the accordion trigger. Six questions carried a link
    // before conversion; each was flattened and the link moved onto the same term in the answer,
    // so nothing was lost. A link in a disclosure trigger is a competing click target anyway.
    const problems: string[] = [];

    for (const file of contentFiles()) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/<FaqItem question=(?:"([^"]*)"|\{"((?:[^"\\]|\\.)*)"\})>/gu)) {
        const question = match[1] ?? match[2] ?? "";
        if (!/\[[^\]]+\]\([^)]*\)|\*\*|`/u.test(question)) continue;

        problems.push(`${file.replace(REPO_ROOT + "/", "")}: ${question}`);
      }
    }

    expect(problems, "markdown in a question renders as literal source").toEqual([]);
  });

  it("never leaves a locale pair half converted", () => {
    // Parity here is about the transform, not the content. Some pages genuinely have an FAQ in one
    // locale and not the other, which predates this and is not something to fail on. What must
    // never happen is one locale rendering an accordion while its twin still renders raw prose.
    const state = new Map<string, Map<string, { converted: boolean; hasFaqHeading: boolean }>>();

    for (const file of contentFiles()) {
      const relative = file.replace(REPO_ROOT + "/", "");
      const match = /^content\/([^/]+)\/([^/]+)\/(.+)\.mdx$/u.exec(relative);
      if (!match) continue;

      const [, collection, locale, slug] = match;
      const source = readFileSync(file, "utf8");
      const key = `${collection}/${slug}`;
      const byLocale = state.get(key) ?? new Map();

      byLocale.set(locale, {
        converted: usesFaq(source),
        hasFaqHeading: /^## .*(?:Fragen|[Qq]uestions|FAQ)/mu.test(source),
      });
      state.set(key, byLocale);
    }

    const halfDone: string[] = [];

    for (const [key, byLocale] of state) {
      const entries = [...byLocale.entries()];
      if (!entries.some(([, value]) => value.converted)) continue;

      for (const [locale, value] of entries) {
        if (!value.converted && value.hasFaqHeading) halfDone.push(`${key} (${locale} still prose)`);
      }
    }

    expect(halfDone, "one locale renders an accordion while its twin renders prose").toEqual([]);
  });
});
