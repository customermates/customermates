import { describe, expect, it } from "vitest";

import { SetupPlanSchema } from "@/features/workspace-setup/setup-plan.schema";
import { agencyPlan, fieldServicePlan, saasPlan } from "@/features/workspace-setup/__tests__/setup-plan-fixtures";

import { followUpAnswerIssue, followUpQuestions, planFromWire, prefillAnswers } from "../workspace-setup-wire";
import { planToWire } from "./setup-wire-fixtures";

const blank = { choice: null, choices: [], custom: [], items: [], min: null, max: null, text: null };

describe("pre-fill answers from the website", () => {
  it("keeps valid answers in the question's format and marks them as from the website", () => {
    const answers = prefillAnswers({
      answers: [
        { ...blank, part: "companyName", confidence: 0.95, text: "Example GmbH" },
        { ...blank, part: "country", confidence: 0.9, choice: "DE" },
        { ...blank, part: "currency", confidence: 0.9, choice: "EUR" },
        { ...blank, part: "language", confidence: 0.9, choice: "de" },
        { ...blank, part: "offeringKinds", confidence: 0.8, choices: ["services"], custom: ["Workshops"] },
        { ...blank, part: "salesSteps", confidence: 0.6, items: [{ label: "Erstgespräch", winChance: 10.4 }] },
      ],
    });
    expect(answers.companyName).toEqual({
      source: "website",
      confidence: 0.95,
      value: { format: "shortText", value: "Example GmbH" },
    });
    expect(answers.country?.value).toEqual({ format: "singleChoice", value: "DE" });
    expect(answers.offeringKinds?.value).toEqual({
      format: "multipleChoice",
      values: ["services"],
      custom: ["Workshops"],
    });
    expect(answers.salesSteps?.value).toEqual({
      format: "orderedList",
      items: [{ label: "Erstgespräch", winChance: 10 }],
    });
  });

  it("drops never-prefilled parts, unknown options, invalid codes, unknown parts and clamps confidence", () => {
    const answers = prefillAnswers({
      answers: [
        { ...blank, part: "dashboardAudience", confidence: 1, choice: "team" },
        { ...blank, part: "existingData", confidence: 1, choice: "sampleData" },
        { ...blank, part: "customerKind", confidence: 1, choice: "aliens" },
        { ...blank, part: "country", confidence: 1, choice: "Germany" },
        { ...blank, part: "currency", confidence: 1, choice: "euro" },
        { ...blank, part: "language", confidence: 1, choice: "xx" },
        { ...blank, part: "notAPart", confidence: 1, text: "x" },
        { ...blank, part: "companyName", confidence: 3, text: "Clamp AG" },
      ],
    });
    expect(Object.keys(answers)).toEqual(["companyName"]);
    expect(answers.companyName?.confidence).toBe(1);
  });
});

describe("follow-up questions", () => {
  const wire = (overrides: Record<string, unknown>) => ({
    label: "Which renewal period do you use?",
    format: "singleChoice" as const,
    options: [
      { id: "monthly", label: "Monthly" },
      { id: "yearly", label: "Yearly" },
    ],
    allowCustom: false,
    winChance: false,
    maxItems: null,
    maxPicks: null,
    suggestions: [],
    unit: null,
    single: false,
    min: null,
    max: null,
    maxLength: null,
    ...overrides,
  });

  it("keeps at most three valid questions in the interview formats and numbers them", () => {
    const questions = followUpQuestions({
      questions: [
        wire({}),
        wire({ format: "range", unit: "days", single: true, min: 0, max: 365 }),
        wire({ format: "singleChoice", options: [{ id: "only", label: "Only one" }] }),
        wire({ format: "shortText", maxLength: 200 }),
        wire({ format: "orderedList", suggestions: ["Kickoff"], maxItems: 5 }),
      ],
    });
    expect(questions.map((question) => [question.id, question.format])).toEqual([
      ["followUp1", "singleChoice"],
      ["followUp2", "range"],
      ["followUp3", "shortText"],
    ]);
  });

  it("checks a follow-up answer against its own question", () => {
    const [question] = followUpQuestions({ questions: [wire({})] });
    expect(followUpAnswerIssue(question, { format: "singleChoice", value: "yearly" })).toBeNull();
    expect(followUpAnswerIssue(question, { format: "singleChoice", value: "weekly" })).toBe("Unknown option.");
    expect(followUpAnswerIssue(question, { format: "shortText", value: "yearly" })).toMatch(/format/);
  });
});

describe("plan wire format", () => {
  it.each([
    ["agency", agencyPlan],
    ["subscription", saasPlan],
    ["field service", fieldServicePlan],
  ])("round-trips the %s plan without recursion or constraints on the wire", (_name, input) => {
    const converted = planFromWire(planToWire(input));
    expect(converted).toEqual({ ok: true, plan: SetupPlanSchema.parse(input) });
  });

  it("reports schema issues the model can repair instead of throwing", () => {
    const broken = planToWire(agencyPlan);
    broken.recordModel.calculations[0].expression = "{not json";
    const unknownList = planToWire(agencyPlan);
    unknownList.listDefaults[0].list = "nowhere";
    expect(planFromWire(broken)).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ path: "recordModel.calculations.0.expression" })],
    });
    expect(planFromWire(unknownList)).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ path: "listDefaults.0.list" })],
    });
  });
});
