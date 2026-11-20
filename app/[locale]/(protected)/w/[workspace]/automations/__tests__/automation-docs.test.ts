import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { APP_LOCALES } from "@/i18n/locale-registry";

type Catalog = { Automations: { builder: { runsTab: string }; rowActions: { history: string } } };

function catalog(locale: string): Catalog {
  return JSON.parse(readFileSync(join(process.cwd(), "i18n", "locales", `${locale}.json`), "utf8")) as Catalog;
}

function faqAnswers(locale: string): string[] {
  const page = readFileSync(join(process.cwd(), "content", "docs", locale, "app-automations.mdx"), "utf8");
  return [...page.matchAll(/<FaqItem question="[^"]*">\n([^\n]*)\n<\/FaqItem>/g)].map((match) => match[1] ?? "");
}

describe("the automations docs page", () => {
  it.each(APP_LOCALES)("names the controls that open the run history in the FAQ in %s", (locale) => {
    const { builder, rowActions } = catalog(locale).Automations;
    const answer = faqAnswers(locale)[1] ?? "";
    const named = [...answer.matchAll(/\*\*([^*]+)\*\*/g)].map((match) => match[1]);

    expect(named).toEqual([builder.runsTab, rowActions.history]);
  });
});
