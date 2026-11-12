import { describe, expect, it } from "vitest";

import type { CalculatedValue } from "@/features/records/record-model.schema";
import type { AutomationCondition } from "../automation-rule.schema";

import { evaluateCondition, evaluateConditions, scalarEquals } from "../automation-conditions";
import { extendAutomationChain, mayTriggerAutomationRule } from "../automation-context";
import {
  dateReachedCandidateWindow,
  dateReachedFireAt,
  dayOf,
  isDateReachedDue,
  localDay,
  shiftDay,
} from "../automation-date";
import { dateOccurrenceKey, eventOccurrenceKey, externalOccurrenceKey } from "../automation-occurrence";
import {
  AutomationConditionSchema,
  AutomationTriggerSchema,
  UpsertAutomationRuleSchema,
} from "../automation-rule.schema";
import { renderAutomationTemplate } from "../automation-template";

const TYPE = "11111111-1111-4111-8111-111111111111";
const FIELD = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const NOW = new Date("2026-11-12T10:00:00.000Z");
const CONTEXT = { now: NOW, timeZone: "Europe/Berlin" };

function value(result: CalculatedValue) {
  return new Map<string, CalculatedValue>([[FIELD, result]]);
}

function condition(input: Partial<AutomationCondition> & Pick<AutomationCondition, "operator">): AutomationCondition {
  return AutomationConditionSchema.parse({ fieldId: FIELD, ...input });
}

const text = (content: string): CalculatedValue => ({ state: "value", value: { kind: "text", value: content } });
const select = (id: string): CalculatedValue => ({ state: "value", value: { kind: "select", value: id } });
const date = (day: string): CalculatedValue => ({ state: "value", value: { kind: "date", value: day } });
const dateTime = (instant: string): CalculatedValue => ({
  state: "value",
  value: { kind: "dateTime", value: instant },
});
const missing: CalculatedValue = { state: "missing" };

