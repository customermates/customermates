import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { APP_LOCALES } from "@/i18n/locale-registry";

import { SetupAnswersSchema } from "../setup-answers.schema";
import {
  SETUP_INTERVIEW_ACTIONS,
  SETUP_PARTS,
  SETUP_QUESTIONS,
  SETUP_SCREEN_DEFINITIONS,
  SETUP_SCREENS,
} from "../setup-interview";
import { mergeWebsitePrefill, touchAnswer } from "../setup-prefill";

function catalog(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(process.cwd(), "i18n", "locales", `${locale}.json`), "utf8")) as Record<
    string,
    unknown
  >;
}

function lookup(messages: Record<string, unknown>, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], messages);
}

describe("workspace setup interview", () => {
  it("asks seventeen questions on six screens in order", () => {
    expect(SETUP_QUESTIONS.map((question) => question.number)).toEqual(Array.from({ length: 17 }, (_, i) => i + 1));
    expect(SETUP_SCREEN_DEFINITIONS.map((screen) => screen.id)).toEqual([...SETUP_SCREENS]);
    expect([...new Set(SETUP_QUESTIONS.map((question) => question.screen))]).toEqual([...SETUP_SCREENS]);
    expect(new Set(SETUP_PARTS.map((part) => part.id)).size).toBe(SETUP_PARTS.length);
  });

  it("matches the formats and pre-fill levels of the design", () => {
    const byNumber = (number: number) => SETUP_QUESTIONS.find((question) => question.number === number)?.parts ?? [];
    expect(byNumber(6)).toMatchObject([{ format: "orderedList", winChance: true, prefill: "suggested" }]);
    expect(byNumber(12)).toMatchObject([{ format: "rankedPick", maxPicks: 3, prefill: "no" }]);
    expect(byNumber(7).map((part) => part.format)).toEqual(["range", "range", "singleChoice"]);
    expect(byNumber(17)[0]).toMatchObject({ format: "singleChoice", upload: true, prefill: "no" });
    expect(byNumber(14)[0]).toMatchObject({ format: "multipleChoice", prefill: "yes" });
    expect(SETUP_QUESTIONS[0].confirmationCard).toBe(true);
    for (const part of byNumber(10)) expect(part.visibleWhen?.part).toBe("afterSale");
    for (const number of [11, 12, 13, 17]) for (const part of byNumber(number)) expect(part.prefill).toBe("no");
  });

  it.each(APP_LOCALES)("has every label in %s", (locale) => {
    const messages = catalog(locale);
    const keys = [
      ...SETUP_SCREEN_DEFINITIONS.map((screen) => screen.titleKey),
      ...Object.values(SETUP_INTERVIEW_ACTIONS).map((action) => action.labelKey),
      ...SETUP_PARTS.flatMap((part) => [
        part.labelKey,
        ...("options" in part ? part.options.map((option) => option.labelKey) : []),
      ]),
    ];
    for (const key of keys) expect(typeof lookup(messages, key), key).toBe("string");
  });
});

