import { describe, expect, it } from "vitest";

import { compileTemplate, compileTemplateToSetupPlan } from "@/core/templates/compile-template";
import { TEMPLATE_SLUGS } from "@/core/templates/template-registry";
import { SetupFieldKeySchema, SetupPlanSchema } from "@/features/workspace-setup/setup-plan.schema";

import { cloneSpec, cloneText } from "./template-fixtures";

const PLAN_KEY = /^[a-z][a-zA-Z0-9]{0,23}$/;

describe("compileTemplate", () => {
  it.each(TEMPLATE_SLUGS)("is deterministic for %s", (slug) => {
    expect(compileTemplate(cloneSpec(slug), cloneText(slug))).toEqual(
      compileTemplate(cloneSpec(slug), cloneText(slug)),
    );
  });

  it.each(TEMPLATE_SLUGS)("keeps every plan key within the plan's key rules for %s", (slug) => {
    const { plan } = compileTemplate(cloneSpec(slug), cloneText(slug));
    const keys = [
      ...plan.recordModel.lists.map((list) => list.key),
      ...plan.recordModel.relationships.map((relation) => relation.key),
      ...plan.dashboard.widgets.map((widget) => widget.key),
      ...plan.knowledgeBase.pages.map((page) => page.key),
      ...plan.recordModel.fields.flatMap((field) => field.options.map((option) => option.key)),
    ];
    expect(keys.filter((key) => !PLAN_KEY.test(key))).toEqual([]);
    const fieldKeys = [...plan.recordModel.fields, ...plan.recordModel.calculations].map((field) => field.key);
    expect(fieldKeys.filter((key) => !SetupFieldKeySchema.safeParse(key).success)).toEqual([]);
  });

  it("returns the plan alone from compileTemplateToSetupPlan", () => {
    expect(compileTemplateToSetupPlan(cloneSpec(), cloneText())).toEqual(
      compileTemplate(cloneSpec(), cloneText()).plan,
    );
  });

  it("puts the stage field first and carries weights and outcomes", () => {
    const { plan } = compileTemplate(cloneSpec("sales-pipeline"), cloneText("sales-pipeline"));
    const stage = plan.recordModel.fields.find((field) => field.key === "opportunities.stage");
    expect(plan.recordModel.fields[0]?.key).toBe("opportunities.stage");
    expect(stage?.options.map((option) => [option.key, option.outcome, option.weight])).toEqual([
      ["new", "open", 10],
      ["qualified", "open", 25],
      ["discovery", "open", 40],
      ["proposalSent", "open", 60],
      ["negotiation", "open", 80],
      ["won", "won", 100],
      ["lost", "lost", 0],
    ]);
  });

  it("leaves a tracker status without weights", () => {
    const { plan } = compileTemplate(cloneSpec(), cloneText());
    const status = plan.recordModel.fields.find((field) => field.key === "clients.status");
    expect(status?.options.every((option) => option.weight === undefined && option.outcome === undefined)).toBe(true);
    expect(status?.options.map((option) => option.key)).toContain("waitingOnClient");
  });

  it("compiles the weighted value and the cycle length as calculations", () => {
    const { plan } = compileTemplate(cloneSpec("sales-pipeline"), cloneText("sales-pipeline"));
    expect(plan.recordModel.calculations).toEqual([
      {
        key: "opportunities.weightedValue",
        label: "Weighted value",
        valueType: "currency",
        expression: {
          op: "divide",
          left: {
            op: "multiply",
            left: { op: "field", field: "opportunities.value" },
            right: { op: "optionWeight", field: "opportunities.stage" },
          },
          right: { op: "number", value: "100" },
        },
      },
      {
        key: "opportunities.cycleDays",
        label: "Cycle in days",
        valueType: "number",
        expression: { op: "daysBetween", from: "opportunities.firstContactOn", to: "opportunities.closedOn" },
      },
    ]);
  });

  it("uses the default currency of the text locale", () => {
    expect(compileTemplate(cloneSpec(), cloneText("client-tracker", "en")).plan.workspace.currency).toBe("USD");
    expect(compileTemplate(cloneSpec(), cloneText("client-tracker", "de")).plan.workspace.currency).toBe("EUR");
  });

  it("creates no sample records and no import mapping", () => {
    const { plan } = compileTemplate(cloneSpec("real-estate-pipeline"), cloneText("real-estate-pipeline"));
    expect(plan.sampleData).toEqual({ lists: [] });
    expect(plan.importMapping).toBeNull();
    expect(plan.calendar).toEqual({ sources: [] });
  });

  it("uses the translated text of the chosen locale", () => {
    const { plan } = compileTemplate(cloneSpec("sales-pipeline"), cloneText("sales-pipeline", "de"));
    expect(plan.recordModel.lists.map((list) => list.pluralLabel)).toEqual([
      "Kontakte",
      "Unternehmen",
      "Verkaufschancen",
      "Aufgaben",
    ]);
    expect(plan.dashboard.widgets[0]?.title).toBe("Offene Verkaufschancen nach Phase");
  });

  it("splits default views into list defaults and saved views", () => {
    const spec = cloneSpec("real-estate-pipeline");
    const { plan, extras } = compileTemplate(spec, cloneText("real-estate-pipeline"));
    expect(plan.listDefaults.map((value) => value.list).sort()).toEqual(
      ["actions", "buyerSearches", "contacts", "keyDates", "listings", "organizations", "viewings"].sort(),
    );
    expect(extras.savedViews.map((view) => view.key)).toEqual([
      "listingsAll",
      "agreementsEnding",
      "leadsNotContacted",
      "actionsOverdue",
    ]);
    expect(extras.savedViews.find((view) => view.key === "agreementsEnding")?.filters).toEqual([
      { operator: "in", field: "listings.stage", options: ["onMarket"] },
      { operator: "notEmpty", field: "listings.agreementEnd" },
    ]);
  });

  it("returns every rule with its need and localized text as extras", () => {
    const spec = cloneSpec("sales-pipeline");
    const { extras } = compileTemplate(spec, cloneText("sales-pipeline"));
    expect(extras.rules).toHaveLength(spec.followUpRules.length);
    const proposal = extras.rules.find((rule) => rule.key === "followUpProposal");
    expect(proposal).toMatchObject({
      title: "Follow up on the proposal",
      trigger: { kind: "field_changed", field: "opportunities.stage", to: "proposalSent" },
      action: { kind: "create_task", taskKind: "followUp", assignee: "record_owner", about: "opportunities" },
      dueOffsetDays: 3,
      needs: "today",
    });
    expect(extras.rules.filter((rule) => rule.needs !== "today").map((rule) => rule.needs)).toEqual(
      expect.arrayContaining(["rules", "notifications", "forms"]),
    );
  });

  it("carries acceptance checks with their statements", () => {
    const { extras } = compileTemplate(cloneSpec("sales-pipeline"), cloneText("sales-pipeline"));
    expect(extras.acceptanceChecks[0]).toEqual({
      key: "stageField",
      kind: "field_exists",
      ref: "opportunities.stage",
      statement: "Every opportunity has one of seven stages.",
    });
  });

  it("throws a clear error when the text lacks a key", () => {
    const text = cloneText();
    delete text.lists.clients;
    expect(() => compileTemplate(cloneSpec(), text)).toThrow("Missing template text lists.clients");
  });
});

