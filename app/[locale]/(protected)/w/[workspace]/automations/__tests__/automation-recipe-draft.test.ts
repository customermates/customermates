import { describe, expect, it } from "vitest";

import type { RecordModelView } from "@/features/records/record-model.schema";
import type { RecipeText } from "@/components/automations/automation-recipe-text";

import { UpsertAutomationRuleSchema } from "@/features/automation-rules/automation-rule.schema";
import { AUTOMATION_RECIPES, recipeById } from "@/features/automation-rules/recipes";
import { toAutomationBuilderModel } from "../components/automation-builder-model";
import { draftToUpsert } from "../components/automation-draft";
import { bindRecipe, recipeToDraft } from "../components/automation-recipe-draft";

const DEALS = "11111111-1111-4111-8111-111111111111";
const CONTRACTS = "11111111-1111-4111-8111-333333333333";
const TASKS = "11111111-1111-4111-8111-222222222222";
const NAME = "22222222-2222-4222-8222-111111111111";
const STAGE = "22222222-2222-4222-8222-222222222222";
const REASON = "22222222-2222-4222-8222-333333333333";
const CLOSE = "22222222-2222-4222-8222-444444444444";
const END = "22222222-2222-4222-8222-555555555555";
const TITLE = "22222222-2222-4222-8222-666666666666";
const DUE = "22222222-2222-4222-8222-777777777777";
const CONTRACT_NAME = "22222222-2222-4222-8222-888888888888";
const TZ = "Europe/Berlin";

function field(id: string, typeId: string, valueType: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    typeId,
    label: `field ${id.slice(-3)}`,
    valueType,
    behavior: { kind: "input" },
    archived: false,
    required: false,
    options: [],
    position: 0,
    ...extra,
  };
}

function modelOf(types: Array<[string, string, string]>, fields: ReturnType<typeof field>[]) {
  return toAutomationBuilderModel({
    revision: 1,
    types: types.map(([id, label, primaryFieldId], position) => ({
      id,
      label,
      archived: false,
      embedded: false,
      position,
      primaryFieldId,
    })),
    fields,
    relationships: [],
  } as unknown as RecordModelView);
}

const MODEL = modelOf(
  [
    [DEALS, "Deal", NAME],
    [CONTRACTS, "Contract", CONTRACT_NAME],
    [TASKS, "Action", TITLE],
  ],
  [
    field(NAME, DEALS, "text"),
    field(STAGE, DEALS, "select", {
      options: [
        { id: "offer", label: "Offer sent" },
        { id: "won", label: "Won" },
      ],
    }),
    field(REASON, DEALS, "text"),
    field(CLOSE, DEALS, "date"),
    field(CONTRACT_NAME, CONTRACTS, "text"),
    field(END, CONTRACTS, "date"),
    field(TITLE, TASKS, "text"),
    field(DUE, TASKS, "date"),
  ],
);

const TEXT: RecipeText = {
  title: "Recipe name",
  description: "Describes it",
  effects: ["First {{record.name}}", "Second {{record.name}}"],
};

function draftOf(id: string, model = MODEL) {
  const recipe = recipeById(id);
  if (!recipe) throw new Error(`unknown recipe ${id}`);
  return recipeToDraft(recipe, model, { timezone: TZ, text: TEXT, runtime: "mate" });
}

describe("binding a recipe to the workspace", () => {
  it("binds the list and the fields when the model offers exactly one candidate", () => {
    const recipe = recipeById("followUpAfterOffer");
    if (!recipe) throw new Error("recipe missing");
    expect(bindRecipe(recipe, MODEL)).toEqual({
      typeId: DEALS,
      stageFieldId: STAGE,
      dateFieldId: "",
      reasonFieldId: "",
    });
  });

  it("leaves a slot for the user when several lists qualify", () => {
    const recipe = recipeById("remindBeforeRenewal");
    if (!recipe) throw new Error("recipe missing");
    expect(bindRecipe(recipe, MODEL)).toEqual({ typeId: "", stageFieldId: "", dateFieldId: "", reasonFieldId: "" });
  });

  it("binds the reason field to the only text field besides the name", () => {
    const recipe = recipeById("wonOrLostReason");
    if (!recipe) throw new Error("recipe missing");
    expect(bindRecipe(recipe, MODEL)).toMatchObject({ typeId: DEALS, stageFieldId: STAGE, reasonFieldId: REASON });
  });

  it("binds nothing for a recipe without list slots", () => {
    const recipe = recipeById("welcomeSubmission");
    if (!recipe) throw new Error("recipe missing");
    expect(bindRecipe(recipe, MODEL).typeId).toBe("");
  });
});

