import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";

import { APP_LOCALES } from "@/i18n/locale-registry";

import en from "@/i18n/locales/en.json";
import de from "@/i18n/locales/de.json";
import es from "@/i18n/locales/es.json";
import fr from "@/i18n/locales/fr.json";
import itLocale from "@/i18n/locales/it.json";

import { AgentActivityDescriptorSchema, agentActivityCopy, describeAgentTool } from "../agent-activity";
import { agentActionPageFromPathname, agentPageActions, agentPageState } from "../agent-page-actions";
import { agentGuidedTour } from "../agent-tours";
import {
  agentWorkspaceSetupCounts,
  buildAgentWorkspaceSetupPlan,
  hashAgentWorkspaceSetupPlan,
  PrepareAgentWorkspaceSetupSchema,
} from "../agent-workspace-setup";
import { AGENT_UI_TARGET_IDS } from "../ui-targets";
import { AgentVisibleTextStreamSanitizer, sanitizeAgentVisibleText } from "../agent-output-safety";

const AGENT_CATALOGS = { de, en, es, fr, it: itLocale } as const;
const translatorFor = (locale: keyof typeof AGENT_CATALOGS) => {
  const translate = createTranslator({ locale, messages: AGENT_CATALOGS[locale] });
  return (key: string, values?: Record<string, string | number>) =>
    (translate as unknown as (key: string, values?: Record<string, string | number>) => string)(key, values);
};
const enT = translatorFor("en");
const deT = translatorFor("de");

const EMPTY_COUNTS = {
  contacts: false,
  organizations: false,
  deals: false,
  services: false,
  tasks: false,
  connectedAccounts: false,
};

