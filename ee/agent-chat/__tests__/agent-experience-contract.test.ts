import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";

import en from "@/i18n/locales/en.json";
import de from "@/i18n/locales/de.json";
import es from "@/i18n/locales/es.json";
import fr from "@/i18n/locales/fr.json";
import itLocale from "@/i18n/locales/it.json";

import {
  AgentActivityDescriptorSchema,
  agentActivityCopy,
  agentActivityGroupSummary,
  describeAgentTool,
} from "../agent-activity";
import { internalToolIdentity } from "../tool-identity";

const describeInternalTool = (name: string, input: unknown) => describeAgentTool(internalToolIdentity(name), input);
import { agentActionPageFromPathname, agentPageActions, agentPageState } from "../agent-page-actions";
import { agentGuidedTour, AgentTourSchema, AGENT_TOUR_MAX_STEPS } from "../agent-tours";
import { AGENT_UI_TARGET_IDS } from "../ui-targets";
import { AgentVisibleTextStreamSanitizer, sanitizeAgentVisibleText } from "../agent-output-safety";

const AGENT_CATALOGS = { de, en, es, fr, it: itLocale } as const;
const translatorFor = (locale: keyof typeof AGENT_CATALOGS) => {
  const translate = createTranslator({
    locale,
    messages: AGENT_CATALOGS[locale],
  });
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
  widgets: false,
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
    const activity = describeInternalTool("update_contacts", input);

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
    const activity = describeInternalTool("create_contacts", [{ firstName: "Ada" }, { firstName: "Grace" }]);
    const copy = agentActivityCopy(activity, deT, {
      contacts: "Kundinnen und Kunden",
    });

    expect(copy.running).toBe("2 Kundinnen und Kunden werden erstellt");
    expect(copy.done).toBe("2 Kundinnen und Kunden wurden erstellt");
    expect(JSON.stringify(copy)).not.toContain("Ada");
    expect(JSON.stringify(copy)).not.toContain("Grace");
  });

  it("shows safe create and update counts without retaining record details", () => {
    const created = describeInternalTool("create_contacts", {
      contacts: [
        {
          firstName: "Ada",
          internalId: "00000000-0000-4000-8000-000000000001",
        },
        { firstName: "Grace", apiKey: "never-show" },
      ],
    });
    const updated = describeInternalTool("update_deals", {
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

  it("keeps no input-derived data on a navigate or highlight activity", () => {
    const navigate = describeInternalTool("navigate", {
      targetId: "nav-contacts",
      recordId: "00000000-0000-4000-8000-000000000001",
    });
    const highlight = describeInternalTool("highlight_element", {
      targetId: "contacts-add",
      selector: "#private-record-00000000-0000-4000-8000-000000000002",
    });

    for (const activity of [navigate, highlight]) {
      expect(activity).toEqual({
        kind: "interface.navigate",
        affectedResources: [],
        risk: "read",
      });
      expect(JSON.stringify(activity)).not.toContain("00000000");
      expect(JSON.stringify(activity)).not.toContain("private-record");
    }

    for (const targetId of AGENT_UI_TARGET_IDS) {
      const activity = describeInternalTool("highlight_element", { targetId });
      expect(JSON.stringify(activity)).not.toContain(targetId);
      expect(agentActivityCopy(activity, enT).running).toBeTruthy();
      expect(agentActivityCopy(activity, deT).running).toBeTruthy();
    }
  });

  it("classifies an allowlisted DOM activation without retaining its target", () => {
    const activity = describeInternalTool("click_ui_target", {
      targetId: "deals-layout-kanban",
      selector: "#private-record-00000000-0000-4000-8000-000000000002",
    });

    expect(activity).toEqual({
      kind: "interface.interact",
      affectedResources: [],
      risk: "read",
    });
    expect(JSON.stringify(activity)).not.toContain("deals-layout-kanban");
    expect(JSON.stringify(activity)).not.toContain("private-record");
    expect(agentActivityCopy(activity, enT).done).toBe("Activated the control");
    expect(agentActivityCopy(activity, deT).done).toBe("Steuerelement aktiviert");
  });

  it("gives workspace, documentation, and interface reads distinct localized activity names", () => {
    const tools = [
      ["get_workspace_context", "workspace.inspect"],
      ["search_docs", "docs.search"],
      ["get_docs_page", "docs.read"],
      ["list_ui_targets", "interface.inspect"],
    ] as const;
    const activities = tools.map(([toolName, kind]) => {
      const activity = describeInternalTool(toolName, {
        query: "private-workspace-value",
        page: "private-page-slug",
      });
      expect(activity).toEqual({ kind, affectedResources: [], risk: "read" });
      expect(JSON.stringify(activity)).not.toContain("private");
      return activity;
    });
    const expectedDoneLabels = {
      de: [
        "Workspace-Details wurden geprüft",
        "Dokumentation wurde durchsucht",
        "Passende Anleitung wurde gelesen",
        "Verfügbare Steuerelemente wurden geprüft",
      ],
      en: [
        "Checked workspace details",
        "Searched the documentation",
        "Read the relevant guide",
        "Checked available controls",
      ],
      es: [
        "Detalles del espacio de trabajo revisados",
        "Documentación consultada",
        "Guía correspondiente consultada",
        "Controles disponibles revisados",
      ],
      fr: [
        "Informations de l’espace de travail vérifiées",
        "Documentation consultée",
        "Guide correspondant consulté",
        "Éléments d’interface disponibles vérifiés",
      ],
      it: [
        "Dettagli dell’area di lavoro controllati",
        "Documentazione consultata",
        "Guida pertinente consultata",
        "Comandi disponibili controllati",
      ],
    } as const;

    for (const locale of Object.keys(AGENT_CATALOGS) as Array<keyof typeof AGENT_CATALOGS>) {
      const labels = activities.map((activity) => agentActivityCopy(activity, translatorFor(locale)).done);
      expect(labels).toEqual(expectedDoneLabels[locale]);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });

  it("gives custom fields, widgets, terminology, settings, and profiles distinct privacy-safe activity names", () => {
    const privateId = "00000000-0000-4000-8000-000000000001";
    const tools = [
      ["manage_custom_columns", { action: "list", entityType: "contact", id: privateId }, "customFields.read"],
      [
        "manage_custom_columns",
        {
          action: "upsert",
          intent: "create",
          entityType: "contact",
          label: "Private field",
          apiKey: "secret",
        },
        "customFields.create",
      ],
      [
        "manage_custom_columns",
        { action: "upsert", intent: "update", id: privateId, label: "Private field" },
        "customFields.update",
      ],
      ["manage_custom_columns", { action: "delete", id: privateId }, "customFields.delete"],
      ["manage_widgets", { action: "get", ids: [privateId] }, "widgets.read"],
      ["manage_widgets", { action: "create", name: "Private widget" }, "widgets.create"],
      ["manage_widgets", { action: "update", id: privateId, name: "Private widget" }, "widgets.update"],
      ["manage_widgets", { action: "delete", id: privateId }, "widgets.delete"],
      [
        "update_workspace_settings",
        {
          target: "company",
          terminology: [{ entityType: "contact", singular: "Private person" }],
        },
        "workspace.terminology",
      ],
      ["update_workspace_settings", { target: "company", currency: "EUR" }, "workspace.settings"],
      ["update_workspace_settings", { target: "profile", firstName: "Private name" }, "profile.configure"],
    ] as const;
    const activities = tools.map(([toolName, input, kind]) => {
      const activity = describeInternalTool(toolName, input);
      expect(activity.kind).toBe(kind);
      expect(AgentActivityDescriptorSchema.parse(JSON.parse(JSON.stringify(activity)))).toEqual(activity);
      return activity;
    });
    const expectedDoneLabels = {
      de: [
        "Benutzerdefinierte Felder wurden geprüft",
        "Benutzerdefiniertes Feld wurde erstellt",
        "Benutzerdefiniertes Feld wurde aktualisiert",
        "Benutzerdefiniertes Feld wurde entfernt",
        "Dashboard-Widgets wurden geprüft",
        "Dashboard-Widget wurde erstellt",
        "Dashboard-Widget wurde aktualisiert",
        "Dashboard-Widget wurde entfernt",
        "Workspace-Bezeichnungen wurden aktualisiert",
        "Workspace-Einstellungen wurden aktualisiert",
        "Profil wurde aktualisiert",
      ],
      en: [
        "Reviewed custom fields",
        "Created a custom field",
        "Updated a custom field",
        "Removed a custom field",
        "Reviewed dashboard widgets",
        "Created a dashboard widget",
        "Updated a dashboard widget",
        "Removed a dashboard widget",
        "Updated workspace terminology",
        "Updated workspace settings",
        "Updated your profile",
      ],
      es: [
        "Campos personalizados revisados",
        "Campo personalizado creado",
        "Campo personalizado actualizado",
        "Campo personalizado eliminado",
        "Widgets del panel revisados",
        "Widget del panel creado",
        "Widget del panel actualizado",
        "Widget del panel eliminado",
        "Terminología del espacio de trabajo actualizada",
        "Configuración del espacio de trabajo actualizada",
        "Perfil actualizado",
      ],
      fr: [
        "Champs personnalisés vérifiés",
        "Champ personnalisé créé",
        "Champ personnalisé mis à jour",
        "Champ personnalisé supprimé",
        "Widgets du tableau de bord vérifiés",
        "Widget du tableau de bord créé",
        "Widget du tableau de bord mis à jour",
        "Widget du tableau de bord supprimé",
        "Terminologie de l’espace de travail mise à jour",
        "Paramètres de l’espace de travail mis à jour",
        "Profil mis à jour",
      ],
      it: [
        "Campi personalizzati controllati",
        "Campo personalizzato creato",
        "Campo personalizzato aggiornato",
        "Campo personalizzato rimosso",
        "Widget della dashboard controllati",
        "Widget della dashboard creato",
        "Widget della dashboard aggiornato",
        "Widget della dashboard rimosso",
        "Terminologia dell’area di lavoro aggiornata",
        "Impostazioni dell’area di lavoro aggiornate",
        "Profilo aggiornato",
      ],
    } as const;

    for (const locale of Object.keys(expectedDoneLabels) as Array<keyof typeof expectedDoneLabels>) {
      const labels = activities.map((activity) => agentActivityCopy(activity, translatorFor(locale)).done);
      expect(labels).toEqual(expectedDoneLabels[locale]);
      expect(new Set(labels).size).toBe(labels.length);
    }
    expect(JSON.stringify(activities)).not.toMatch(/00000000|Private|secret/);
    const ambiguousLegacyActivity = describeInternalTool("manage_custom_columns", {
      action: "upsert",
      intent: "invalid",
      id: privateId,
    });
    expect(ambiguousLegacyActivity.kind).toBe("customFields.configure");
    expect(agentActivityCopy(ambiguousLegacyActivity, enT).done).toBe("Configured custom fields");
    expect(JSON.stringify(ambiguousLegacyActivity)).not.toContain(privateId);
    const ambiguousWidgetActivity = describeInternalTool("manage_widgets", { action: "legacy" });
    expect(ambiguousWidgetActivity.kind).toBe("widgets.configure");
    expect(agentActivityCopy(ambiguousWidgetActivity, enT).done).toBe("Configured dashboard widgets");
    expect(
      AgentActivityDescriptorSchema.parse({
        kind: "widgets.configure",
        resource: "widgets",
        affectedResources: ["widgets"],
        risk: "write",
      }),
    ).toMatchObject({ kind: "widgets.configure" });
    expect(
      AgentActivityDescriptorSchema.parse({
        kind: "workspace.configure",
        affectedResources: [],
        risk: "write",
      }),
    ).toEqual({
      kind: "workspace.configure",
      affectedResources: [],
      risk: "write",
    });
  });

  it("summarizes mixed activity groups with the truthful localized result counts", () => {
    const statuses = ["done", "done", "done", "done", "done", "done", "error"] as const;
    const expected = {
      de: "6 Arbeitsschritte abgeschlossen · 1 Arbeitsschritt benötigt Aufmerksamkeit",
      en: "6 steps completed · 1 step needs attention",
      es: "6 pasos completados · 1 paso requiere atención",
      fr: "6 étapes terminées · 1 étape nécessite votre attention",
      it: "6 passaggi completati · 1 passaggio richiede attenzione",
    } as const;

    for (const locale of Object.keys(expected) as Array<keyof typeof expected>)
      expect(agentActivityGroupSummary(statuses, translatorFor(locale))).toBe(expected[locale]);
    expect(agentActivityGroupSummary(["done", "error", "cancelled"], enT)).toBe(
      "1 step completed · 1 step needs attention · 1 step stopped",
    );
  });

  it("localizes external social approvals without exposing provider identifiers", () => {
    const activities = [
      describeInternalTool("manage_social_relations", {
        action: "invite",
        identifier: "provider-user-123",
        targetLabel: "Ada Lovelace",
        message: "Let's connect.",
      }),
      describeInternalTool("manage_social_relations", {
        action: "accept",
        invitationId: "provider-invitation-456",
        targetLabel: "Grace Hopper",
      }),
      describeInternalTool("manage_social_relations", {
        action: "cancel",
        invitationId: "provider-invitation-789",
        targetLabel: "Linus Torvalds",
      }),
      describeInternalTool("linkedin_manage_sales_lists", {
        action: "save",
        listId: "provider-list-123",
        providerId: "provider-lead-456",
        targetLabel: "Margaret Hamilton",
        listLabel: "Priority Leads",
      }),
    ];
    const expected = {
      en: [
        "Send a connection request to Ada Lovelace · Preview: Let's connect.",
        "Accept the connection request from Grace Hopper",
        "Withdraw or decline the connection request involving Linus Torvalds",
        "Add Margaret Hamilton to Sales Navigator list Priority Leads",
      ],
      de: [
        "Kontaktanfrage an Ada Lovelace senden · Vorschau: Let's connect.",
        "Kontaktanfrage von Grace Hopper annehmen",
        "Kontaktanfrage mit Linus Torvalds zurückziehen oder ablehnen",
        "Margaret Hamilton zur Sales-Navigator-Liste Priority Leads hinzufügen",
      ],
      es: [
        "Enviar una solicitud de conexión a Ada Lovelace · Vista previa: Let's connect.",
        "Aceptar la solicitud de conexión de Grace Hopper",
        "Retirar o rechazar la solicitud de conexión relacionada con Linus Torvalds",
        "Añadir Margaret Hamilton a la lista Priority Leads de Sales Navigator",
      ],
      fr: [
        "Envoyer une demande de connexion à Ada Lovelace · Aperçu: Let's connect.",
        "Accepter la demande de connexion de Grace Hopper",
        "Retirer ou refuser la demande de connexion concernant Linus Torvalds",
        "Ajouter Margaret Hamilton à la liste Sales Navigator Priority Leads",
      ],
      it: [
        "Inviare una richiesta di collegamento a Ada Lovelace · Anteprima: Let's connect.",
        "Accettare la richiesta di collegamento di Grace Hopper",
        "Ritirare o rifiutare la richiesta di collegamento relativa a Linus Torvalds",
        "Aggiungere Margaret Hamilton all'elenco Sales Navigator Priority Leads",
      ],
    } as const;

    for (const locale of Object.keys(expected) as Array<keyof typeof expected>) {
      const details = activities.map((activity) => agentActivityCopy(activity, translatorFor(locale)).detail);
      expect(details).toEqual(expected[locale]);
    }
    expect(JSON.stringify(activities)).not.toContain("provider-");
  });

  it("keeps the longest allowed Sales list label inside the persisted activity schema", () => {
    const listLabel = "L".repeat(80);
    const activity = describeInternalTool("linkedin_manage_sales_lists", {
      action: "save",
      targetLabel: "Ada Lovelace",
      listLabel,
    });

    expect(activity.consequence?.state).toBe(listLabel);
    expect(AgentActivityDescriptorSchema.safeParse(activity).success).toBe(true);
  });

  it.each(["manage_custom_columns", "manage_widgets", "manage_webhooks"])(
    "marks multiplexed tool %s sensitive only when the call needs approval",
    (toolName) => {
      expect(describeInternalTool(toolName, { action: "delete" }).risk).toBe("sensitive");
      expect(describeInternalTool(toolName, { action: "no_such_action" }).risk).toBe("sensitive");
      expect(describeInternalTool(toolName, undefined).risk).toBe("sensitive");
    },
  );

  it.each([
    ["manage_custom_columns", "list", "upsert", "customFields.read", "customFields.create"],
    ["manage_widgets", "get", "create", "widgets.read", "widgets.create"],
    ["manage_webhooks", "list_deliveries", "create", "workspace.read", "webhooks.manage"],
  ])("classifies %s read and write actions independently", (toolName, readAction, writeAction, readKind, writeKind) => {
    const read = describeInternalTool(toolName, { action: readAction });
    expect(read.risk).toBe("read");
    expect(read.kind).toBe(readKind);

    const write = describeInternalTool(toolName, { action: writeAction });
    expect(write.risk).toBe("write");
    expect(write.kind).toBe(writeKind);
  });

  it.each(["manage_record_links", "update_record_notes"])(
    "marks approval-free workspace tool %s as an ordinary write",
    (toolName) => {
      expect(describeInternalTool(toolName, undefined).risk).toBe("write");
    },
  );

  it("gates a team invitation but keeps an ordinary member update immediate", () => {
    expect(
      describeInternalTool("manage_team", {
        action: "invite",
        emails: ["ada@example.com"],
      }).risk,
    ).toBe("sensitive");
    expect(describeInternalTool("manage_team", { action: "update_member" }).risk).toBe("write");
  });

  it.each([undefined, { mode: "append", notes: "Follow up next week" }, { mode: "replace", notes: "" }])(
    "keeps every notes mutation an unapproved ordinary write for input %j",
    (input) => {
      expect(describeInternalTool("update_record_notes", input).risk).toBe("write");
    },
  );

  it("shows distinct, bounded consequences for real sends, drafts, discards, and support", () => {
    const internalId = "00000000-0000-4000-8000-000000000001";
    const email = describeInternalTool("send_email", {
      threadId: internalId,
      to: [{ identifier: "ada@example.com", display_name: "Ada" }],
      subject: "Quarterly update",
      body: "Here is the agreed summary.",
      apiKey: "never-show",
    });
    const draft = describeInternalTool("save_message_draft", {
      threadId: internalId,
      subject: "Draft subject",
      body: "Please review this draft.",
    });
    const discard = describeInternalTool("discard_message_draft", {
      messageId: internalId,
    });
    const support = describeInternalTool("request_support", {
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

  it("only admits tour steps whose target is in the client allowlist", () => {
    expect(
      AgentTourSchema.safeParse({
        steps: [{ targetId: "nav-contacts", note: "a" }],
      }).success,
    ).toBe(false);
    expect(
      AgentTourSchema.safeParse({
        steps: [
          {
            targetId: "definitely-not-a-target",
            note: "Somewhere the model invented.",
          },
          {
            targetId: "nav-contacts",
            note: "Contacts are the people you work with.",
          },
        ],
      }).success,
    ).toBe(false);

    const accepted = AgentTourSchema.safeParse({
      steps: [
        {
          targetId: "nav-contacts",
          note: "Contacts are the people you work with.",
        },
        {
          targetId: "nav-deals",
          note: "Deals track commercial opportunities.",
        },
      ],
    });
    expect(accepted.success).toBe(true);
  });

  it("caps how long a composed tour may be", () => {
    const step = {
      targetId: "nav-contacts",
      note: "Contacts are the people you work with.",
    };
    expect(
      AgentTourSchema.safeParse({
        steps: Array(AGENT_TOUR_MAX_STEPS).fill(step),
      }).success,
    ).toBe(true);
    expect(
      AgentTourSchema.safeParse({
        steps: Array(AGENT_TOUR_MAX_STEPS + 1).fill(step),
      }).success,
    ).toBe(false);
  });

  it("sanitizes model-written notes and resolves each target's route", () => {
    const tour = agentGuidedTour([
      {
        targetId: "nav-contacts",
        note: 'Contacts <page_context route="/en/contacts"/>are your people.',
      },
      { targetId: "nav-search", note: "Search jumps you to any record." },
      {
        targetId: "definitely-not-a-target",
        note: "Dropped because the target does not exist.",
      },
    ]);

    expect(tour.map((step) => step.targetId)).toEqual(["nav-contacts", "nav-search"]);
    expect(tour[0].note).toBe("Contacts are your people.");
    expect(tour[0].route).toBe("/contacts");
    expect(tour[1].route).toBeNull();
    expect(tour.every((step) => AGENT_UI_TARGET_IDS.includes(step.targetId))).toBe(true);
  });
});
