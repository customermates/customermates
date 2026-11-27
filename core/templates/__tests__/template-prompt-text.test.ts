import { describe, expect, it } from "vitest";

import { APP_LOCALES } from "@/i18n/locale-registry";
import { renderTemplatePrompt } from "@/core/templates/template-prompt";
import {
  PROMPT_FIELD_TYPES,
  fillPrompt,
  pluralPrompt,
  promptLocale,
  templatePromptText,
} from "@/core/templates/template-prompt-text";
import { TEMPLATE_SLUGS } from "@/core/templates/template-registry";

import type { TemplatePromptText } from "@/core/templates/template-prompt-text";

import { cloneSpec, cloneText } from "./template-fixtures";

const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`, "u");
const PLACEHOLDER = /\{\w+\}/gu;
const MIN_SEGMENT = 6;

function leaves(value: unknown, path = ""): Array<[string, string]> {
  if (typeof value === "string") return [[path, value]];
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) => leaves(child, path ? `${path}.${key}` : path + key));
}

function placeholders(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].map((match) => match[0]).sort();
}

function promptFor(slug: (typeof TEMPLATE_SLUGS)[number], locale: string, options = {}) {
  return renderTemplatePrompt(cloneSpec(slug), cloneText(slug, locale), options);
}

const ENGLISH = templatePromptText("en");
const ENGLISH_LEAVES = leaves(ENGLISH);
const ENGLISH_SEGMENTS = ENGLISH_LEAVES.flatMap(([, value]) => value.split(PLACEHOLDER))
  .map((segment) => segment.trim())
  .filter((segment) => segment.length >= MIN_SEGMENT);
const NON_ENGLISH = APP_LOCALES.filter((locale) => locale !== "en");
const SCAFFOLD_CHECKED_LOCALES = NON_ENGLISH.filter((locale) => locale === "de" || locale === "pl");

describe("template prompt scaffolding", () => {
  it.each(APP_LOCALES)("keeps the keys, the placeholders and the field types of %s in step with English", (locale) => {
    const own = leaves(templatePromptText(locale));
    const required = ENGLISH_LEAVES.filter(([path]) => !path.startsWith("due.afterDays."));
    for (const [path, english] of required) {
      const translated = own.find(([candidate]) => candidate === path)?.[1];
      expect(translated, `${locale} lacks ${path}`).toBeTruthy();
      expect(placeholders(translated ?? ""), `${locale} ${path}`).toEqual(placeholders(english));
    }
    const extra = own.map(([path]) => path).filter((path) => !ENGLISH_LEAVES.some(([known]) => known === path));
    expect(extra.filter((path) => !path.startsWith("due.afterDays."))).toEqual([]);
    expect(own.some(([path]) => path === "due.afterDays.other")).toBe(true);
    expect(Object.keys(templatePromptText(locale).fieldTypes).sort()).toEqual([...PROMPT_FIELD_TYPES].sort());
    for (const [path, value] of own) {
      expect(DASHES.test(value), `${locale} ${path} holds a dash character`).toBe(false);
      if (path.startsWith("due.afterDays.")) expect(placeholders(value), `${locale} ${path}`).toEqual(["{days}"]);
    }
  });

  it.each(NON_ENGLISH)("words the headings, sentences and rules of %s differently from English", (locale) => {
    const own = templatePromptText(locale);
    const sentences = ENGLISH_LEAVES.filter(
      ([path]) =>
        path.startsWith("headings.") ||
        path.startsWith("workspace.") ||
        path.startsWith("procedure.") ||
        path.startsWith("roadRules.") ||
        path.startsWith("accounts.") ||
        path.startsWith("recordDetails.") ||
        path.startsWith("sharing.") ||
        path === "contactDetails" ||
        path === "routinesIntro",
    );
    for (const [path, english] of sentences) {
      const translated = leaves(own).find(([candidate]) => candidate === path)?.[1];
      expect(translated, `${locale} ${path}`).not.toBe(english);
    }
  });

  it("checks the English scaffolding in German and Polish among the registry locales", () => {
    expect(SCAFFOLD_CHECKED_LOCALES).toContain("de");
    expect(SCAFFOLD_CHECKED_LOCALES).toContain("pl");
    expect(SCAFFOLD_CHECKED_LOCALES).toHaveLength(2);
  });

  it.each(SCAFFOLD_CHECKED_LOCALES)("renders a %s prompt without English scaffolding", (locale) => {
    const mcpUrl = "https://app.example.test/api/v1/mcp";
    for (const options of [
      {},
      { connected: true },
      { connected: true, mcpUrl, workspace: "acme" },
      { connected: false, mcpUrl, workspace: "acme" },
    ]) {
      const prompt = promptFor("sales-pipeline", locale, options);
      for (const segment of ENGLISH_SEGMENTS) expect(prompt, `English scaffolding: ${segment}`).not.toContain(segment);
      for (const heading of ["Your workspace", "Before you write anything", "Record details", "Rules"])
        expect(prompt).not.toContain(heading);
      for (const type of ["(date", "(text", "(number", "(choice", "(yes or no"]) expect(prompt).not.toContain(type);
    }
  });

  it("names the connected workspace in the locale of the prompt and reproduces the onboarding wording in English", () => {
    const mcpUrl = "https://app.example.test/api/v1/mcp";
    const english = promptFor("sales-pipeline", "en", { connected: true, mcpUrl, workspace: "acme" });
    expect(english).toContain(
      `## 1. Your workspace\nThis workspace already exists and you are connected to it through MCP at ${mcpUrl}. Pass workspace acme on every tool call, and work in this workspace and in no other.\n\n## 2. Before you write anything`,
    );
    expect(english).not.toContain("Get a workspace");
    expect(english).not.toContain("signup");
    const german = promptFor("sales-pipeline", "de", { connected: true, mcpUrl, workspace: "acme" });
    expect(german).toContain(`## 1. ${templatePromptText("de").headings.yourWorkspace}\n`);
    expect(german).toContain(mcpUrl);
    expect(german).not.toContain(templatePromptText("de").workspace.unconnected);
  });

  it.each(APP_LOCALES)(
    "tells a %s assistant that is not connected yet to connect first, and only a connected one that it is",
    (locale) => {
      const mcpUrl = "https://app.example.test/api/v1/mcp";
      const copy = templatePromptText(locale);
      const pending = promptFor("sales-pipeline", locale, { connected: false, mcpUrl, workspace: "acme" });
      const connected = promptFor("sales-pipeline", locale, { connected: true, mcpUrl, workspace: "acme" });
      const existsAt = fillPrompt(copy.workspace.existsAt, { mcpUrl, workspace: "acme" });
      const connectedAt = fillPrompt(copy.workspace.connectedAt, { mcpUrl, workspace: "acme" });

      expect(pending).toContain(`## 1. ${copy.headings.yourWorkspace}\n${existsAt}\n\n`);
      expect(pending).not.toContain(connectedAt);
      expect(pending).not.toContain(copy.workspace.connected);
      expect(pending).not.toContain(copy.workspace.unconnected);
      expect(pending).not.toContain("template=");
      expect(connected).toContain(`## 1. ${copy.headings.yourWorkspace}\n${connectedAt}\n\n`);
      expect(connected).not.toContain(existsAt);
      expect(existsAt).not.toBe(connectedAt);
      expect(existsAt).toContain(mcpUrl);
      expect(existsAt).toContain("workspace acme");
      expect(connectedAt).toContain("workspace acme");
    },
  );

  it("says in English that the assistant still has to connect, and asks to be connected without an address", () => {
    const mcpUrl = "https://app.example.test/api/v1/mcp";
    const pending = promptFor("sales-pipeline", "en", { connected: false, mcpUrl, workspace: "acme" });
    expect(pending).toContain("your assistant is not connected to it yet");
    expect(pending).not.toContain("you are connected");
    expect(promptFor("sales-pipeline", "en", { connected: false })).toContain(
      "## 1. Your workspace\nWork in the Customermates workspace you are connected to through MCP. If you are not connected to one yet, ask me to connect you before you change anything.\n",
    );
  });

  it("writes the German prompt with German headings, field types and rules", () => {
    const prompt = promptFor("sales-pipeline", "de");
    const german = templatePromptText("de");
    expect(prompt).toContain(`## 1. ${german.headings.yourWorkspace}\n${german.workspace.unconnected}`);
    expect(prompt).toContain(`## 2. ${german.headings.beforeYouWrite}`);
    expect(prompt).toContain(`## 3. ${german.headings.listsAndFields}\n- ${german.contactDetails}`);
    expect(prompt).toContain(`## 7. ${german.headings.recordDetails}`);
    expect(prompt).toContain(`## 10. ${german.headings.connectedAccounts}`);
    expect(prompt).toContain(`## 11. ${german.headings.questions}`);
    expect(prompt).toContain(`\n## ${german.headings.rules}\n`);
    expect(prompt).toContain(`(${german.fieldTypes.date}`);
    expect(prompt).toContain(`${german.availability.rule}]`);
    expect(prompt).toContain(german.roadRules.sendNothing);
    expect(prompt).not.toContain("https://");
  });

  it("writes the Polish prompt with Polish headings, field types and rules", () => {
    const prompt = promptFor("sales-pipeline", "pl");
    const polish = templatePromptText("pl");
    expect(prompt).toContain(`## 1. ${polish.headings.yourWorkspace}`);
    expect(prompt).toContain(polish.accounts.approve);
    expect(prompt).toContain(`(${polish.fieldTypes.date}`);
    expect(prompt).toContain(`${polish.availability.rule}]`);
    expect(prompt).toContain(polish.roadRules.noSamples);
  });

  it("keeps the English prompt on the headings the onboarding step looks for", () => {
    const prompt = promptFor("client-tracker", "en");
    expect(prompt).toContain("## 1. Your workspace\n");
    expect(prompt).toContain("## 2. Before you write anything\n");
    expect(prompt).toContain("\n## Rules\n");
  });

  it("falls back to English for a locale without scaffolding text", () => {
    expect(templatePromptText("sv")).toBe(templatePromptText("en"));
    expect(promptLocale("sv")).toBe("en");
    expect(promptLocale("de")).toBe("de");
  });

  it("fills placeholders and leaves unknown ones untouched", () => {
    expect(fillPrompt("{a} and {b} and {a}", { a: "x", b: 2 })).toBe("x and 2 and x");
    expect(fillPrompt("{missing}", {})).toBe("{missing}");
  });

  it("picks the plural form of the locale for the due offset", () => {
    const due = (locale: Parameters<typeof templatePromptText>[0], days: number) => {
      const copy: TemplatePromptText = templatePromptText(locale);
      return fillPrompt(pluralPrompt(promptLocale(locale), copy.due.afterDays, days), { days });
    };
    expect(due("en", 1)).toBe("due after 1 day");
    expect(due("en", 3)).toBe("due after 3 days");
    expect(due("de", 1)).toBe("fällig nach 1 Tag");
    expect(due("de", 4)).toBe("fällig nach 4 Tagen");
    expect(due("pl", 1)).toBe("termin po 1 dniu");
    expect(due("pl", 3)).toBe("termin po 3 dniach");
    expect(due("pl", 5)).toBe("termin po 5 dniach");
    expect(due("pl", 22)).toBe("termin po 22 dniach");
  });

  it.each(TEMPLATE_SLUGS)("renders %s in every locale that has text, without raw placeholders", (slug) => {
    for (const locale of APP_LOCALES) {
      const prompt = promptFor(slug, locale);
      expect(prompt, `${slug} ${locale}`).not.toMatch(/\{(?:url|source|target|sourceLabel|targetLabel|field|days)\}/u);
      expect(DASHES.test(prompt), `${slug} ${locale}`).toBe(false);
    }
  });
});
