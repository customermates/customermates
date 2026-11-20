import type { SetupPlan } from "@/features/workspace-setup/setup-plan.schema";
import type { SetupResolver } from "@/features/workspace-setup/setup-references";

import { describe, expect, it } from "vitest";

import { compileTemplate } from "@/core/templates/compile-template";
import { compileTemplateAutomation } from "@/core/templates/compile-template-automation";
import { templateRuleInputs } from "@/core/templates/template-rule-inputs";
import { TEMPLATE_SLUGS } from "@/core/templates/template-registry";
import { UpsertAutomationRuleSchema } from "@/features/automation-rules/automation-rule.schema";

import { cloneSpec, cloneText } from "./template-fixtures";

const OPTIONS = { timezone: "Europe/Berlin", atHour: 8 };

function resolverFor(plan: SetupPlan, missingLists: readonly string[] = []): SetupResolver {
  const ids = new Map<string, string>();
  const idOf = (label: string) => {
    const known = ids.get(label);
    if (known) return known;
    const created = `00000000-0000-4000-8000-${(ids.size + 1).toString(16).padStart(12, "0")}`;
    ids.set(label, created);
    return created;
  };
  const lists = new Set(plan.recordModel.lists.map((list) => list.key).filter((key) => !missingLists.includes(key)));
  const fields = new Map(plan.recordModel.fields.map((field) => [field.key, field]));
  const relationships = new Set(plan.recordModel.relationships.map((relation) => relation.key));
  return {
    list: (key) => (lists.has(key) ? idOf(`list:${key}`) : undefined),
    field: (ref) => {
      const [owner, name] = ref.split(".");
      if (!lists.has(owner)) return undefined;
      return name === "name" || fields.has(ref) ? idOf(`field:${ref}`) : undefined;
    },
    relationship: (key) => (relationships.has(key) ? idOf(`relationship:${key}`) : undefined),
    option: (fieldRef, key) => (fields.get(fieldRef)?.options.some((option) => option.key === key) ? key : undefined),
    definition: () => undefined,
  };
}

function inputsFor(slug: Parameters<typeof cloneSpec>[0], missingLists: readonly string[] = []) {
  const spec = cloneSpec(slug);
  const { plan, extras } = compileTemplate(spec, cloneText(slug));
  const proposals = compileTemplateAutomation(spec, extras.rules);
  const resolver = resolverFor(plan, missingLists);
  return { proposals, resolver, result: templateRuleInputs(proposals, plan, resolver, OPTIONS) };
}

describe("templateRuleInputs", () => {
  it.each(TEMPLATE_SLUGS)("answers every rule of %s with a valid rule or a reason", (slug) => {
    const { proposals, result } = inputsFor(slug);
    expect([...result.ready, ...result.skipped].map((entry) => entry.key).sort()).toEqual(
      proposals.map((proposal) => proposal.key).sort(),
    );
    for (const draft of result.ready) expect(UpsertAutomationRuleSchema.safeParse(draft.input).success).toBe(true);
    for (const skipped of result.skipped) expect(skipped.reason.length).toBeGreaterThan(0);
  });

  it("turns a stage change into a live rule that creates a linked task for the rule owner", () => {
    const { result, resolver } = inputsFor("client-support-desk");
    const survey = result.ready.find((draft) => draft.key === "sendSurvey");
    expect(survey).toBeDefined();
    expect(survey?.input).toEqual({
      name: expect.any(String),
      enabled: true,
      trigger: {
        kind: "fieldChanged",
        typeId: resolver.list("tickets"),
        fieldId: resolver.field("tickets.status"),
        to: { kind: "select", value: "solved" },
      },
      conditions: [],
      effects: [
        {
          kind: "createRecord",
          typeId: resolver.list("actions"),
          title: { fieldId: resolver.field("actions.name"), text: expect.stringMatching(/: \{\{record\.name\}\}$/u) },
          due: { fieldId: resolver.field("actions.due"), offsetDays: 1 },
          fields: [{ fieldId: resolver.field("actions.kind"), value: { kind: "select", value: "sendSurvey" } }],
          assignToRuleOwner: true,
          assignedUserIds: [],
          link: { relationId: resolver.relationship("actionTicket"), direction: "outgoing" },
        },
      ],
    });
    expect(survey?.notes).toEqual([expect.stringContaining("assigned to the rule owner")]);
  });

  it("maps a date offset with its time zone, a condition on options and a notification", () => {
    const { result, resolver } = inputsFor("client-support-desk");
    const missed = result.ready.find((draft) => draft.key === "firstResponseMissed");
    expect(missed?.input.trigger).toEqual({
      kind: "dateReached",
      typeId: resolver.list("tickets"),
      fieldId: resolver.field("tickets.firstResponseDue"),
      days: 0,
      direction: "after",
      atHour: 8,
      timezone: "Europe/Berlin",
    });
    expect(missed?.input.conditions).toEqual([
      { fieldId: resolver.field("tickets.status"), operator: "in", values: [{ kind: "select", value: "new" }] },
    ]);
    expect(missed?.input.effects).toEqual([
      {
        kind: "notify",
        recipients: { ruleOwner: true, assignees: false, userIds: [] },
        notificationKind: "ruleAlert",
        title: expect.any(String),
      },
    ]);
  });

  it("skips what the engine cannot run with the reason", () => {
    const { result } = inputsFor("client-support-desk");
    const reasons = Object.fromEntries(result.skipped.map((entry) => [entry.key, entry.reason]));
    expect(reasons.nudgeCustomer).toContain("stayed unchanged");
    expect(reasons.dataRequestClock).toContain("relative to today");
    expect(reasons.ticketFromWebhook).toContain("creates these records itself");
    expect(
      inputsFor("founder-sales-pipeline").result.skipped.find((entry) => entry.key === "recapReply")?.reason,
    ).toContain("agent routine");
  });

  it("skips a rule whose list the workspace no longer has and says which one", () => {
    const { result } = inputsFor("client-support-desk", ["knownIssues"]);
    expect(result.ready.map((draft) => draft.key)).not.toContain("knownIssueFixed");
    expect(result.skipped.find((entry) => entry.key === "knownIssueFixed")?.reason).toContain(
      'The field "knownIssues.status" does not exist',
    );
  });

  it("creates the task without a link when the template has no relationship to link it by", () => {
    const withoutLink = TEMPLATE_SLUGS.flatMap((slug) => {
      const { result } = inputsFor(slug);
      return result.ready.filter((draft) => draft.notes.some((note) => note.includes("not linked")));
    });
    expect(withoutLink.length).toBeGreaterThan(0);
    const links = withoutLink.flatMap((draft) =>
      (draft.input.effects ?? []).flatMap((effect) => (effect.kind === "createRecord" ? [effect.link] : [])),
    );
    expect(links.every((link) => link === undefined)).toBe(true);
  });

  it("proposes nothing for a plan without a tasks list", () => {
    const spec = cloneSpec("client-support-desk");
    const { plan, extras } = compileTemplate(spec, cloneText("client-support-desk"));
    const withoutTasks: SetupPlan = {
      ...plan,
      recordModel: {
        ...plan.recordModel,
        lists: plan.recordModel.lists.map((list) => ({ ...list, role: list.role === "tasks" ? undefined : list.role })),
      },
    };
    const result = templateRuleInputs(
      compileTemplateAutomation(spec, extras.rules),
      withoutTasks,
      resolverFor(plan),
      OPTIONS,
    );
    expect(result.ready).toEqual([]);
    expect(result.skipped.length).toBeGreaterThan(0);
  });
});