describe("automation conditions", () => {
  it("compares equal values by kind and ignores nothing else", () => {
    expect(scalarEquals({ kind: "text", value: "a" }, { kind: "text", value: "a" })).toBe(true);
    expect(scalarEquals({ kind: "text", value: "a" }, { kind: "text", value: "A" })).toBe(false);
    expect(scalarEquals({ kind: "text", value: "1" }, { kind: "select", value: "1" })).toBe(false);
    expect(
      scalarEquals(
        { kind: "decimal", value: "10.50", currency: "EUR" },
        { kind: "decimal", value: "10.5", currency: "EUR" },
      ),
    ).toBe(true);
    expect(
      scalarEquals({ kind: "decimal", value: "10", currency: "EUR" }, { kind: "decimal", value: "10", currency: null }),
    ).toBe(false);
    expect(scalarEquals({ kind: "selectList", value: ["a", "b"] }, { kind: "selectList", value: ["b", "a"] })).toBe(
      true,
    );
    expect(
      scalarEquals(
        { kind: "dateTime", value: "2026-11-12T10:00:00.000Z" },
        { kind: "dateTime", value: "2026-11-12T11:00:00+01:00" },
      ),
    ).toBe(true);
  });

  it("handles equals, notEquals, in and notIn", () => {
    const stage = select("won");
    expect(
      evaluateCondition(
        condition({ operator: "equals", value: { kind: "select", value: "won" } }),
        value(stage),
        CONTEXT,
      ),
    ).toBe(true);
    expect(
      evaluateCondition(
        condition({ operator: "notEquals", value: { kind: "select", value: "won" } }),
        value(stage),
        CONTEXT,
      ),
    ).toBe(false);
    expect(
      evaluateCondition(
        condition({
          operator: "in",
          values: [
            { kind: "select", value: "lost" },
            { kind: "select", value: "won" },
          ],
        }),
        value(stage),
        CONTEXT,
      ),
    ).toBe(true);
    expect(
      evaluateCondition(
        condition({ operator: "notIn", values: [{ kind: "select", value: "lost" }] }),
        value(stage),
        CONTEXT,
      ),
    ).toBe(true);
    expect(
      evaluateCondition(
        condition({ operator: "in", values: [{ kind: "select", value: "a" }] }),
        value({ state: "value", value: { kind: "selectList", value: ["a", "b"] } }),
        CONTEXT,
      ),
    ).toBe(true);
  });

  it("handles empty and notEmpty, and refuses values it cannot read", () => {
    expect(evaluateCondition(condition({ operator: "empty" }), value(missing), CONTEXT)).toBe(true);
    expect(evaluateCondition(condition({ operator: "empty" }), new Map(), CONTEXT)).toBe(true);
    expect(evaluateCondition(condition({ operator: "notEmpty" }), value(text("x")), CONTEXT)).toBe(true);
    expect(evaluateCondition(condition({ operator: "notEmpty" }), value(missing), CONTEXT)).toBe(false);
    const restricted: CalculatedValue = { state: "restricted" };
    expect(
      evaluateCondition(
        condition({ operator: "equals", value: { kind: "text", value: "x" } }),
        value(restricted),
        CONTEXT,
      ),
    ).toBe(false);
    expect(
      evaluateCondition(
        condition({ operator: "notEquals", value: { kind: "text", value: "x" } }),
        value(missing),
        CONTEXT,
      ),
    ).toBe(false);
  });

  it("compares dates against a value and against today in the time zone", () => {
    const before = condition({ operator: "before", value: { kind: "date", value: "2026-11-20" } });
    expect(evaluateCondition(before, value(date("2026-11-19")), CONTEXT)).toBe(true);
    expect(evaluateCondition(before, value(date("2026-11-20")), CONTEXT)).toBe(false);
    const after = condition({ operator: "after", value: { kind: "date", value: "2026-11-20" } });
    expect(evaluateCondition(after, value(date("2026-11-21")), CONTEXT)).toBe(true);
    const overdue = condition({ operator: "before", relativeDays: 0 });
    expect(evaluateCondition(overdue, value(date("2026-11-11")), CONTEXT)).toBe(true);
    expect(evaluateCondition(overdue, value(date("2026-11-12")), CONTEXT)).toBe(false);
    const soon = condition({ operator: "before", relativeDays: 3 });
    expect(evaluateCondition(soon, value(date("2026-11-14")), CONTEXT)).toBe(true);
    expect(evaluateCondition(soon, value(date("2026-11-15")), CONTEXT)).toBe(false);
  });

  it("reads a date and time in the rule's time zone when comparing days", () => {
    const overdue = condition({ operator: "before", relativeDays: 0 });
    const lateEvening = dateTime("2026-11-11T23:30:00.000Z");
    expect(evaluateCondition(overdue, value(lateEvening), { now: NOW, timeZone: "Europe/Berlin" })).toBe(false);
    expect(evaluateCondition(overdue, value(lateEvening), { now: NOW, timeZone: "America/New_York" })).toBe(true);
    expect(evaluateCondition(overdue, value(dateTime("2026-11-10T22:30:00.000Z")), CONTEXT)).toBe(true);
    const instant = condition({ operator: "after", value: { kind: "dateTime", value: "2026-11-12T08:00:00.000Z" } });
    expect(evaluateCondition(instant, value(dateTime("2026-11-12T09:00:00.000Z")), CONTEXT)).toBe(true);
    expect(evaluateCondition(instant, value(dateTime("2026-11-12T07:00:00.000Z")), CONTEXT)).toBe(false);
  });

  it("requires every condition to hold", () => {
    const values = new Map<string, CalculatedValue>([
      [FIELD, select("won")],
      [OTHER, text("Acme")],
    ]);
    const wonAcme = [
      condition({ operator: "equals", value: { kind: "select", value: "won" } }),
      AutomationConditionSchema.parse({ fieldId: OTHER, operator: "notEmpty" }),
    ];
    expect(evaluateConditions(wonAcme, values, CONTEXT)).toBe(true);
    expect(evaluateConditions([...wonAcme, condition({ operator: "empty" })], values, CONTEXT)).toBe(false);
    expect(evaluateConditions([], values, CONTEXT)).toBe(true);
  });

  it("rejects a condition that lacks the operand its operator needs", () => {
    expect(AutomationConditionSchema.safeParse({ fieldId: FIELD, operator: "equals" }).success).toBe(false);
    expect(AutomationConditionSchema.safeParse({ fieldId: FIELD, operator: "in" }).success).toBe(false);
    expect(AutomationConditionSchema.safeParse({ fieldId: FIELD, operator: "before" }).success).toBe(false);
    expect(AutomationConditionSchema.safeParse({ fieldId: FIELD, operator: "before", relativeDays: -2 }).success).toBe(
      true,
    );
    expect(
      AutomationConditionSchema.safeParse({ fieldId: FIELD, operator: "empty", value: { kind: "text", value: "x" } })
        .success,
    ).toBe(false);
  });
});