describe("workspace setup answers", () => {
  const website = (confidence: number, value: string) => ({
    source: "website" as const,
    confidence,
    value: { format: "shortText" as const, value },
  });

  it("accepts answers in every format", () => {
    const parsed = SetupAnswersSchema.safeParse({
      companyName: website(0.9, "Northwind"),
      currency: { source: "website", confidence: 0.8, value: { format: "singleChoice", value: "EUR" } },
      customerKind: { source: "user", confidence: 1, value: { format: "singleChoice", value: "businesses" } },
      leadSources: {
        source: "user",
        confidence: 1,
        value: { format: "multipleChoice", values: ["website", "events"], custom: ["Trade press"] },
      },
      salesSteps: {
        source: "website",
        confidence: 0.75,
        value: {
          format: "orderedList",
          items: [
            { label: "Lead", winChance: 10 },
            { label: "Won", winChance: 100 },
          ],
        },
      },
      weeklyNumbers: {
        source: "user",
        confidence: 1,
        value: { format: "rankedPick", values: ["forecast", "newLeads", "overdueTasks"] },
      },
      dealSize: { source: "user", confidence: 1, value: { format: "range", min: 1000, max: 20000 } },
      salesCycle: { source: "user", confidence: 1, value: { format: "range", min: 30, max: null } },
    });
    expect(parsed.error?.issues).toBeUndefined();
  });

  it.each([
    ["a format mismatch", { teamSize: { source: "user", confidence: 1, value: { format: "shortText", value: "5" } } }],
    [
      "an unknown option",
      { teamSize: { source: "user", confidence: 1, value: { format: "singleChoice", value: "huge" } } },
    ],
    [
      "own entries where none are allowed",
      {
        afterSale: {
          source: "user",
          confidence: 1,
          value: { format: "multipleChoice", values: [], custom: ["Bills"] },
        },
      },
    ],
    [
      "more than three picks",
      {
        weeklyNumbers: {
          source: "user",
          confidence: 1,
          value: { format: "rankedPick", values: ["forecast", "newLeads", "overdueTasks", "openTickets"] },
        },
      },
    ],
    [
      "a win chance outside the sales steps",
      {
        offerings: {
          source: "user",
          confidence: 1,
          value: { format: "orderedList", items: [{ label: "Audit", winChance: 50 }] },
        },
      },
    ],
    ["a reversed range", { dealSize: { source: "user", confidence: 1, value: { format: "range", min: 10, max: 5 } } }],
    ["a second number", { salesCycle: { source: "user", confidence: 1, value: { format: "range", min: 1, max: 5 } } }],
    [
      "a website answer to a question never pre-filled",
      { dashboardAudience: { source: "website", confidence: 1, value: { format: "singleChoice", value: "me" } } },
    ],
    ["an unknown question", { favouriteColour: website(1, "Blue") }],
    ["a confidence above one", { companyName: website(1.5, "Northwind") }],
  ])("rejects %s", (_name, answers) => {
    expect(SetupAnswersSchema.safeParse(answers).success).toBe(false);
  });

  it("pre-fills only confident website answers to untouched questions", () => {
    const answers = touchAnswer({}, "companyName", { format: "shortText", value: "Northwind GmbH" });
    const merged = mergeWebsitePrefill(answers, {
      companyName: website(0.99, "Northwind Traders"),
      industries: {
        source: "website",
        confidence: 0.9,
        value: { format: "multipleChoice", values: [], custom: ["Logistics"] },
      },
      offerings: { source: "website", confidence: 0.4, value: { format: "orderedList", items: [{ label: "Audit" }] } },
    });
    expect(merged.companyName).toEqual({
      source: "user",
      confidence: 1,
      value: { format: "shortText", value: "Northwind GmbH" },
    });
    expect(merged.industries?.source).toBe("website");
    expect(merged.offerings).toBeUndefined();
  });

  it("lets a later crawl replace an earlier pre-fill but never a user answer", () => {
    const first = mergeWebsitePrefill({}, { companyName: website(0.8, "Northwind") });
    const second = mergeWebsitePrefill(first, { companyName: website(0.9, "Northwind Traders") });
    expect(second.companyName?.value).toEqual({ format: "shortText", value: "Northwind Traders" });
    const touched = touchAnswer(second, "companyName", { format: "shortText", value: "Northwind" });
    expect(mergeWebsitePrefill(touched, { companyName: website(1, "Other") }).companyName?.source).toBe("user");
  });

  it("ignores drafts that claim to be user answers or target unfilled questions", () => {
    const merged = mergeWebsitePrefill(
      {},
      {
        companyName: { source: "user", confidence: 1, value: { format: "shortText", value: "Spoofed" } },
        anythingMissed: website(1, "Draft"),
      },
    );
    expect(merged).toEqual({});
  });
});
