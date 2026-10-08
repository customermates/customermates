import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

import { CONTENT_LOCALES } from "@/i18n/locale-registry";

type Allowlist = Readonly<Record<string, string>>;
type Messages = Readonly<Record<string, string>>;

function flattenMessages(value: unknown, prefix = ""): [string, string][] {
  if (typeof value === "string") return [[prefix, value]];
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) => flattenMessages(child, prefix ? `${prefix}.${key}` : key));
}

function messagesOf(locale: string): Messages {
  const path = join(REPO_ROOT, "i18n", "locales", `${locale}.json`);
  return Object.fromEntries(flattenMessages(JSON.parse(readFileSync(path, "utf8")) as unknown));
}

const EN = messagesOf("en");
const DE = messagesOf("de");

function enforce(violations: string[], allowlist: Allowlist, exemptions: Allowlist = {}) {
  const current = violations.filter((violation) => !(violation in exemptions));
  expect(current.filter((violation) => !(violation in allowlist))).toEqual([]);
  expect(Object.keys(allowlist).filter((entry) => !current.includes(entry))).toEqual([]);
  expect(Object.keys(exemptions).filter((entry) => !violations.includes(entry))).toEqual([]);
}

const SHARED_ACTION_KEYS = [
  "Common.actions.add",
  "Common.actions.back",
  "Common.actions.cancel",
  "Common.actions.clear",
  "Common.actions.close",
  "Common.actions.delete",
  "Common.actions.discard",
  "Common.actions.loadMore",
  "Common.actions.refresh",
  "Common.actions.remove",
  "Common.actions.reset",
  "Common.actions.save",
];

function sharedActionWordViolations(messages: Messages) {
  const sharedWords = new Set(SHARED_ACTION_KEYS.map((key) => messages[key]).filter(Boolean));
  return Object.entries(messages)
    .filter(([key, value]) => !SHARED_ACTION_KEYS.includes(key) && sharedWords.has(value))
    .map(([key]) => key)
    .sort();
}

const SHARED_ACTION_WORD_EXEMPTIONS: Allowlist = {
  "AgentChat.approval.rejectAction":
    "Mate rejecting a proposed action is its own decision, not the shared footer Cancel; single consumer, so no new Common key",
  "RecordModel.operators.add": "the arithmetic operator Add in calculations, not the Add action",
  "ResetPasswordForm.resetPasswordCta": "public sign-in page call to action that sets a new password",
};

const SHARED_ACTION_WORD_ALLOWLIST: Allowlist = {};

describe("rules 30 and 58: shared action words come from one key", () => {
  it("labels the shared action words only through their Common.actions key", () => {
    enforce(sharedActionWordViolations(EN), SHARED_ACTION_WORD_ALLOWLIST, SHARED_ACTION_WORD_EXEMPTIONS);
  });

  it("recognizes a duplicated action word", () => {
    expect(
      sharedActionWordViolations({
        "Common.actions.delete": "Delete",
        "Role.delete": "Delete",
      }),
    ).toEqual(["Role.delete"]);
  });
});

const SHORT_LABEL_WORDS = 3;

function divergentGermanLabels(english: Messages, german: Messages) {
  const keysByLabel = new Map<string, string[]>();
  for (const [key, value] of Object.entries(english)) {
    if (value.split(" ").length > SHORT_LABEL_WORDS) continue;
    keysByLabel.set(value, [...(keysByLabel.get(value) ?? []), key]);
  }
  return [...keysByLabel.entries()]
    .filter(([, keys]) => new Set(keys.map((key) => german[key])).size > 1)
    .map(([label]) => label)
    .sort();
}

const GERMAN_TERM_EXEMPTIONS: Allowlist = {
  Add: "the Add action (Hinzufügen) and the arithmetic operator (Addieren)",
  Cancelled: "an aborted Mate action, a cancelled meeting and a terminated subscription",
  Contact: "the Contact list and the Contacted stage of a contact",
  Done: "the Done button (Fertig) and the done task status (Erledigt)",
  Layout: "the table layout and an email signature template",
  Link: "the link noun and the verb that links a participant to a record",
  Number: "the Number field type and the single-number widget display",
  Open: "the Open action (Öffnen) and the open status (Offen)",
  Pricing: "the pricing page and a line item's pricing mode",
  Services: "the Services starter list and the operator's service statistics",
};