describe("SetupPlan gaps", () => {
  function withGapFields() {
    const spec = cloneSpec();
    const text = cloneText();
    spec.fields.push(
      { key: "clients.engagement_letter", type: "file", required: false, multiple: false, options: [] },
      { key: "clients.engagement", type: "dateRange", required: false, multiple: false, options: [] },
      { key: "clients.channels", type: "channels", required: false, multiple: false, options: [] },
    );
    text.fields["clients.engagement_letter"] = { label: "Engagement letter", options: {} };
    text.fields["clients.engagement"] = {
      label: "Engagement",
      options: {},
      rangeLabels: { from: "Engagement start", to: "Engagement end" },
    };
    text.fields["clients.channels"] = { label: "Channels", options: {} };
    return { spec, text };
  }

  it("moves a file field to extras and keeps it out of the plan", () => {
    const { spec, text } = withGapFields();
    const { plan, extras } = compileTemplate(spec, text);
    expect(plan.recordModel.fields.map((field) => field.key)).not.toContain("clients.engagementLetter");
    expect(extras.postBuildFields).toEqual([
      { field: "clients.engagementLetter", label: "Engagement letter", valueType: "file" },
    ]);
  });

  it("maps a date range to two date fields and channels to a multiple text field", () => {
    const { spec, text } = withGapFields();
    const { plan } = compileTemplate(spec, text);
    const byKey = new Map(plan.recordModel.fields.map((field) => [field.key, field]));
    expect(byKey.get("clients.engagementFrom")).toMatchObject({ label: "Engagement start", valueType: "date" });
    expect(byKey.get("clients.engagementTo")).toMatchObject({ label: "Engagement end", valueType: "date" });
    expect(byKey.get("clients.channels")).toMatchObject({ valueType: "text", multiple: true });
    expect(SetupPlanSchema.safeParse(plan).success).toBe(true);
  });
});
