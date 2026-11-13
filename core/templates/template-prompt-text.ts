import type { AppLocale } from "@/i18n/locale-registry";

import { DEFAULT_LOCALE, isAppLocale } from "@/i18n/locale-registry";

import de from "./prompt-text/de.json";
import en from "./prompt-text/en.json";
import es from "./prompt-text/es.json";
import fr from "./prompt-text/fr.json";
import it from "./prompt-text/it.json";
import nl from "./prompt-text/nl.json";
import pl from "./prompt-text/pl.json";
import pt from "./prompt-text/pt.json";

export const PROMPT_FIELD_TYPES = [
  "address",
  "boolean",
  "channels",
  "currency",
  "date",
  "dateRange",
  "dateTime",
  "file",
  "member",
  "number",
  "richText",
  "select",
  "text",
  "url",
] as const;

export type PromptPluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

export type TemplatePromptText = {
  availability: { routine: string; rule: string; unavailable: string };
  defaultView: { marker: string; rule: string };
  due: { afterDays: PromptPluralForms; sameDay: string };
  fieldTypes: Record<(typeof PROMPT_FIELD_TYPES)[number], string>;
  groupedBy: string;
  headings: {
    beforeYouWrite: string;
    dashboardWidgets: string;
    followUpRoutines: string;
    getWorkspace: string;
    knowledgePages: string;
    listsAndFields: string;
    questions: string;
    relationships: string;
    rules: string;
    thisWorkspace: string;
    views: string;
    yourWorkspace: string;
  };
  layouts: { board: string; table: string };
  nameOnly: string;
  procedure: { askQuestions: string; describePlan: string; readContext: string; reuse: string };
  relationship: string;
  roadRules: { neverInvent: string; noSamples: string; readBack: string; sendNothing: string; sensitiveData: string };
  routinesIntro: string;
  workspace: { cloud: string; connected: string; connectedAt: string; existsAt: string; selfHosted: string };
};

const PROMPT_TEXT: Readonly<Record<AppLocale, TemplatePromptText>> = { de, en, es, fr, it, nl, pl, pt };

export function templatePromptText(locale: string): TemplatePromptText {
  return PROMPT_TEXT[isAppLocale(locale) ? locale : DEFAULT_LOCALE];
}

export function promptLocale(locale: string): AppLocale {
  return isAppLocale(locale) ? locale : DEFAULT_LOCALE;
}

export function fillPrompt(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/gu, (match, name: string) => (name in values ? String(values[name]) : match));
}

export function pluralPrompt(locale: AppLocale, forms: PromptPluralForms, count: number): string {
  return forms[new Intl.PluralRules(locale).select(count)] ?? forms.other;
}
