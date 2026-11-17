import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { CalculatedValue, RecordField, RecordModel } from "@/features/records/record-model.schema";

import { createCrmPreset, presetId } from "@/features/records/crm-preset";
import { recordEventSubscriptionIsValid } from "@/features/records/record-event-subscription-validation";
import { RecordEventSubscriptionSchema } from "@/features/records/record-event-subscription.schema";
import { evaluateConditions } from "../automation-conditions";
import { AutomationConditionSchema, AutomationTriggerSchema } from "../automation-rule.schema";
import { fieldChangedFilter, ruleConditionPlan } from "../automation-record-trigger";

const workspace = randomUUID();
const DEAL = presetId(workspace, "deal");
const STAGE = presetId(workspace, "deal.stage");
const WON = presetId(workspace, "deal.stage.won");
const LOST = presetId(workspace, "deal.stage.lost");
const NAME = presetId(workspace, "deal.name");
const OWNER = randomUUID();
const CLOSES = randomUUID();
const TAGS = randomUUID();

const closes: RecordField = {
  id: CLOSES,
  typeId: DEAL,
  label: "Closes",
  valueType: "date",
  multiple: false,
  behavior: { kind: "input" },
  required: false,
  archived: false,
  publishedSummary: false,
  position: 50,
  options: [],
};
const tags: RecordField = {
  id: TAGS,
  typeId: DEAL,
  label: "Tags",
  valueType: "select",
  multiple: true,
  behavior: { kind: "input" },
  required: false,
  archived: false,
  publishedSummary: false,
  position: 51,
  options: ["alpha", "beta"].map((id) => ({ id, label: id, color: "info", attributes: [] })),
};

function model(): RecordModel {
  const preset = createCrmPreset(workspace);
  return { ...preset, fields: [...preset.fields, closes, tags] };
}

const trigger = (value: Record<string, unknown>) => AutomationTriggerSchema.parse(value);
const condition = (value: Record<string, unknown>) => AutomationConditionSchema.parse(value);