describe("agent experience contract", () => {
  it("selects exactly three deterministic actions from page data state", () => {
    expect(agentPageState("contacts", EMPTY_COUNTS)).toBe("empty");
    expect(agentPageActions("contacts", "empty", enT, "en")).toHaveLength(3);
    expect(agentPageActions("contacts", "empty", enT, "en")).toEqual(agentPageActions("contacts", "empty", enT, "en"));

    const populated = { ...EMPTY_COUNTS, contacts: true };
    expect(agentPageState("contacts", populated)).toBe("data");
    expect(agentPageActions("contacts", "data", enT, "en").map((action) => action.id)).not.toEqual(
      agentPageActions("contacts", "empty", enT, "en").map((action) => action.id),
    );

    for (const page of ["dashboard", "tasks", "contacts", "organizations", "deals", "services"] as const) {
      for (const state of ["empty", "data"] as const) {
        expect(agentPageActions(page, state, enT, "en")).toHaveLength(3);
        expect(agentPageActions(page, state, deT, "de")).toHaveLength(3);
        expect(new Set(agentPageActions(page, state, enT, "en").map((action) => action.id)).size).toBe(3);
      }
    }
  });

  it("substitutes exactly three permission-safe actions and resolves the current page path", () => {
    const actions = agentPageActions("contacts", "empty", enT, "en", {
      canCreate: false,
    });

    expect(actions).toHaveLength(3);
    expect(actions.every((action) => /Do not make any changes|without changing any data/.test(action.prompt))).toBe(
      true,
    );
    expect(agentActionPageFromPathname("/en/contacts")).toBe("contacts");
    expect(agentActionPageFromPathname("/de/deals/record-1?tab=notes")).toBe("deals");
    expect(agentActionPageFromPathname("/en/company/audit-logs")).toBeNull();
  });

  it("hides broad setup actions without broad setup access and applies workspace terminology", () => {
    const actions = agentPageActions("contacts", "empty", enT, "en", {
      canCreate: true,
      canSetupWorkspace: false,
      terminology: {
        contacts: { singular: "Client", plural: "Clients" },
        organizations: { singular: "Account", plural: "Accounts" },
        deals: { singular: "Project", plural: "Projects" },
        services: { singular: "Product", plural: "Products" },
        tasks: { singular: "Follow-up", plural: "Follow-ups" },
      },
    });

    expect(actions.map((action) => action.id)).toEqual([
      "first-contact",
      "contacts-tour",
      "contacts-explain-read-only",
    ]);
    expect(actions[0]?.label).toBe("Create my first client");
    expect(actions[1]?.prompt).toContain("clients");
    expect(actions.flatMap((action) => [action.label, action.prompt]).join(" ")).not.toMatch(/\bcontacts?\b/i);
  });

  it("applies custom terminology in one pass without rewriting replacement text", () => {
    const english = agentPageActions("contacts", "data", enT, "en", {
      terminology: {
        contacts: { singular: "Customer contact", plural: "Customer contacts" },
      },
    });
    const german = agentPageActions("contacts", "data", deT, "de", {
      terminology: {
        contacts: { singular: "Kunden-Kontakt", plural: "Kunden-Kontakte" },
      },
    });

    expect(JSON.stringify(english)).toContain("customer contacts");
    expect(JSON.stringify(english).toLowerCase()).not.toContain("customer customer");
    expect(JSON.stringify(german)).toContain("Kunden-Kontakte");
    expect(JSON.stringify(german)).not.toContain("Kunden-Kunden");
  });

  it("describes work without retaining tool payloads or identifiers", () => {
    const input = {
      entityType: "contact",
      id: "00000000-0000-4000-8000-000000000001",
      apiKey: "secret",
    };
    const activity = describeAgentTool("update_contacts", input);

    expect(activity).toEqual({
      kind: "records.update",
      resource: "contacts",
      risk: "write",
      affectedResources: ["contacts"],
    });
    expect(JSON.stringify(activity)).not.toContain(input.id);
    expect(JSON.stringify(activity)).not.toContain(input.apiKey);
    expect(agentActivityCopy(activity, deT).running).toContain("Kontakte");
  });

  it("uses the workspace's custom entity terminology in safe activity copy", () => {
    const activity = describeAgentTool("create_contacts", [{ firstName: "Ada" }, { firstName: "Grace" }]);
    const copy = agentActivityCopy(activity, deT, {
      contacts: "Kundinnen und Kunden",
    });

    expect(copy.running).toBe("2 Kundinnen und Kunden werden erstellt");
    expect(copy.done).toBe("2 Kundinnen und Kunden wurden erstellt");
    expect(JSON.stringify(copy)).not.toContain("Ada");
    expect(JSON.stringify(copy)).not.toContain("Grace");
  });

  it("shows safe create and update counts without retaining record details", () => {
    const created = describeAgentTool("create_contacts", {
      contacts: [
        {
          firstName: "Ada",
          internalId: "00000000-0000-4000-8000-000000000001",
        },
        { firstName: "Grace", apiKey: "never-show" },
      ],
    });
    const updated = describeAgentTool("update_deals", {
      deals: [{ id: "00000000-0000-4000-8000-000000000002", name: "Private project" }],
    });

    expect(created).toMatchObject({
      kind: "records.create",
      resource: "contacts",
      count: 2,
    });
    expect(updated).toMatchObject({
      kind: "records.update",
      resource: "deals",
      count: 1,
    });
    expect(agentActivityCopy(created, enT).running).toBe("Creating 2 contacts");
    expect(agentActivityCopy(created, deT).done).toBe("2 Kontakte wurden erstellt");
    expect(agentActivityCopy(updated, enT).done).toBe("Updated 1 deal");
    expect(agentActivityCopy(updated, deT).running).toBe("1 Deal wird aktualisiert");
    expect(JSON.stringify([created, updated])).not.toMatch(/Ada|Grace|Private project|never-show|00000000/);
  });

  it("retains only allowlisted semantic UI target keys and localizes their readable names", () => {
    const navigate = describeAgentTool("navigate", {
      targetId: "nav-contacts",
      recordId: "00000000-0000-4000-8000-000000000001",
    });
    const highlight = describeAgentTool("highlight_element", {
      targetId: "contacts-add",
      selector: "#private-record-00000000-0000-4000-8000-000000000002",
    });
    const rejected = describeAgentTool("highlight_element", {
      targetId: "00000000-0000-4000-8000-000000000003",
    });

    expect(navigate).toEqual({
      kind: "interface.navigate",
      affectedResources: [],
      risk: "read",
      targetKey: "nav-contacts",
    });
    expect(highlight).toMatchObject({ targetKey: "contacts-add" });
    expect(rejected).not.toHaveProperty("targetKey");
    expect(agentActivityCopy(navigate, enT).detail).toBe("Contacts");
    expect(agentActivityCopy(navigate, deT).detail).toBe("Kontakte");
    expect(agentActivityCopy(highlight, enT).detail).toBe("Add contact");
    expect(agentActivityCopy(highlight, deT).detail).toBe("Kontakt hinzufügen");
    expect(JSON.stringify([navigate, highlight, rejected])).not.toContain("00000000");

    const forged = AgentActivityDescriptorSchema.parse({
      ...navigate,
      targetKey: "00000000-0000-4000-8000-000000000004",
    });
    expect(forged.targetKey).toBeUndefined();
    expect(JSON.stringify(forged)).not.toContain("00000000");

    for (const targetKey of AGENT_UI_TARGET_IDS) {
      const activity = describeAgentTool("highlight_element", {
        targetId: targetKey,
      });
      const english = agentActivityCopy(activity, enT).detail;
      const german = agentActivityCopy(activity, deT).detail;
      expect(english).toBeTruthy();
      expect(german).toBeTruthy();
      expect(english).not.toBe("Selected interface control");
      expect(german).not.toBe("Ausgewähltes Bedienelement");
      expect(`${english}${german}`).not.toContain(targetKey);
    }
  });

  it.each(["manage_custom_columns", "manage_widgets"])(
    "keeps multiplexed delete-capable tool %s sensitive for every action",
    (toolName) => {
      expect(describeAgentTool(toolName, { action: "list" }).risk).toBe("sensitive");
      expect(describeAgentTool(toolName, { action: "delete" }).risk).toBe("sensitive");
      expect(describeAgentTool(toolName, undefined).risk).toBe("sensitive");
    },
  );

  it.each([
    "manage_custom_columns",
    "manage_record_links",
    "manage_team",
    "manage_webhooks",
    "manage_widgets",
    "update_record_notes",
  ])("never persistently authorizes multiplexed sensitive tool %s", (toolName) => {
    expect(describeAgentTool(toolName, undefined).risk).toBe("sensitive");
  });

  it.each([undefined, { mode: "append", notes: "Follow up next week" }, { mode: "replace", notes: "" }])(
    "keeps every notes mutation sensitive for input %j",
    (input) => {
      expect(describeAgentTool("update_record_notes", input).risk).toBe("sensitive");
    },
  );

  it("shows distinct, bounded consequences for real sends, drafts, discards, and support", () => {
    const internalId = "00000000-0000-4000-8000-000000000001";
    const email = describeAgentTool("send_email", {
      threadId: internalId,
      to: [{ identifier: "ada@example.com", display_name: "Ada" }],
      subject: "Quarterly update",
      body: "Here is the agreed summary.",
      apiKey: "never-show",
    });
    const draft = describeAgentTool("save_message_draft", {
      threadId: internalId,
      subject: "Draft subject",
      body: "Please review this draft.",
    });
    const discard = describeAgentTool("discard_message_draft", {
      messageId: internalId,
    });
    const support = describeAgentTool("request_support", {
      subject: "Import issue",
      body: `The record ${internalId} failed.`,
    });

    expect(email.kind).toBe("messages.send");
    expect(draft.kind).toBe("messages.draft");
    expect(discard.kind).toBe("messages.discard");
    expect(agentActivityCopy(email, enT).detail).toContain("Ada");
    expect(agentActivityCopy(draft, enT).running).not.toBe(agentActivityCopy(email, enT).running);
    expect(agentActivityCopy(discard, enT).running).not.toBe(agentActivityCopy(draft, enT).running);
    expect(agentActivityCopy(support, enT).detail).toContain("Import issue");
    expect(JSON.stringify([email, draft, discard, support])).not.toContain(internalId);
    expect(JSON.stringify(email)).not.toContain("never-show");
  });

  it("redacts split internal markup and identifiers before any model text becomes visible", () => {
    const sanitizer = new AgentVisibleTextStreamSanitizer();
    const visible = [
      sanitizer.push("I checked <page_con"),
      sanitizer.push('text route="/en/contacts"/>00000000-0000-4000-8000-000000000001 and found it.'),
      sanitizer.finish(),
    ].join("");

    expect(visible).toBe("I checked [internal reference] and found it.");
    expect(sanitizeAgentVisibleText(visible)).toBe(visible);
  });

  it("redacts internal output at every stream split and drops incomplete secret tails", () => {
    const internalId = "00000000-0000-4000-8000-000000000001";
    const source = `Before <page_context route="/en/contacts"/>${internalId} after`;
    for (let split = 0; split <= source.length; split += 1) {
      const sanitizer = new AgentVisibleTextStreamSanitizer();
      const visible = `${sanitizer.push(source.slice(0, split))}${sanitizer.push(source.slice(split))}${sanitizer.finish()}`;
      expect(visible).toBe("Before [internal reference] after");
    }

    expect(sanitizeAgentVisibleText('Safe <page_context route="/en/cont')).toBe("Safe ");
    expect(sanitizeAgentVisibleText("Safe 00000000-0000-4")).toBe("Safe [internal reference]");

    const pageTail = new AgentVisibleTextStreamSanitizer();
    expect(`${pageTail.push('Safe <page_context route="/en')}${pageTail.finish()}`).toBe("Safe ");
    const idTail = new AgentVisibleTextStreamSanitizer();
    expect(`${idTail.push("Safe 00000000-0000-4")}${idTail.finish()}`).toBe("Safe [internal reference]");
  });

  it("builds a minimal linked setup plan with no default select values", () => {
    const plan = buildAgentWorkspaceSetupPlan({
      useCase: "b2bSales",
      businessName: "Example GmbH",
      goal: "Build a small, useful pipeline",
    });

    expect(agentWorkspaceSetupCounts(plan)).toEqual({
      columns: 4,
      records: 13,
      widgets: 3,
    });
    expect(plan.records.deals.every((deal) => deal.contactIndexes.length > 0)).toBe(true);
    expect(plan.columns.filter((column) => column.type === "singleSelect")).toHaveLength(3);
    expect(JSON.stringify(plan.columns)).not.toContain("isDefault");
  });

  it("localizes deterministic setup content end to end for German workspaces", () => {
    const plan = buildAgentWorkspaceSetupPlan(
      {
        useCase: "b2bSales",
        businessName: "Beispiel GmbH",
        goal: "Eine kleine Vertriebspipeline einrichten",
      },
      deT,
    );

    expect(plan.columns).toContainEqual(
      expect.objectContaining({
        label: "Phase",
        options: ["Neu", "Qualifiziert", "Angebot", "Gewonnen"],
      }),
    );
    expect(plan.records.services.map((service) => service.name)).toContain("Discovery-Workshop");
    expect(plan.records.tasks.map((task) => task.name)).toContain("Discovery-Ziele abstimmen");
    expect(plan.widgets.map((widget) => widget.name)).toEqual([
      "Pipeline-Wert nach Phase",
      "Deals nach Phase",
      "Aufgaben nach Status",
    ]);
    expect(JSON.stringify(plan)).not.toContain("Pipeline value by stage");
    expect(JSON.stringify(plan)).not.toContain("Confirm discovery goals");
  });

  it("does not rewrite reviewed custom content that happens to match translation keys", () => {
    const reviewed = PrepareAgentWorkspaceSetupSchema.parse({
      useCase: "custom",
      businessName: "Stage",
      goal: "Won",
      customFields: [
        {
          entityType: "deal",
          label: "Stage",
          type: "singleSelect",
          options: ["New", "Won"],
        },
      ],
    });

    const plan = buildAgentWorkspaceSetupPlan(reviewed, deT);

    expect(plan.businessName).toBe("Stage");
    expect(plan.goal).toBe("Won");
    expect(plan.columns.at(-1)).toEqual({
      semanticKey: "custom-field-1",
      entityType: "deal",
      label: "Stage",
      type: "singleSelect",
      options: ["New", "Won"],
    });
  });

  it("sanitizes every model-provided setup label before review", () => {
    const internalId = "00000000-0000-4000-8000-000000000001";
    const parsed = PrepareAgentWorkspaceSetupSchema.parse({
      useCase: "custom",
      businessName: `<page_context route="/en/company"/>Acme ${internalId}`,
      goal: `Organize ${internalId} without exposing internals`,
      customFields: [
        {
          entityType: "deal",
          label: `<page_context route="/en/deals"/>Health ${internalId}`,
          type: "singleSelect",
          options: ["On track", `Blocked ${internalId}`],
        },
      ],
    });

    expect(parsed.businessName).toBe("Acme [internal reference]");
    expect(parsed.goal).toBe("Organize [internal reference] without exposing internals");
    expect(parsed.customFields?.[0]).toEqual({
      entityType: "deal",
      label: "Health [internal reference]",
      type: "singleSelect",
      options: ["On track", "Blocked [internal reference]"],
    });
    expect(() =>
      PrepareAgentWorkspaceSetupSchema.parse({
        useCase: "custom",
        businessName: '<page_context route="/en/company"/>',
        goal: null,
      }),
    ).toThrow();
  });

  it("honors reviewed terminology and custom fields in a stable hashed revision", async () => {
    const input = {
      useCase: "clientProjects" as const,
      businessName: "Example Studio",
      goal: "Track delivery health",
      terminology: {
        contact: "client" as const,
        organization: "account" as const,
        deal: "project" as const,
        service: "offering" as const,
      },
      customFields: [
        {
          entityType: "deal" as const,
          label: "Delivery health",
          type: "singleSelect" as const,
          options: ["On track", "At risk", "Blocked"],
        },
      ],
    };
    const first = buildAgentWorkspaceSetupPlan(input);
    const second = buildAgentWorkspaceSetupPlan(input);

    expect(first).toEqual(second);
    expect(first.revision).toBe(1);
    expect(first.terminology.deal).toBe("project");
    expect(first.columns).toContainEqual(
      expect.objectContaining({
        label: "Delivery health",
        options: ["On track", "At risk", "Blocked"],
      }),
    );
    expect(first.records.tasks.map((task) => task.dueInDays)).toEqual([3, 6, 9]);
    await expect(hashAgentWorkspaceSetupPlan(first)).resolves.toBe(await hashAgentWorkspaceSetupPlan(second));
  });

  it("keeps every deterministic tour target inside the client allowlist", () => {
    const allowlist = new Set<string>(AGENT_UI_TARGET_IDS);

    for (const locale of APP_LOCALES) {
      const tour = agentGuidedTour("platform", translatorFor(locale));
      expect(tour.length).toBeGreaterThan(8);
      expect(tour.every((step) => allowlist.has(step.targetId))).toBe(true);
      expect(tour.every((step) => step.note.length > 20)).toBe(true);
    }
  });
});
