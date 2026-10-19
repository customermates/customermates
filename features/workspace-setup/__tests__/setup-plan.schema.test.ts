import type { SetupPlanInput } from "../setup-plan.schema";

import { describe, expect, it } from "vitest";

import { SETUP_PLAN_LIMITS, SetupPlanSchema } from "../setup-plan.schema";
import { agencyPlan, fieldServicePlan, saasPlan } from "./setup-plan-fixtures";

function variant(change: (plan: SetupPlanInput) => void): SetupPlanInput {
  const plan = structuredClone(agencyPlan);
  change(plan);
  return plan;
}

function field(plan: SetupPlanInput, key: string) {
  const found = plan.recordModel.fields.find((candidate) => candidate.key === key);
  if (!found) throw new Error(`Missing fixture field ${key}`);
  return found;
}

function role(plan: SetupPlanInput, key: string, value: "people" | "tasks" | "deals" | "offerings" | undefined) {
  plan.recordModel.lists = plan.recordModel.lists.map((list) => (list.key === key ? { ...list, role: value } : list));
}

function deep(depth: number): unknown {
  return depth <= 1
    ? { op: "number", value: "1" }
    : { op: "add", left: deep(depth - 1), right: { op: "number", value: "1" } };
}

describe("workspace setup plan schema", () => {
  it.each([agencyPlan, saasPlan, fieldServicePlan])("accepts a representative plan", (plan) => {
    expect(SetupPlanSchema.safeParse(plan).error?.issues).toBeUndefined();
  });

  it.each([
    [
      "too many lists",
      variant((plan) => {
        plan.recordModel.lists = [
          ...plan.recordModel.lists,
          ...Array.from({ length: SETUP_PLAN_LIMITS.lists + 1 - plan.recordModel.lists.length }, (_, index) => ({
            key: `list${index}`,
            label: `List ${index}`,
            pluralLabel: `Lists ${index}`,
            icon: "folder",
          })),
        ];
      }),
    ],
    [
      "too many fields",
      variant((plan) => {
        plan.recordModel.fields = Array.from({ length: SETUP_PLAN_LIMITS.fields + 1 }, (_, index) => ({
          key: `deal.extra${index}`,
          label: `Extra ${index}`,
          valueType: "text" as const,
        }));
      }),
    ],
    [
      "too many widgets",
      variant((plan) => {
        plan.dashboard.widgets = Array.from({ length: SETUP_PLAN_LIMITS.widgets + 1 }, (_, index) => ({
          ...agencyPlan.dashboard.widgets[0],
          key: `widget${index}`,
        }));
      }),
    ],
    [
      "too many options",
      variant((plan) => {
        field(plan, "deal.stage").options = Array.from({ length: SETUP_PLAN_LIMITS.options + 1 }, (_, index) => ({
          key: `option${index}`,
          label: `Option ${index}`,
        }));
      }),
    ],
    [
      "too many sample records",
      variant((plan) => {
        plan.sampleData.lists[0].count = SETUP_PLAN_LIMITS.sampleRecords + 1;
      }),
    ],
    [
      "too many import columns",
      variant((plan) => {
        plan.importMapping = {
          list: "organization",
          columns: Array.from({ length: SETUP_PLAN_LIMITS.importColumns + 1 }, (_, index) => ({
            column: `Column ${index}`,
            field: null,
          })),
        };
      }),
    ],
    [
      "a long label",
      variant((plan) => {
        plan.recordModel.lists[0].label = "x".repeat(81);
      }),
    ],
    [
      "a long page section",
      variant((plan) => {
        plan.knowledgeBase.pages[0].sections = ["x".repeat(201)];
      }),
    ],
    [
      "a deep calculation",
      variant((plan) => {
        plan.recordModel.calculations[0].expression = deep(SETUP_PLAN_LIMITS.expressionDepth + 1) as never;
      }),
    ],
    [
      "a key that is not a plain identifier",
      variant((plan) => {
        plan.recordModel.lists[0].key = "$project";
      }),
    ],
    [
      "the reserved line item list key",
      variant((plan) => {
        plan.recordModel.lists[5].key = "lineItem";
      }),
    ],
    [
      "a repeated list key",
      variant((plan) => {
        plan.recordModel.lists[5].key = "deal";
      }),
    ],
    [
      "a declared Channels field on the people list",
      variant((plan) => {
        plan.recordModel.fields[0].key = "contact.channels";
      }),
    ],
    [
      "a declared avatar field on the people list",
      variant((plan) => {
        plan.recordModel.fields[0].key = "contact.avatar";
      }),
    ],
    [
      "a declared money value on the deals list",
      variant((plan) => {
        plan.recordModel.fields.push({ key: "deal.value", label: "Value", valueType: "currency" });
      }),
    ],
    [
      "a declared price on the offerings list",
      variant((plan) => {
        plan.recordModel.fields.push({ key: "service.price", label: "Price", valueType: "currency" });
      }),
    ],
    ["no people list", variant((plan) => role(plan, "contact", undefined))],
    ["no tasks list", variant((plan) => role(plan, "task", undefined))],
    ["two people lists", variant((plan) => role(plan, "organization", "people"))],
    ["two tasks lists", variant((plan) => role(plan, "project", "tasks"))],
    ["two deals lists", variant((plan) => role(plan, "project", "deals"))],
    ["two offerings lists", variant((plan) => role(plan, "organization", "offerings"))],
    [
      "a new name field on a new list",
      variant((plan) => {
        plan.recordModel.fields[0].key = "project.name";
      }),
    ],
    [
      "a field on an unknown list",
      variant((plan) => {
        plan.recordModel.fields[0].key = "invoice.total";
      }),
    ],
    [
      "repeated field keys",
      variant((plan) => {
        plan.recordModel.fields[1].key = plan.recordModel.fields[0].key;
      }),
    ],
    [
      "the retired changes to standard lists",
      variant((plan) => {
        Object.assign(plan.recordModel, { listChanges: [] });
      }),
    ],
    [
      "options on a text field",
      variant((plan) => {
        field(plan, "deal.stage").valueType = "text";
      }),
    ],
    [
      "repeated option labels",
      variant((plan) => {
        field(plan, "deal.stage").options = [
          { key: "a", label: "Same" },
          { key: "b", label: "same" },
        ];
      }),
    ],
    [
      "a board without grouping",
      variant((plan) => {
        plan.listDefaults[0].groupBy = null;
      }),
    ],
    [
      "two defaults for one list",
      variant((plan) => {
        plan.listDefaults[1].list = "deal";
      }),
    ],
    [
      "a count with a value field",
      variant((plan) => {
        plan.dashboard.widgets[2].valueField = "deal.value";
      }),
    ],
    [
      "a starter display type the picker does not offer",
      variant((plan) => {
        plan.dashboard.widgets[0].display = "radarChartWithLabels" as never;
      }),
    ],
    [
      "an unknown chip colour",
      variant((plan) => {
        plan.recordModel.lists[0].color = "purple" as never;
      }),
    ],
    [
      "an extra property",
      variant((plan) => {
        Object.assign(plan.recordModel.lists[0], { archived: true });
      }),
    ],
  ])("rejects %s", (_name, plan) => {
    expect(SetupPlanSchema.safeParse(plan).success).toBe(false);
  });

  it("accepts a plan without deals or offerings and references to automatic fields", () => {
    expect(SetupPlanSchema.safeParse(fieldServicePlan).success).toBe(true);
    const plan = variant((value) => {
      value.listDefaults[2].columns = ["contact.channels", "contact.avatar"];
    });
    expect(SetupPlanSchema.safeParse(plan).success).toBe(true);
  });

  it("explains a missing role so the planner can repair it", () => {
    const result = SetupPlanSchema.safeParse(variant((plan) => role(plan, "task", undefined)));
    expect(result.error?.issues.map((issue) => issue.message)).toContain("Mark exactly one list with the role tasks.");
  });

  it("asks for a deals list next to an offerings list, since line items need both", () => {
    const result = SetupPlanSchema.safeParse(variant((plan) => role(plan, "deal", undefined)));
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      "A list with the role offerings needs a list with the role deals for its line items.",
    );
  });

  it("accepts a calculation at the depth limit", () => {
    const plan = variant((value) => {
      value.recordModel.calculations[0].expression = deep(SETUP_PLAN_LIMITS.expressionDepth) as never;
    });
    expect(SetupPlanSchema.safeParse(plan).success).toBe(true);
  });
});
