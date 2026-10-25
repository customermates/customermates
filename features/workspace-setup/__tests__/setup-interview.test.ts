import type { SetupAnswers } from "../setup-answers.schema";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { APP_LOCALES } from "@/i18n/locale-registry";

import { SetupAnswersSchema, storedSetupAnswers } from "../setup-answers.schema";
import {
  SETUP_INTERVIEW_ACTIONS,
  SETUP_PARTS,
  SETUP_QUESTIONS,
  SETUP_SCREEN_DEFINITIONS,
  SETUP_SCREENS,
  setupPart,
  setupPartVisible,
  setupVisibleAnswers,
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
  it("asks eight short questions on one screen in order", () => {
    expect(SETUP_QUESTIONS.map((question) => question.number)).toEqual(Array.from({ length: 8 }, (_, i) => i + 1));
    expect(SETUP_SCREEN_DEFINITIONS.map((screen) => screen.id)).toEqual([...SETUP_SCREENS]);
    expect(SETUP_SCREENS).toEqual(["workspace"]);
    expect(new Set(SETUP_PARTS.map((part) => part.id)).size).toBe(SETUP_PARTS.length);
  });

  it("requires only who the owner works with, what they track, the data start, language and currency", () => {
    expect(SETUP_PARTS.filter((part) => !part.optional).map((part) => part.id)).toEqual([
      "workWith",
      "purpose",
      "existingData",
      "language",
      "currency",
    ]);
    expect(setupPart("mainSteps")).toMatchObject({ format: "orderedList", winChance: false, prefill: "suggested" });
    expect(setupPart("existingData")).toMatchObject({ format: "singleChoice", upload: true, prefill: "no" });
    expect(SETUP_QUESTIONS.at(-1)?.parts.map((part) => part.id)).toEqual([
      "companyName",
      "country",
      "language",
      "currency",
    ]);
  });

  it("offers every common way to use a workspace and an own entry", () => {
    const purpose = setupPart("purpose");
    expect(purpose).toMatchObject({ format: "multipleChoice", allowCustom: true });
    expect(purpose && "options" in purpose ? purpose.options.map((option) => option.id) : []).toEqual([
      "deals",
      "projects",
      "contracts",
      "orders",
      "chats",
      "support",
      "hiring",
      "investors",
      "partners",
      "finances",
      "marketing",
    ]);
  });

  it.each(APP_LOCALES)("has every label in %s", (locale) => {
    const messages = catalog(locale);
    const keys = [
      ...SETUP_SCREEN_DEFINITIONS.map((screen) => screen.titleKey),
      ...Object.values(SETUP_INTERVIEW_ACTIONS).map((action) => action.labelKey),
      ...SETUP_PARTS.flatMap((part) => [
        part.labelKey,
        ...("options" in part ? part.options.map((option) => option.labelKey) : []),
        ...("placeholderKey" in part && part.placeholderKey ? [part.placeholderKey] : []),
      ]),
    ];
    for (const key of keys) expect(typeof lookup(messages, key), key).toBe("string");
  });
});

describe("workspace setup purpose", () => {
  const user = (value: NonNullable<SetupAnswers[string]>["value"]) => ({
    source: "user" as const,
    confidence: 1,
    value,
  });
  const purpose = (...values: string[]) => user({ format: "multipleChoice", values, custom: [] });
  const workWith = (value: string) => user({ format: "singleChoice", value });

  it("asks for steps only when tracked work moves through steps", () => {
    expect(setupPartVisible("mainSteps", {})).toBe(false);
    expect(setupPartVisible("mainSteps", { purpose: purpose("chats", "finances") })).toBe(false);
    expect(setupPartVisible("mainSteps", { purpose: purpose("hiring") })).toBe(true);
  });

  it("asks how the owner charges only when the owner has customers or clients", () => {
    expect(setupPartVisible("pricing", { workWith: workWith("ownWork") })).toBe(false);
    expect(setupPartVisible("pricing", { workWith: workWith("clients") })).toBe(true);

    const answers: SetupAnswers = {
      workWith: workWith("ownWork"),
      pricing: user({ format: "singleChoice", value: "timeBased" }),
      companyName: user({ format: "shortText", value: "Ada Lovelace" }),
    };
    expect(Object.keys(setupVisibleAnswers(answers))).toEqual(["workWith", "companyName"]);
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
      workWith: {
        source: "user",
        confidence: 1,
        value: { format: "singleChoice", value: "clients" },
      },
      purpose: {
        source: "user",
        confidence: 1,
        value: { format: "multipleChoice", values: ["deals", "projects"], custom: ["Site visits"] },
      },
      mainSteps: {
        source: "website",
        confidence: 0.75,
        value: {
          format: "orderedList",
          items: [{ label: "Inquiry" }, { label: "Won" }],
        },
      },
    });
    expect(parsed.error?.issues).toBeUndefined();
  });

  it.each([
    [
      "a format mismatch",
      {
        teamSize: {
          source: "user",
          confidence: 1,
          value: { format: "shortText", value: "5" },
        },
      },
    ],
    [
      "an unknown option",
      {
        teamSize: {
          source: "user",
          confidence: 1,
          value: { format: "singleChoice", value: "huge" },
        },
      },
    ],
    [
      "a win chance on the steps",
      {
        mainSteps: {
          source: "user",
          confidence: 1,
          value: { format: "orderedList", items: [{ label: "Audit", winChance: 50 }] },
        },
      },
    ],
    [
      "a website answer to a question never pre-filled",
      { existingData: { source: "website", confidence: 1, value: { format: "singleChoice", value: "empty" } } },
    ],
    ["an unknown question", { favouriteColour: website(1, "Blue") }],
    ["a confidence above one", { companyName: website(1.5, "Northwind") }],
  ])("rejects %s", (_name, answers) => {
    expect(SetupAnswersSchema.safeParse(answers).success).toBe(false);
  });

  it("keeps the stored answers that still fit when a question was removed", () => {
    expect(
      storedSetupAnswers({
        companyName: website(0.9, "Northwind"),
        purpose: {
          source: "user",
          confidence: 1,
          value: { format: "multipleChoice", values: ["clients"], custom: [] },
        },
        weeklyNumbers: { source: "user", confidence: 1, value: { format: "rankedPick", values: ["forecast"] } },
      }),
    ).toEqual({ companyName: website(0.9, "Northwind") });
    expect(storedSetupAnswers(null)).toEqual({});
  });

  it("pre-fills only confident website answers to untouched questions", () => {
    const answers = touchAnswer({}, "companyName", { format: "shortText", value: "Northwind GmbH" });
    const merged = mergeWebsitePrefill(answers, {
      companyName: website(0.99, "Northwind Traders"),
      purpose: {
        source: "website",
        confidence: 0.9,
        value: { format: "multipleChoice", values: ["projects"], custom: [] },
      },
      mainSteps: { source: "website", confidence: 0.4, value: { format: "orderedList", items: [{ label: "Audit" }] } },
    });
    expect(merged.companyName).toEqual({
      source: "user",
      confidence: 1,
      value: { format: "shortText", value: "Northwind GmbH" },
    });
    expect(merged.purpose?.source).toBe("website");
    expect(merged.mainSteps).toBeUndefined();
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
        existingData: { source: "website", confidence: 1, value: { format: "singleChoice", value: "empty" } },
      },
    );
    expect(merged).toEqual({});
  });
});
