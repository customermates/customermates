import { describe, expect, it } from "vitest";

import { SetupPlanSchema } from "@/features/workspace-setup/setup-plan.schema";
import { agencyPlan, fieldServicePlan, saasPlan } from "@/features/workspace-setup/__tests__/setup-plan-fixtures";

import { STRUCTURED_OUTPUT_MAX_UNION_TYPES, structuredOutputUnionTypes } from "@/ee/agent-chat/structured-model-call";

import {
  FollowUpWireSchema,
  MappingWireSchema,
  PlanKnowledgeWireSchema,
  PlanModelWireSchema,
  PlanViewsWireSchema,
  PrefillWireSchema,
  followUpAnswerIssue,
  followUpQuestions,
  lowerCamelKey,
  planFromWire,
  planPartPath,
  planWireFromParts,
  prefillAnswers,
  sampleRecordsWireSchema,
} from "../workspace-setup-wire";
import { planToWire, planToWireParts } from "./setup-wire-fixtures";

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

  it("drops system columns from a list's column order, which only orders fields", () => {
    const wire = planToWire(agencyPlan);
    wire.listDefaults[0].columns = ["system:assignedTo", ...wire.listDefaults[0].columns, "system:createdAt"];
    expect(planFromWire(wire)).toEqual({ ok: true, plan: SetupPlanSchema.parse(agencyPlan) });
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

describe("model-facing setup schemas", () => {
  it("keeps every schema a setup model call sends under the union budget of constrained decoding", () => {
    const schemas = {
      PrefillWireSchema,
      FollowUpWireSchema,
      PlanModelWireSchema,
      PlanViewsWireSchema,
      PlanKnowledgeWireSchema,
      MappingWireSchema,
      samples: sampleRecordsWireSchema(Array.from({ length: 30 }, (_value, index) => `column${index}`)),
    };
    const over = Object.entries(schemas).filter(
      ([, schema]) => structuredOutputUnionTypes(schema) > STRUCTURED_OUTPUT_MAX_UNION_TYPES,
    );
    expect(over.map(([name]) => name)).toEqual([]);
  });

  it("keeps the model part flat, so no nested object can come back as JSON text", () => {
    for (const schema of [PlanModelWireSchema, PlanViewsWireSchema, PlanKnowledgeWireSchema])
      for (const field of Object.values(schema.shape)) expect(field.def.type).not.toBe("object");
  });

  it("assembles the three parts into the plan they were split from", () => {
    const parts = planToWireParts(agencyPlan);
    expect(planWireFromParts(parts.model, parts.views, parts.knowledge)).toEqual(planToWire(agencyPlan));
    expect(planPartPath("recordModel.fields.2.key")).toBe("fields.2.key");
    expect(planPartPath("dashboard.widgets.1.title")).toBe("widgets.1.title");
    expect(planPartPath("sampleData.lists.0.kinds.0")).toBe("sampleLists.0.kinds.0");
    expect(planPartPath("listDefaults.0.list")).toBe("listDefaults.0.list");
  });
});

describe("plan normalisation the model does not need to get right", () => {
  it("keeps one view per list, drops totals without a grouping and the implicit name field of a new list", () => {
    const wire = planToWire(agencyPlan);
    wire.listDefaults.push({ ...wire.listDefaults[0], name: "All deals", layout: "table", groupBy: null });
    wire.listDefaults[1] = { ...wire.listDefaults[1], groupBy: null, layout: "table" };
    wire.recordModel.fields.push({
      key: "project.name",
      label: "Name",
      valueType: "text",
      required: true,
      multiple: false,
      options: [],
    });
    const converted = planFromWire(wire);
    expect(converted.ok && converted.plan.listDefaults.map((value) => [value.name, value.summaries.length])).toEqual([
      ["Pipeline", 2],
      ["Delivery", 0],
      ["People", 0],
    ]);
    expect(converted.ok && converted.plan.recordModel.fields.some((field) => field.key === "project.name")).toBe(false);
  });

  it("turns number literals into the decimal strings expressions take, and clamps sample kinds", () => {
    const wire = planToWire(agencyPlan);
    wire.recordModel.calculations[0].expression = JSON.stringify({
      op: "multiply",
      left: { op: "field", field: "project.budget" },
      right: { op: "number", value: 0.2 },
    });
    wire.sampleData.lists[0].kinds = [
      "Decision-makers at small agencies, consultancies and software companies across Europe",
    ];
    const converted = planFromWire(wire);
    expect(converted.ok && converted.plan.recordModel.calculations[0].expression).toMatchObject({
      right: { op: "number", value: "0.2" },
    });
    expect(converted.ok && converted.plan.sampleData.lists[0].kinds[0].length).toBeLessThanOrEqual(80);
  });

  it("derives a valid key from a page or widget key written as words", () => {
    expect(lowerCamelKey("competitor-hubspot")).toBe("competitorHubspot");
    expect(lowerCamelKey("ruby Hotels")).toBe("rubyHotels");
    expect(lowerCamelKey("2024 pipeline")).toBe("pipeline");
  });

  it("files a pre-filled choice for a question that only takes own entries as an own entry", () => {
    expect(
      prefillAnswers({ answers: [{ ...blank, part: "industries", confidence: 0.8, choices: ["Retail"] }] }),
    ).toEqual({
      industries: {
        source: "website",
        confidence: 0.8,
        value: { format: "multipleChoice", values: [], custom: ["Retail"] },
      },
    });
  });
});
