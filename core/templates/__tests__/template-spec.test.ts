import { describe, expect, it } from "vitest";

import { TEMPLATE_SLUGS } from "@/core/templates/template-registry";
import { TemplateSpecSchema } from "@/core/templates/template-spec.schema";
import { templateTextIssues } from "@/core/templates/template-text-validation";

import { cloneSpec, cloneText, schemaMessagesAfter, specIssuesAfter } from "./template-fixtures";

describe("template spec validation", () => {
  it.each(TEMPLATE_SLUGS)("accepts the shipped spec %s", (slug) => {
    expect(TemplateSpecSchema.safeParse(cloneSpec(slug)).success).toBe(true);
    expect(specIssuesAfter(() => undefined, slug)).toEqual([]);
  });

  it("rejects a requiresCapabilities list that differs from what the rules need", () => {
    const messages = specIssuesAfter((spec) => {
      spec.requiresCapabilities = ["forms"];
    });
    expect(messages.join()).toContain("requiresCapabilities must equal");
  });

  it("rejects two rules with the same priority and a priority below one", () => {
    const repeated = specIssuesAfter((spec) => {
      spec.followUpRules[0].priority = 1;
      spec.followUpRules[1].priority = 1;
    });
    expect(repeated.join()).toContain("Rule priority repeats: 1");
    const none = schemaMessagesAfter((spec) => {
      spec.followUpRules[0].priority = 0;
    });
    expect(none.length).toBeGreaterThan(0);
  });

  it("rejects a rule that points at an unknown option", () => {
    const messages = specIssuesAfter((spec) => {
      const rule = spec.followUpRules.find((candidate) => candidate.trigger.kind === "field_changed");
      if (rule?.trigger.kind === "field_changed") rule.trigger.to = "nowhere";
    });
    expect(messages.join()).toContain("Unknown option nowhere");
  });

  it("rejects a task kind the tasks list does not have", () => {
    const messages = specIssuesAfter((spec) => {
      const rule = spec.followUpRules.find((candidate) => candidate.action.kind === "create_task");
      if (rule?.action.kind === "create_task") rule.action.taskKind = "teleport";
    });
    expect(messages.join()).toContain("Unknown task kind: teleport");
  });

  it("rejects a rule that creates tasks on a tasks list without a due date", () => {
    const messages = specIssuesAfter((spec) => {
      spec.fields = spec.fields.filter((field) => field.key !== "actions.due");
    });
    expect(messages.join()).toContain("create_task needs a date field due on the tasks list");
  });

  it("rejects a due field that is not a date", () => {
    const messages = specIssuesAfter((spec) => {
      const due = spec.fields.find((field) => field.key === "actions.due");
      if (due) due.type = "text";
    });
    expect(messages.join()).toContain("create_task needs a date field due on the tasks list");
  });

  it("rejects a field that the product adds by itself", () => {
    const messages = specIssuesAfter((spec) => {
      spec.fields.push({ key: "contacts.channels", type: "text", required: false, multiple: false, options: [] });
      spec.fields.push({ key: "clients.name", type: "text", required: false, multiple: false, options: [] });
    });
    expect(messages.filter((message) => message.includes("added automatically"))).toHaveLength(2);
  });

  it("rejects duplicate keys, also after conversion to camelCase", () => {
    const messages = specIssuesAfter((spec) => {
      spec.widgets.push({ ...spec.widgets[2], key: "clients_by_status" });
      spec.relationships.push({ ...spec.relationships[0] });
    });
    expect(messages.join()).toContain("Widget key repeats");
    expect(messages.join()).toContain("Relationship key repeats");
  });

  it("rejects select fields without options and options on other fields", () => {
    const messages = specIssuesAfter((spec) => {
      spec.fields.push({ key: "clients.tier", type: "select", required: false, multiple: false, options: [] });
      spec.fields.push({
        key: "clients.note",
        type: "text",
        required: false,
        multiple: false,
        options: [{ key: "x" }],
      });
    });
    expect(messages.filter((message) => message === "Only select fields have options.")).toHaveLength(2);
  });

  it("rejects a stage list that is only partly weighted or has no open stage", () => {
    const partly = specIssuesAfter((spec) => {
      const stage = spec.stages[0];
      if (stage) stage.items[0] = { key: stage.items[0]?.key ?? "x", weight: 5 };
    });
    expect(partly.join()).toContain("both an outcome and a weight");
    const noOpen = specIssuesAfter((spec) => {
      const stage = spec.stages[0];
      if (stage) stage.items = stage.items.map((item) => ({ ...item, outcome: "won" as const, weight: 100 }));
    }, "sales-pipeline");
    expect(noOpen.join()).toContain("needs an open stage");
  });

  it("rejects a board without a select grouping and two default views of one list", () => {
    const messages = specIssuesAfter((spec) => {
      spec.views.push({
        key: "extra_default",
        list: "clients",
        default: true,
        layout: "board",
        groupBy: "clients.next_step",
        sort: null,
        columns: [],
        summaries: [],
        filters: [],
      });
    });
    expect(messages.join()).toContain("A board needs a select field to group by.");
    expect(messages.join()).toContain("has 2 default views");
  });

  it("rejects views and widgets that use fields of another list", () => {
    const messages = specIssuesAfter((spec) => {
      const view = spec.views.find((candidate) => candidate.key === "contacts_all");
      if (view) view.columns.push("clients.status");
    });
    expect(messages.join()).toContain("The field is not in the list contacts");
  });

  it("rejects filters on the wrong kind of field", () => {
    const messages = specIssuesAfter((spec) => {
      const view = spec.views.find((candidate) => candidate.key === "needs_next_step");
      if (view) view.filters = [{ operator: "inLastDays", field: "clients.owner", days: 7 }];
    });
    expect(messages.join()).toContain("is not a date field");
  });

  it("rejects calculations with unknown fields, relationships or non-select weights", () => {
    const messages = specIssuesAfter((spec) => {
      spec.calculations.push(
        { key: "opportunities.bad_a", type: "number", expression: { op: "field", field: "opportunities.missing" } },
        {
          key: "opportunities.bad_b",
          type: "number",
          expression: { op: "optionWeight", field: "opportunities.next_step" },
        },
        {
          key: "opportunities.bad_c",
          type: "number",
          expression: {
            op: "related",
            relationship: "nothing",
            direction: "outgoing",
            field: "accounts.size",
            reducer: "count",
          },
        },
      );
    }, "sales-pipeline");
    expect(messages.join()).toContain("Unknown field in the calculation: opportunities.missing");
    expect(messages.join()).toContain("optionWeight needs a select field");
    expect(messages.join()).toContain("Unknown relationship: nothing");
  });

  it("requires exactly one people list and one tasks list", () => {
    const messages = specIssuesAfter((spec) => {
      spec.lists = spec.lists.filter((list) => list.role !== "people");
    });
    expect(messages.join()).toContain("Mark exactly one list as people.");
  });

  it("keeps lists, fields, widgets and rule counts inside the plan limits", () => {
    const messages = specIssuesAfter((spec) => {
      for (let index = 0; index < 13; index += 1)
        spec.widgets.push({ kind: "activity", key: `extra_activity_${index}` });
    });
    expect(messages).toContain("Too many widgets.");
  });

  it("rejects keys that are too long once converted to camelCase", () => {
    const messages = schemaMessagesAfter((spec) => {
      spec.followUpRules[0] = { ...spec.followUpRules[0], key: "this_rule_key_is_far_too_long_indeed" } as never;
    });
    expect(messages.join()).toContain("at most 24 characters");
  });

  it("rejects an id that does not follow the slug and locales that disagree", () => {
    const messages = specIssuesAfter((spec) => {
      spec.id = "tpl_other";
      spec.publicPage = { en: "own" };
    });
    expect(messages.join()).toContain("The id must be tpl_ plus the slug");
    expect(messages.join()).toContain("status and publicPage need the same locales.");
  });

  it("rejects acceptance checks that point nowhere", () => {
    const messages = specIssuesAfter((spec) => {
      spec.acceptanceChecks.push({ key: "ghost", kind: "view_exists", ref: "no_such_view" });
    });
    expect(messages.join()).toContain("points to an unknown target");
  });
});

