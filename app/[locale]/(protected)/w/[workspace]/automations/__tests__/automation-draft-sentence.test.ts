import type { useTranslations } from "next-intl";
import type { AutomationBuilderField, AutomationBuilderModel } from "../components/automation-builder-model";

import { describe, expect, it } from "vitest";

import { blankCondition, emptyDraft } from "../components/automation-draft";
import { conditionSentence, effectSentence } from "../components/automation-draft-sentence";

const DEALS = "11111111-1111-4111-8111-111111111111";
const DONE = "22222222-2222-4222-8222-111111111111";
const STAGE = "22222222-2222-4222-8222-222222222222";

function field(id: string, label: string, valueType: string, options: AutomationBuilderField["options"] = []) {
  return { id, label, valueType, writable: true, multiple: false, currency: null, options };
}

const MODEL: AutomationBuilderModel = {
  lists: [
    {
      id: DEALS,
      label: "Deal",
      primaryFieldId: null,
      unsupportedFieldIds: [],
      fields: [field(DONE, "Done", "boolean"), field(STAGE, "Stage", "select", [{ id: "won", label: "Won" }])],
    },
  ],
  relationships: [],
};

const TEXTS: Record<string, string> = {
  "AutomationRules.builder.boolean.true": "Yes",
  "AutomationRules.builder.boolean.false": "No",
  "AutomationRules.operator.equals": "is",
  "AutomationRules.operator.notEquals": "is not",
};

const t = ((key: string, values?: { condition?: string }) =>
  values?.condition === undefined ? (TEXTS[key] ?? key) : `if ${values.condition}`) as unknown as ReturnType<
  typeof useTranslations
>;

const TRIGGER = emptyDraft(MODEL, { typeId: DEALS, timezone: "UTC" }).trigger;

describe("the sentence of a condition card", () => {
  it("says Yes and No for a yes/no field instead of true and false", () => {
    expect(conditionSentence({ ...blankCondition(DONE, "equals"), value: "true" }, TRIGGER, MODEL, t)).toBe(
      "if Done is Yes",
    );
    expect(conditionSentence({ ...blankCondition(DONE, "notEquals"), value: "false" }, TRIGGER, MODEL, t)).toBe(
      "if Done is not No",
    );
  });

  it("says the same for a yes/no condition that was set outside the builder", () => {
    const kept = { fieldId: DONE, operator: "equals" as const, value: { kind: "boolean" as const, value: true } };

    expect(conditionSentence({ ...blankCondition(DONE, "equals"), kept }, TRIGGER, MODEL, t)).toBe("if Done is Yes");
  });

  it("still names the option of a choice and leaves an unfinished yes/no value empty", () => {
    expect(conditionSentence({ ...blankCondition(STAGE, "equals"), value: "won" }, TRIGGER, MODEL, t)).toBe(
      "if Stage is Won",
    );
    expect(conditionSentence(blankCondition(DONE, "equals"), TRIGGER, MODEL, t)).toBe("if Done is");
  });
});

describe("the sentence of a step kept as it is", () => {
  const keyed = ((key: string, values?: Record<string, string>) =>
    values ? `${key}:${Object.values(values).join("|")}` : key) as unknown as ReturnType<typeof useTranslations>;

  it("names what the step does instead of saying it is kept", () => {
    const setStage = {
      kind: "kept" as const,
      effect: {
        kind: "setField" as const,
        fields: [{ fieldId: STAGE, value: { kind: "select" as const, value: "won" } }],
      },
    };
    expect(effectSentence(setStage, MODEL, TRIGGER, keyed)).toBe("Automations.sentence.effect.setField:Stage");

    const notifyMembers = {
      kind: "kept" as const,
      effect: {
        kind: "notify" as const,
        recipients: { ruleOwner: false, assignees: false, userIds: ["33333333-3333-4333-8333-333333333333"] },
        notificationKind: "ruleAlert" as const,
        title: "Check {{record.name}}",
      },
    };
    expect(effectSentence(notifyMembers, MODEL, TRIGGER, keyed)).toBe("Automations.sentence.effect.notifyMembers");
  });
});
