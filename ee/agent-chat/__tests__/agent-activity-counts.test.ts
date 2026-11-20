import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import de from "@/i18n/locales/de.json";
import en from "@/i18n/locales/en.json";
import es from "@/i18n/locales/es.json";
import fr from "@/i18n/locales/fr.json";
import it_ from "@/i18n/locales/it.json";
import nl from "@/i18n/locales/nl.json";
import pl from "@/i18n/locales/pl.json";
import pt from "@/i18n/locales/pt.json";

import { AGENT_ACTIVITY_RESOURCES, agentActivityCopy, describeAgentTool } from "../agent-activity";
import { internalToolIdentity } from "../tool-identity";

const LOCALES = { en, de, fr, it: it_, es, pt, pl, nl } as const;

function translatorFor(locale: keyof typeof LOCALES) {
  const t = createTranslator({ locale, messages: LOCALES[locale] });
  return (key: string, values?: Record<string, string | number>) => t(key as never, values as never);
}

function createPages(count: number) {
  const pages = Array.from({ length: count }, (_, index) => ({ title: `Page ${index + 1}`, markdown: "Text" }));
  return describeAgentTool(internalToolIdentity("manage_wiki_pages"), { action: "create", pages });
}

describe("agent activity counts follow each language's plural rules", () => {
  it.each([
    [1, "1 rekord"],
    [2, "2 rekordy"],
    [4, "4 rekordy"],
    [5, "5 rekordów"],
    [12, "12 rekordów"],
    [22, "22 rekordy"],
    [25, "25 rekordów"],
  ])("declines the Polish count of %i records", (count, text) => {
    expect(translatorFor("pl")("AgentChat.activity.counted.records", { count })).toBe(text);
  });

  it.each([
    ["messages", 2, "2 rozmowy"],
    ["messages", 5, "5 rozmów"],
    ["widgets", 3, "3 widżety pulpitu"],
    ["widgets", 7, "7 widżetów pulpitu"],
    ["wiki", 2, "2 strony Bazy wiedzy"],
    ["wiki", 5, "5 stron Bazy wiedzy"],
  ])("declines the Polish count of %s", (resource, count, text) => {
    expect(translatorFor("pl")(`AgentChat.activity.counted.${resource}`, { count })).toBe(text);
  });

  it("names one and several of every resource in every language", () => {
    for (const locale of Object.keys(LOCALES) as Array<keyof typeof LOCALES>) {
      const t = translatorFor(locale);
      for (const resource of ["records", ...AGENT_ACTIVITY_RESOURCES]) {
        const one = t(`AgentChat.activity.counted.${resource}`, { count: 1 });
        const several = t(`AgentChat.activity.counted.${resource}`, { count: 6 });
        expect(one, `${locale} ${resource}`).toMatch(/^1 \S/);
        expect(several, `${locale} ${resource}`).toMatch(/^6 \S/);
      }
    }
  });

  it("shows the declined count in the Polish activity of a page batch", () => {
    const t = translatorFor("pl");
    expect(agentActivityCopy(createPages(2), t).done).toMatch(/^Utworzono: 2 strony Bazy wiedzy( ·|$)/);
    expect(agentActivityCopy(createPages(5), t).done).toMatch(/^Utworzono: 5 stron Bazy wiedzy( ·|$)/);
    expect(agentActivityCopy(createPages(1), t).done).toMatch(/^Utworzono: 1 strona Bazy wiedzy( ·|$)/);
  });

  it("keeps the English count of a page batch", () => {
    const t = translatorFor("en");
    expect(agentActivityCopy(createPages(1), t).done).toMatch(/^Created 1 Knowledge Base page( ·|$)/);
    expect(agentActivityCopy(createPages(3), t).done).toMatch(/^Created 3 Knowledge Base pages( ·|$)/);
  });
});