describe("opening a recipe in the builder", () => {
  it("fills the chain with the resolved fields and converts to a valid rule", () => {
    const draft = draftOf("followUpAfterOffer");
    expect(draft.name).toBe("Recipe name");
    expect(draft.trigger).toMatchObject({ kind: "fieldChanged", typeId: DEALS, fieldId: STAGE });
    expect(draft.effects.map((effect) => effect.kind)).toEqual(["createRecord", "notify"]);
    const converted = draftToUpsert(draft, MODEL);
    expect(converted.ok).toBe(true);
    if (converted.ok) expect(UpsertAutomationRuleSchema.safeParse(converted.input).success).toBe(true);
  });

  it("keeps an unresolved list and field empty so the user must choose them", () => {
    const draft = draftOf("remindBeforeRenewal");
    expect(draft.trigger).toMatchObject({
      kind: "dateReached",
      typeId: "",
      fieldId: "",
      days: "30",
      direction: "before",
    });
    expect(draftToUpsert(draft, MODEL)).toEqual({ ok: false, issues: ["trigger"] });
    const resolved = { ...draft, trigger: { ...draft.trigger, typeId: CONTRACTS, fieldId: END } };
    const converted = draftToUpsert(resolved, MODEL);
    expect(converted.ok).toBe(true);
    if (converted.ok) {
      expect(converted.input.trigger).toMatchObject({
        kind: "dateReached",
        fieldId: END,
        days: 30,
        direction: "before",
      });
      expect(UpsertAutomationRuleSchema.safeParse(converted.input).success).toBe(true);
    }
  });

  it("opens a form recipe on any list with an agent step on Mate", () => {
    const draft = draftOf("answerEnquiries");
    expect(draft.trigger).toMatchObject({ kind: "formSubmitted", typeId: "" });
    expect(draft.effects[0]).toMatchObject({ kind: "agent", runtime: "mate", prompt: "First {{record.name}}" });
    const converted = draftToUpsert(draft, MODEL);
    expect(converted.ok).toBe(true);
    if (converted.ok) expect(converted.input.trigger).toEqual({ kind: "formSubmitted" });
  });

  it("sets the due offset on the new Action when its list has exactly one writable date field", () => {
    const draft = draftOf("welcomeSubmission");
    const action = draft.effects[0];
    expect(action).toMatchObject({ kind: "createRecord", typeId: expect.any(String), dueDays: expect.any(String) });
    expect(action?.kind === "createRecord" ? action.title : "").toBe("First {{record.name}}");
  });

  it("adds an empty-field condition for the reason recipe", () => {
    const draft = draftOf("wonOrLostReason");
    expect(draft.conditions).toEqual([{ fieldId: REASON, operator: "empty", value: "", values: [], kept: null }]);
    expect(draft.trigger).toMatchObject({ kind: "recordUpdated", fieldId: "", fieldIds: [STAGE] });
    const converted = draftToUpsert(draft, MODEL);
    expect(converted.ok && converted.input.trigger).toMatchObject({ kind: "recordUpdated", fieldIds: [STAGE] });
  });

  it("opens every rule recipe without throwing on a workspace without any list", () => {
    const empty = modelOf([], []);
    for (const recipe of AUTOMATION_RECIPES.filter((item) => item.kind === "rule")) {
      const draft = recipeToDraft(recipe, empty, { timezone: TZ, text: TEXT, runtime: "ownKey" });
      expect(draft.effects.length, recipe.id).toBeGreaterThan(0);
    }
  });
});