describe("template text validation", () => {
  it.each(TEMPLATE_SLUGS)("finds no problem in the shipped text of %s", (slug) => {
    for (const locale of Object.keys(cloneSpec(slug).status))
      expect(templateTextIssues(cloneSpec(slug), cloneText(slug, locale), locale)).toEqual([]);
  });

  it("reports missing and surplus keys", () => {
    const text = cloneText();
    delete text.widgets.overdue_actions;
    text.views.ghost = { name: "Ghost" };
    const issues = templateTextIssues(cloneSpec(), text, "en");
    expect(issues).toContain("widgets.overdue_actions is missing");
    expect(issues).toContain("views.ghost is not in the spec");
  });

  it("reports an option label that is missing", () => {
    const text = cloneText();
    const field = text.fields["clients.status"];
    if (field) delete field.options.closed;
    expect(templateTextIssues(cloneSpec(), text, "en")).toContain("fields.clients.status.options.closed is missing");
  });

  it("reports dash characters and a locale that does not match the file", () => {
    const text = cloneText();
    text.summary = `One row ${String.fromCharCode(0x2014)} one owner`;
    const issues = templateTextIssues(cloneSpec(), text, "de");
    expect(issues.join()).toContain("contains a dash character");
    expect(issues.join()).toContain("locale is en but the file is de");
  });
});
