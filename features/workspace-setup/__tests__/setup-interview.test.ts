import type { SetupAnswers } from "../setup-answers.schema";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { APP_LOCALES } from "@/i18n/locale-registry";

import { SetupAnswersSchema, storedSetupAnswers, touchAnswer } from "../setup-answers.schema";
import {
  SETUP_CONTEXT_PARTS,
  SETUP_PARTS,
  SETUP_QUESTION_PARTS,
  SETUP_QUESTIONS,
  setupPart,
  setupPartVisible,
  setupQuestionVisible,
  setupVisibleAnswers,
} from "../setup-interview";

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

const user = (value: NonNullable<SetupAnswers[string]>["value"]) => ({
  source: "user" as const,
  confidence: 1,
  value,
});
const purpose = (...values: string[]) => user({ format: "multipleChoice", values, custom: [] });
const workWith = (value: string) => user({ format: "singleChoice", value });

function question(id: string) {
  const found = SETUP_QUESTIONS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Unknown question ${id}`);
  return found;
}

describe("workspace setup interview", () => {
  it("asks four short questions in order, one per screen", () => {
    expect(SETUP_QUESTIONS.map((entry) => [entry.number, entry.id])).toEqual([
      [1, "workWith"],
      [2, "purpose"],
      [3, "mainSteps"],
      [4, "charge"],
    ]);
    expect(question("charge").parts.map((part) => part.id)).toEqual(["pricing", "existingData"]);
    expect(new Set(SETUP_PARTS.map((part) => part.id)).size).toBe(SETUP_PARTS.length);
  });

  it("takes the profile facts from context instead of asking again", () => {
    expect(SETUP_CONTEXT_PARTS.map((part) => part.id)).toEqual([
      "teamSize",
      "companyName",
      "country",
      "language",
      "currency",
    ]);
    expect(SETUP_QUESTION_PARTS.some((part) => SETUP_CONTEXT_PARTS.includes(part))).toBe(false);
    expect(setupPartVisible("language", {})).toBe(true);
    expect(setupPartVisible("teamSize", {})).toBe(true);
  });

  it("requires only who the owner works with, what they track and the example records", () => {
    expect(SETUP_QUESTION_PARTS.filter((part) => !part.optional).map((part) => part.id)).toEqual([
      "workWith",
      "purpose",
      "existingData",
    ]);
    expect(setupPart("existingData")).toMatchObject({
      format: "singleChoice",
      options: [
        { id: "sampleData", labelKey: "WorkspaceSetup.options.existingData.sampleData", preselected: true },
        { id: "empty", labelKey: "WorkspaceSetup.options.existingData.empty" },
      ],
    });
  });

  it("offers every common way to use a workspace and an own entry", () => {
    const part = setupPart("purpose");
    expect(part).toMatchObject({ format: "multipleChoice", allowCustom: true });
    expect(part && "options" in part ? part.options.map((option) => option.id) : []).toEqual([
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
    const keys = SETUP_PARTS.flatMap((part) => [
      part.labelKey,
      ...("options" in part ? part.options.map((option) => option.labelKey) : []),
      ...("placeholderKey" in part && part.placeholderKey ? [part.placeholderKey] : []),
    ]);
    for (const key of keys) expect(typeof lookup(messages, key), key).toBe("string");
  });
});

describe("workspace setup visibility", () => {
  it("asks for steps only when tracked work moves through steps", () => {
    expect(setupPartVisible("mainSteps", {})).toBe(false);
    expect(setupQuestionVisible(question("mainSteps"), { purpose: purpose("chats", "finances") })).toBe(false);
    expect(setupQuestionVisible(question("mainSteps"), { purpose: purpose("hiring") })).toBe(true);
  });

  it("asks how the owner charges only when the owner has customers or clients, but always keeps the screen", () => {
    expect(setupPartVisible("pricing", { workWith: workWith("ownWork") })).toBe(false);
    expect(setupPartVisible("pricing", { workWith: workWith("clients") })).toBe(true);
    expect(setupPartVisible("pricing", { workWith: workWith("customers") })).toBe(true);
    expect(setupQuestionVisible(question("charge"), { workWith: workWith("ownWork") })).toBe(true);
    expect(setupPartVisible("existingData", { workWith: workWith("ownWork") })).toBe(true);

    const answers: SetupAnswers = {
      workWith: workWith("ownWork"),
      pricing: user({ format: "singleChoice", value: "timeBased" }),
      companyName: user({ format: "shortText", value: "Ada Lovelace" }),
    };
    expect(Object.keys(setupVisibleAnswers(answers))).toEqual(["workWith", "companyName"]);
  });
});

describe("workspace setup answers", () => {
  it("accepts answers in every format", () => {
    const parsed = SetupAnswersSchema.safeParse({
      companyName: user({ format: "shortText", value: "Northwind" }),
      currency: user({ format: "singleChoice", value: "EUR" }),
      workWith: workWith("clients"),
      purpose: user({ format: "multipleChoice", values: ["deals", "projects"], custom: ["Site visits"] }),
      mainSteps: user({ format: "orderedList", items: [{ label: "Inquiry" }, { label: "Won" }] }),
    });
    expect(parsed.error?.issues).toBeUndefined();
  });

  it.each([
    ["a format mismatch", { teamSize: user({ format: "shortText", value: "5" }) }],
    ["an unknown option", { teamSize: user({ format: "singleChoice", value: "huge" }) }],
    ["the removed spreadsheet start", { existingData: user({ format: "singleChoice", value: "spreadsheet" }) }],
    [
      "an answer drafted from a website",
      { companyName: { ...user({ format: "shortText", value: "N" }), source: "website" } },
    ],
    ["an unknown question", { favouriteColour: user({ format: "shortText", value: "Blue" }) }],
    ["a confidence above one", { companyName: { ...user({ format: "shortText", value: "N" }), confidence: 1.5 } }],
  ])("rejects %s", (_name, answers) => {
    expect(SetupAnswersSchema.safeParse(answers).success).toBe(false);
  });

  it("keeps stored steps that still carry a win chance", () => {
    expect(
      storedSetupAnswers({
        mainSteps: {
          source: "user",
          confidence: 1,
          value: { format: "orderedList", items: [{ label: "Audit", winChance: 50 }] },
        },
      }).mainSteps?.value,
    ).toMatchObject({ format: "orderedList", items: [{ label: "Audit" }] });
  });

  it("drops stored answers that no longer fit, such as website drafts and removed questions", () => {
    const name = user({ format: "shortText", value: "Northwind" });
    expect(
      storedSetupAnswers({
        companyName: name,
        workWith: { source: "website", confidence: 0.9, value: { format: "singleChoice", value: "clients" } },
        purposeDetails: user({ format: "shortText", value: "Kitchens" }),
      }),
    ).toEqual({ companyName: name });
    expect(storedSetupAnswers(null)).toEqual({});
  });

  it("records a touched answer as the owner's own", () => {
    expect(touchAnswer({}, "workWith", { format: "singleChoice", value: "clients" })).toEqual({
      workWith: workWith("clients"),
    });
  });
});