describe("a rule's record trigger as a shared record trigger", () => {
  it("subscribes a creation rule to created records of its list", () => {
    const { subscription, residual } = ruleConditionPlan(trigger({ kind: "recordCreated", typeId: DEAL }), [], model());
    expect(subscription).toEqual({
      typeId: DEAL,
      events: ["record.created"],
      changedFieldIds: [],
      query: { typeId: DEAL, filters: [], relationships: [] },
    });
    expect(residual).toEqual([]);
  });

  it("watches the chosen fields of an update rule and every field when none is chosen", () => {
    const watched = ruleConditionPlan(
      trigger({ kind: "recordUpdated", typeId: DEAL, fieldIds: [STAGE, NAME] }),
      [],
      model(),
    );
    expect(watched.subscription).toMatchObject({ events: ["record.updated"], changedFieldIds: [STAGE, NAME] });
    const any = ruleConditionPlan(trigger({ kind: "recordUpdated", typeId: DEAL }), [], model());
    expect(any.subscription).toMatchObject({ events: ["record.updated"], changedFieldIds: [] });
  });

  it("turns the value of a field-changed rule into a record filter", () => {
    const { subscription } = ruleConditionPlan(
      trigger({ kind: "fieldChanged", typeId: DEAL, fieldId: STAGE, to: { kind: "select", value: WON } }),
      [],
      model(),
    );
    expect(subscription).toMatchObject({
      events: ["record.updated"],
      changedFieldIds: [STAGE],
      query: { filters: [{ fieldId: STAGE, operator: "eq", value: { kind: "select", value: WON } }] },
    });
    const anyValue = ruleConditionPlan(trigger({ kind: "fieldChanged", typeId: DEAL, fieldId: STAGE }), [], model());
    expect(anyValue.subscription?.query.filters).toEqual([]);
  });

  it("refuses a value the field cannot be filtered by", () => {
    const wrongKind = trigger({
      kind: "fieldChanged",
      typeId: DEAL,
      fieldId: STAGE,
      to: { kind: "text", value: "won" },
    });
    expect(wrongKind.kind === "fieldChanged" && fieldChangedFilter(wrongKind, model())).toBeNull();
    const unknownOption = trigger({
      kind: "fieldChanged",
      typeId: DEAL,
      fieldId: STAGE,
      to: { kind: "select", value: "nothing" },
    });
    expect(unknownOption.kind === "fieldChanged" && fieldChangedFilter(unknownOption, model())).toBeNull();
  });

  it("moves the conditions the shared filters can express into the subscription", () => {
    const stageIsWon = condition({ fieldId: STAGE, operator: "equals", value: { kind: "select", value: WON } });
    const stageIsOpen = condition({
      fieldId: STAGE,
      operator: "notIn",
      values: [
        { kind: "select", value: WON },
        { kind: "select", value: LOST },
      ],
    });
    const hasName = condition({ fieldId: NAME, operator: "notEmpty" });
    const closesLater = condition({ fieldId: CLOSES, operator: "after", value: { kind: "date", value: "2026-12-01" } });
    const { subscription, residual } = ruleConditionPlan(
      trigger({ kind: "recordCreated", typeId: DEAL }),
      [stageIsWon, stageIsOpen, hasName, closesLater],
      model(),
    );
    expect(subscription?.query.filters).toEqual([
      { fieldId: STAGE, operator: "eq", value: { kind: "select", value: WON } },
      {
        fieldId: STAGE,
        operator: "notIn",
        value: null,
        values: [
          { kind: "select", value: WON },
          { kind: "select", value: LOST },
        ],
      },
      { fieldId: NAME, operator: "notEmpty", value: null },
      { fieldId: CLOSES, operator: "gt", value: { kind: "date", value: "2026-12-01" } },
    ]);
    expect(residual).toEqual([]);
  });

  it("keeps the conditions the shared filters cannot express for the run", () => {
    const relative = condition({ fieldId: CLOSES, operator: "before", relativeDays: 7 });
    const exactSet = condition({ fieldId: TAGS, operator: "equals", value: { kind: "selectList", value: ["alpha"] } });
    const unknownField = condition({ fieldId: randomUUID(), operator: "empty" });
    const { subscription, residual } = ruleConditionPlan(
      trigger({ kind: "recordCreated", typeId: DEAL }),
      [relative, exactSet, unknownField],
      model(),
    );
    expect(subscription?.query.filters).toEqual([]);
    expect(residual).toEqual([relative, exactSet, unknownField]);
  });

  it("leaves rules that do not start from a record event to the run", () => {
    const hasName = condition({ fieldId: NAME, operator: "notEmpty" });
    for (const value of [
      { kind: "dateReached", typeId: DEAL, fieldId: CLOSES, days: 1, direction: "before" },
      { kind: "messageReceived" },
      { kind: "formSubmitted", typeId: DEAL },
      { kind: "webhookReceived" },
    ]) {
      expect(ruleConditionPlan(trigger(value), [hasName], model())).toEqual({
        subscription: null,
        residual: [hasName],
      });
    }
  });

  it("answers a not-equal condition on an empty field the same on every trigger", () => {
    const notLost = condition({ fieldId: STAGE, operator: "notEquals", value: { kind: "select", value: LOST } });
    const notClosed = condition({
      fieldId: STAGE,
      operator: "notIn",
      values: [
        { kind: "select", value: LOST },
        { kind: "select", value: WON },
      ],
    });
    const emptyStage = new Map<string, CalculatedValue>([[STAGE, { state: "missing" }]]);
    const context = { now: new Date("2026-11-12T10:00:00.000Z"), timeZone: "UTC" };

    const updated = ruleConditionPlan(trigger({ kind: "recordUpdated", typeId: DEAL }), [notLost, notClosed], model());
    expect(updated.residual).toEqual([]);
    expect(updated.subscription?.query.filters.map((filter) => filter.operator)).toEqual(["ne", "notIn"]);

    for (const value of [
      { kind: "dateReached", typeId: DEAL, fieldId: CLOSES, days: 1, direction: "before" },
      { kind: "formSubmitted", typeId: DEAL },
      { kind: "webhookReceived", typeId: DEAL },
    ]) {
      const { subscription, residual } = ruleConditionPlan(trigger(value), [notLost, notClosed], model());
      expect(subscription).toBeNull();
      expect(evaluateConditions(residual, emptyStage, context)).toBe(true);
    }
  });

  it("produces a subscription the shared layer accepts", () => {
    const { subscription } = ruleConditionPlan(
      trigger({ kind: "fieldChanged", typeId: DEAL, fieldId: STAGE, to: { kind: "select", value: WON } }),
      [condition({ fieldId: NAME, operator: "notEmpty" })],
      model(),
    );
    const stored = RecordEventSubscriptionSchema.parse({
      id: randomUUID(),
      kind: "rule",
      ownerUserId: OWNER,
      ...subscription,
      sources: null,
      enabled: true,
      revision: 1,
    });
    expect(recordEventSubscriptionIsValid(stored, model())).toBe(true);
    expect(RecordEventSubscriptionSchema.safeParse({ ...stored, typeId: null, query: null }).success).toBe(false);
  });
});
