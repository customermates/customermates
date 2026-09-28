import type { DocsStemmer } from "@/i18n/locale-registry";

type SuffixRule = { suffix: string; minLength: number; replacement?: string; unless?: string };

const ENGLISH_PLURAL_RULES: SuffixRule[] = [
  { suffix: "ing", minLength: 6 },
  { suffix: "ies", minLength: 5, replacement: "y" },
  { suffix: "ed", minLength: 5 },
  { suffix: "es", minLength: 5, unless: "ses" },
  { suffix: "s", minLength: 4, unless: "ss" },
];

const ENGLISH_DERIVATION_RULES: SuffixRule[] = [{ suffix: "tion", minLength: 6, replacement: "t" }];

const GERMAN_INFLECTION_RULES: SuffixRule[] = [
  { suffix: "tionen", minLength: 8, replacement: "t" },
  { suffix: "ungen", minLength: 8 },
  { suffix: "ung", minLength: 7 },
  { suffix: "en", minLength: 6 },
  { suffix: "er", minLength: 6 },
  { suffix: "e", minLength: 5 },
  { suffix: "s", minLength: 5 },
];

const GERMAN_TRAILING_RULES: SuffixRule[] = [
  { suffix: "n", minLength: 5 },
  { suffix: "s", minLength: 5, unless: "ss" },
];

const GERMAN_LOANWORD_RULES: SuffixRule[] = ENGLISH_PLURAL_RULES.map((rule) =>
  rule.suffix === "ed" ? { ...rule, unless: "ied" } : rule,
);

function hasSuffix(word: string, suffix: string): boolean {
  return word.length >= suffix.length && word.slice(-suffix.length) === suffix;
}

function applyFirstRule(word: string, rules: readonly SuffixRule[]): string {
  for (const rule of rules) {
    if (word.length < rule.minLength || !hasSuffix(word, rule.suffix)) continue;
    if (rule.unless && hasSuffix(word, rule.unless)) continue;
    return `${word.slice(0, -rule.suffix.length)}${rule.replacement ?? ""}`;
  }
  return word;
}

function stemEnglish(token: string): string {
  return applyFirstRule(applyFirstRule(token, ENGLISH_PLURAL_RULES), ENGLISH_DERIVATION_RULES);
}

function stemGerman(token: string): string {
  return applyFirstRule(applyFirstRule(token, GERMAN_INFLECTION_RULES), GERMAN_TRAILING_RULES);
}

function stemGermanLoanword(token: string): string {
  return applyFirstRule(applyFirstRule(token, GERMAN_LOANWORD_RULES), ENGLISH_DERIVATION_RULES);
}

export function stem(token: string, stemmer: DocsStemmer = "english"): string {
  return stemmer === "german" ? stemGerman(stemGermanLoanword(token)) : stemEnglish(token);
}

export function fold(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("ß", "ss")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .normalize("NFC");
}

export function slugifyHeading(heading: string): string {
  return fold(heading)
    .replace(/[`*_]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