describe("date reached timing", () => {
  const trigger = { days: 2, direction: "before" as const, atHour: 8, timezone: "Europe/Berlin" };

  it("fires a date field at the chosen hour in the time zone, days before the date", () => {
    expect(dateReachedFireAt(trigger, { kind: "date", value: "2026-11-20" })?.toISOString()).toBe(
      "2026-11-18T07:00:00.000Z",
    );
    expect(
      dateReachedFireAt(
        { ...trigger, direction: "after", days: 1 },
        { kind: "date", value: "2026-11-20" },
      )?.toISOString(),
    ).toBe("2026-11-21T07:00:00.000Z");
    expect(dateReachedFireAt({ ...trigger, days: 0 }, { kind: "date", value: "2026-11-20" })?.toISOString()).toBe(
      "2026-11-20T07:00:00.000Z",
    );
  });

  it("follows daylight saving time when shifting by calendar days", () => {
    expect(
      dateReachedFireAt({ ...trigger, days: 2, atHour: 8 }, { kind: "date", value: "2027-03-30" })?.toISOString(),
    ).toBe("2027-03-28T06:00:00.000Z");
    const shifted = dateReachedFireAt(
      { days: 1, direction: "before", atHour: 8, timezone: "Europe/Berlin" },
      { kind: "dateTime", value: "2027-03-28T09:00:00.000Z" },
    );
    expect(shifted?.toISOString()).toBe("2027-03-27T10:00:00.000Z");
  });

  it("shifts a date and time field by whole days of the time zone", () => {
    const fired = dateReachedFireAt(
      { days: 1, direction: "after", atHour: 0, timezone: "America/New_York" },
      { kind: "dateTime", value: "2026-11-12T15:00:00.000Z" },
    );
    expect(fired?.toISOString()).toBe("2026-11-13T15:00:00.000Z");
  });

  it("is due from the fire time until the lookback ends, never before", () => {
    const fireAt = new Date("2026-11-12T07:00:00.000Z");
    expect(isDateReachedDue(fireAt, new Date("2026-11-12T06:59:59.000Z"), 7)).toBe(false);
    expect(isDateReachedDue(fireAt, new Date("2026-11-12T07:00:00.000Z"), 7)).toBe(true);
    expect(isDateReachedDue(fireAt, new Date("2026-11-19T07:00:00.000Z"), 7)).toBe(true);
    expect(isDateReachedDue(fireAt, new Date("2026-11-19T07:00:01.000Z"), 7)).toBe(false);
  });

  it("widens the candidate window beyond the exact check so no record is missed", () => {
    const window = dateReachedCandidateWindow({ days: 2, direction: "before" }, NOW, 7);
    const due = new Date("2026-11-13T00:00:00.000Z");
    expect(due.getTime()).toBeGreaterThan(window.from.getTime());
    expect(due.getTime()).toBeLessThan(window.to.getTime());
    const notYet = new Date("2026-11-20T00:00:00.000Z");
    expect(notYet.getTime()).toBeGreaterThan(window.to.getTime());
    const after = dateReachedCandidateWindow({ days: 2, direction: "after" }, NOW, 7);
    expect(after.to.getTime()).toBeLessThan(window.to.getTime());
  });

  it("computes local days and day arithmetic", () => {
    expect(localDay(new Date("2026-11-12T23:30:00.000Z"), "Europe/Berlin")).toBe("2026-11-13");
    expect(localDay(new Date("2026-11-12T23:30:00.000Z"), "America/New_York")).toBe("2026-11-12");
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
    expect(dayOf({ kind: "date", value: "2026-11-12" }, "Europe/Berlin")).toBe("2026-11-12");
    expect(dayOf({ kind: "dateTime", value: "2026-11-12T23:30:00.000Z" }, "Europe/Berlin")).toBe("2026-11-13");
  });

  it("rejects an invalid time zone and a negative offset in the trigger", () => {
    const base = { kind: "dateReached", typeId: TYPE, fieldId: FIELD, days: 1, direction: "before" };
    expect(AutomationTriggerSchema.safeParse({ ...base, timezone: "Mars/Base" }).success).toBe(false);
    expect(AutomationTriggerSchema.safeParse({ ...base, days: -1 }).success).toBe(false);
    const parsed = AutomationTriggerSchema.parse(base);
    expect(parsed).toMatchObject({ atHour: 8, timezone: "UTC" });
  });
});