const GERMAN_TERM_ALLOWLIST: Allowlist = {
  Admin: "I19: the Admin navigation entry disappears with the Settings area",
  Plan: "I19: Plan becomes Billing (rule 51), with one German term",
  Relationship: "I1r4: one German term (Beziehung or Verknüpfung)",
  Workspace: "I19: one German term (Arbeitsbereich or Workspace)",
};

describe("one German term per concept (owner 2026-10-08)", () => {
  it("translates each short English label with one German label", () => {
    enforce(divergentGermanLabels(EN, DE), GERMAN_TERM_ALLOWLIST, GERMAN_TERM_EXEMPTIONS);
  });

  it("recognizes a concept translated two ways", () => {
    expect(
      divergentGermanLabels({ a: "Owner", b: "Owner", c: "Save" }, { a: "Inhaber", b: "Besitzer", c: "Speichern" }),
    ).toEqual(["Owner"]);
  });
});

const RETIRED_TERMS: Readonly<Record<string, RegExp>> = {
  "my-profile": /\bMy Profile\b|\bMein Profil\b/i,
  "my-company": /\bMy Company\b|\bMein Unternehmen\b/i,
  "company-settings": /\bcompany settings\b|\bUnternehmenseinstellungen\b/i,
  "save-changes": /\bSave changes\b|Änderungen speichern/i,
  "activity-connection": /\bactivity connections?\b|\bAktivitätsverbindung\w*/i,
  "archive-configuration":
    /\barchiv(?:e|es|ing) (?:a |the |this )?(?:list|field|relationship)s?\b|\barchived (?:fields|relationships)\b|\b(?:Liste|Feld|Beziehung)\w* archiv\w*/i,
};

type TextUnit = { file: string; text: string };

function wordingCorpus(): TextUnit[] {
  const messages = CONTENT_LOCALES.map((locale) => ({
    file: `i18n/locales/${locale}.json`,
    text: Object.values(messagesOf(locale)).join("\n"),
  }));
  const docs = walkFiles(join(REPO_ROOT, "content", "docs"), (path) => path.endsWith(".mdx")).map((path) => ({
    file: relative(REPO_ROOT, path),
    text: readFileSync(path, "utf8"),
  }));
  return [...messages, ...docs];
}

function retiredTermViolations(units: TextUnit[]) {
  return units
    .flatMap(({ file, text }) =>
      Object.entries(RETIRED_TERMS)
        .filter(([, pattern]) => pattern.test(text))
        .map(([term]) => `${file}#${term}`),
    )
    .sort();
}

const RETIRED_TERM_ALLOWLIST: Allowlist = {
  "i18n/locales/de.json#company-settings": "I19: Settings area names (rule 43)",
  "i18n/locales/de.json#my-company": "I19: Settings area names (rule 43)",
  "i18n/locales/de.json#my-profile": "I19: Profile & preferences or Channels in Settings (rule 43)",
  "i18n/locales/en.json#company-settings": "I19: Settings area names (rule 43)",
  "i18n/locales/en.json#my-company": "I19: Settings area names (rule 43)",
  "i18n/locales/en.json#my-profile": "I19: Profile & preferences or Channels in Settings (rule 43)",
};

describe("rules 30, 33, 43, 50 and 51: retired UI names leave messages and docs", () => {
  it("names no retired UI place or action in the messages or the product docs", () => {
    enforce(retiredTermViolations(wordingCorpus()), RETIRED_TERM_ALLOWLIST);
  });

  it("recognizes each retired term in English and German", () => {
    const units = [
      { file: "a", text: "Open My Profile and archive the field." },
      {
        file: "b",
        text: "Öffne Mein Unternehmen und klicke auf Änderungen speichern.",
      },
    ];
    expect(retiredTermViolations(units)).toEqual([
      "a#archive-configuration",
      "a#my-profile",
      "b#my-company",
      "b#save-changes",
    ]);
  });
});