describe("occurrence keys", () => {
  it("is stable for the same occurrence and changes when the date or offset changes", () => {
    const trigger = { fieldId: FIELD, days: 2, direction: "before" as const };
    const first = dateOccurrenceKey(trigger, "rec", "2026-11-20");
    expect(dateOccurrenceKey(trigger, "rec", "2026-11-20")).toBe(first);
    expect(dateOccurrenceKey(trigger, "rec", "2026-11-21")).not.toBe(first);
    expect(dateOccurrenceKey({ ...trigger, days: 3 }, "rec", "2026-11-20")).not.toBe(first);
    expect(eventOccurrenceKey("e1")).toBe("event:e1");
    expect(externalOccurrenceKey("form.submitted", "s1")).toBe("external:form.submitted:s1");
  });
});

describe("loop guard", () => {
  it("lets user events trigger every rule", () => {
    expect(mayTriggerAutomationRule("a", undefined)).toBe(true);
    expect(mayTriggerAutomationRule("a", [])).toBe(true);
  });

  it("never lets a rule's own effects retrigger it", () => {
    expect(mayTriggerAutomationRule("a", ["a"])).toBe(false);
    expect(mayTriggerAutomationRule("b", ["a"])).toBe(true);
  });

  it("stops a chain after one rule has already caused the change", () => {
    expect(mayTriggerAutomationRule("c", ["a", "b"])).toBe(false);
    expect(extendAutomationChain(["a"], "b")).toEqual(["a", "b"]);
    expect(extendAutomationChain(undefined, "a")).toEqual(["a"]);
  });
});

describe("templates", () => {
  it("fills the record and rule names and leaves unknown placeholders alone", () => {
    const context = { record: { name: "Acme" }, rule: { name: "Follow up" } };
    expect(renderAutomationTemplate("Call {{record.name}} ({{ rule.name }}) {{other.value}}", context)).toBe(
      "Call Acme (Follow up) {{other.value}}",
    );
    expect(renderAutomationTemplate("Hi {{record.name}}", { rule: { name: "x" } })).toBe("Hi ");
  });
});

describe("rule definitions", () => {
  const effect = {
    kind: "notify",
    recipients: { ruleOwner: true },
    title: "Look at {{record.name}}",
  };

  it("accepts a complete rule and fills defaults", () => {
    const parsed = UpsertAutomationRuleSchema.parse({
      name: "Remind me",
      trigger: { kind: "dateReached", typeId: TYPE, fieldId: FIELD, days: 1, direction: "before" },
      effects: [effect],
    });
    expect(parsed.effects?.[0]).toMatchObject({ recipients: { ruleOwner: true, assignees: false, userIds: [] } });
  });

  it("requires a name, a trigger and effects on create but not on update", () => {
    expect(UpsertAutomationRuleSchema.safeParse({}).success).toBe(false);
    expect(UpsertAutomationRuleSchema.safeParse({ id: TYPE, enabled: false }).success).toBe(true);
  });

  it("refuses a notification without recipients", () => {
    const result = UpsertAutomationRuleSchema.safeParse({
      name: "x",
      trigger: { kind: "recordCreated", typeId: TYPE },
      effects: [{ kind: "notify", recipients: {}, title: "t" }],
    });
    expect(result.success).toBe(false);
  });

  it("refuses record effects and conditions on a trigger without a record", () => {
    const base = { name: "x", trigger: { kind: "messageReceived" } };
    expect(
      UpsertAutomationRuleSchema.safeParse({
        ...base,
        effects: [{ kind: "setField", fields: [{ fieldId: FIELD, value: { kind: "text", value: "a" } }] }],
      }).success,
    ).toBe(false);
    expect(
      UpsertAutomationRuleSchema.safeParse({
        ...base,
        conditions: [{ fieldId: FIELD, operator: "empty" }],
        effects: [effect],
      }).success,
    ).toBe(false);
    expect(UpsertAutomationRuleSchema.safeParse({ ...base, effects: [effect] }).success).toBe(true);
  });

  it("limits conditions and effects", () => {
    const conditions = Array.from({ length: 21 }, () => ({ fieldId: FIELD, operator: "empty" }));
    expect(
      UpsertAutomationRuleSchema.safeParse({
        name: "x",
        trigger: { kind: "recordCreated", typeId: TYPE },
        conditions,
        effects: [effect],
      }).success,
    ).toBe(false);
    expect(
      UpsertAutomationRuleSchema.safeParse({
        name: "x",
        trigger: { kind: "recordCreated", typeId: TYPE },
        effects: Array.from({ length: 11 }, () => effect),
      }).success,
    ).toBe(false);
  });
});
