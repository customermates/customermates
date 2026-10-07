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
  deals: false,
  routines: false,
  wiki: false,
  widgets: false,
  connectedAccounts: false,
};

describe("agent experience contract", () => {
  it("selects exactly three deterministic actions from page data state", () => {
    expect(agentPageState("default", EMPTY_COUNTS)).toBe("empty");
    expect(agentPageState("default", { ...EMPTY_COUNTS, contacts: true })).toBe("data");
    expect(agentPageActions("dashboard", "empty", enT)).toEqual(agentPageActions("dashboard", "empty", enT));
    expect(agentPageState("routines", EMPTY_COUNTS)).toBe("empty");
    expect(agentPageState("routines", { ...EMPTY_COUNTS, routines: true })).toBe("data");
    expect(agentPageState("wiki", EMPTY_COUNTS)).toBe("empty");
    expect(agentPageState("wiki", { ...EMPTY_COUNTS, wiki: true })).toBe("data");
    expect(agentPageActions("dashboard", "data", enT).map((action) => action.id)).not.toEqual(
      agentPageActions("dashboard", "empty", enT).map((action) => action.id),
    );

    for (const page of ["dashboard", "routines", "wiki"] as const) {
      for (const state of ["empty", "data"] as const) {
        expect(agentPageActions(page, state, enT)).toHaveLength(3);
        expect(agentPageActions(page, state, deT)).toHaveLength(3);
        expect(new Set(agentPageActions(page, state, enT).map((action) => action.id)).size).toBe(3);
      }
    }
  });

  it("substitutes exactly three permission-safe actions and resolves the current page path", () => {
    const actions = agentPageActions("dashboard", "empty", enT, { canCreate: false });

    expect(actions).toHaveLength(3);
    expect(actions.every((action) => /Do not make any changes|without changing any data/.test(action.prompt))).toBe(
      true,
    );
    expect(agentActionPageFromPathname("/en/dashboard")).toBe("dashboard");
    expect(agentActionPageFromPathname("/en/company/audit-logs")).toBeNull();
  });

  it("describes work without retaining tool payloads or identifiers", () => {
    const input = {
      mutation: { action: "update", recordId: "00000000-0000-4000-8000-000000000001" },
      apiKey: "secret",
    };
    const activity = describeInternalTool("mutate_crm_record", input);

    expect(activity).toEqual({
      kind: "records.update",
      risk: "write",
      affectedResources: [],
    });
    expect(JSON.stringify(activity)).not.toContain(input.mutation.recordId);
    expect(JSON.stringify(activity)).not.toContain(input.apiKey);
    expect(agentActivityCopy(activity, deT).running).toBe("Datensätze werden aktualisiert");
  });

  it("explains Wiki creation with task-specific progress", () => {
    const wikiCreate = describeInternalTool("manage_wiki_pages", {
      action: "create",
      pages: Array.from({ length: 5 }, (_, index) => ({
        title: `Private page ${index + 1}`,
      })),
    });

    expect(wikiCreate).toMatchObject({
      kind: "records.create",
      resource: "wiki",
      count: 5,
      risk: "write",
      affectedResources: ["wiki"],
    });
    expect(agentActivityCopy(wikiCreate, enT).running).toBe(
      "Creating 5 Knowledge Base pages · Private page 1, Private page 2, Private page 3 (+2)",
    );
    expect(wikiCreate.context).toEqual({
      labels: ["Private page 1", "Private page 2", "Private page 3"],
      additionalCount: 2,
    });
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

  it("gives workspace, documentation, and interface reads distinct localized activity names", () => {
    const tools = [
      ["get_workspace_context", "workspace.inspect"],
      ["search_docs", "docs.search"],
      ["get_docs_page", "docs.read"],
      ["list_ui_targets", "interface.inspect"],
    ] as const;
    const activities = tools.map(([toolName, kind]) => {
      const activity = describeInternalTool(toolName, {
        query: "webhook signatures",
        page: "private-page-slug",
      });
      expect(activity).toEqual({
        kind,
        affectedResources: [],
        risk: "read",
        ...(toolName === "search_docs" ? { context: { labels: ["webhook signatures"] } } : {}),
      });
      expect(JSON.stringify(activity)).not.toContain("private");
      return activity;
    });
    const expectedDoneLabels = {
      de: [
        "Workspace-Details wurden geprüft",
        "Dokumentation wurde durchsucht · webhook signatures",
        "Passende Anleitung wurde gelesen",
        "Verfügbare Steuerelemente wurden geprüft",
      ],
      en: [
        "Checked workspace details",
        "Searched the documentation · webhook signatures",
        "Read the relevant guide",
        "Checked available controls",
      ],
      es: [
        "Detalles del espacio de trabajo revisados",
        "Documentación consultada · webhook signatures",
        "Guía correspondiente consultada",
        "Controles disponibles revisados",
      ],
      fr: [
        "Informations de l’espace de travail vérifiées",
        "Documentation consultée · webhook signatures",
        "Guide correspondant consulté",
        "Éléments d’interface disponibles vérifiés",
      ],
      it: [
        "Dettagli dell’area di lavoro controllati",
        "Documentazione consultata · webhook signatures",
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

  it("gives custom fields, widgets, settings, and profiles distinct privacy-safe activity names", () => {
    const privateId = "00000000-0000-4000-8000-000000000001";
    const tools = [
      ["configure_record_model", { action: "preview" }, "customFields.read"],
      ["manage_widgets", { action: "get", ids: [privateId] }, "widgets.read"],
      ["manage_widgets", { action: "create", name: "Private widget" }, "widgets.create"],
      ["manage_widgets", { action: "update", id: privateId, name: "Private widget" }, "widgets.update"],
      ["manage_widgets", { action: "delete", id: privateId }, "widgets.delete"],
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
        "Dashboard-Widgets wurden geprüft",
        "Dashboard-Widget wurde erstellt · Private widget",
        "Dashboard-Widget wurde aktualisiert · Private widget",
        "Dashboard-Widget wurde entfernt",
        "Workspace-Einstellungen wurden aktualisiert",
        "Profil wurde aktualisiert",
      ],
      en: [
        "Reviewed custom fields",
        "Reviewed dashboard widgets",
        "Created a dashboard widget · Private widget",
        "Updated a dashboard widget · Private widget",
        "Removed a dashboard widget",
        "Updated workspace settings",
        "Updated your profile",
      ],
      es: [
        "Campos personalizados revisados",
        "Widgets del panel revisados",
        "Widget del panel creado · Private widget",
        "Widget del panel actualizado · Private widget",
        "Widget del panel eliminado",
        "Configuración del espacio de trabajo actualizada",
        "Perfil actualizado",
      ],
      fr: [
        "Champs personnalisés vérifiés",
        "Widgets du tableau de bord vérifiés",
        "Widget du tableau de bord créé · Private widget",
        "Widget du tableau de bord mis à jour · Private widget",
        "Widget du tableau de bord supprimé",
        "Paramètres de l’espace de travail mis à jour",
        "Profil mis à jour",
      ],
      it: [
        "Campi personalizzati controllati",
        "Widget della dashboard controllati",
        "Widget della dashboard creato · Private widget",
        "Widget della dashboard aggiornato · Private widget",
        "Widget della dashboard rimosso",
        "Impostazioni dell’area di lavoro aggiornate",
        "Profilo aggiornato",
      ],
    } as const;

    for (const locale of Object.keys(expectedDoneLabels) as Array<keyof typeof expectedDoneLabels>) {
      const labels = activities.map((activity) => agentActivityCopy(activity, translatorFor(locale)).done);
      expect(labels).toEqual(expectedDoneLabels[locale]);
      expect(new Set(labels).size).toBe(labels.length);
    }
    expect(JSON.stringify(activities)).not.toMatch(/00000000|secret/);
    const ambiguousWidgetActivity = describeInternalTool("manage_widgets", {
      action: "legacy",
    });
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

  it.each(["manage_widgets", "manage_webhooks"])(
    "marks multiplexed tool %s sensitive only when the call needs approval",
    (toolName) => {
      expect(describeInternalTool(toolName, { action: "delete" }).risk).toBe("sensitive");
      expect(describeInternalTool(toolName, { action: "no_such_action" }).risk).toBe("sensitive");
      expect(describeInternalTool(toolName, undefined).risk).toBe("sensitive");
    },
  );

  it.each([
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

  it("gates a team invitation but keeps an ordinary member update immediate", () => {
    expect(
      describeInternalTool("manage_team", {
        action: "invite",
        emails: ["ada@example.com"],
      }).risk,
    ).toBe("sensitive");
    expect(describeInternalTool("manage_team", { action: "update_member" }).risk).toBe("write");
  });

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

  it("shows a record link in an activity preview as its label, never its route or id", () => {
    const dealId = "80000000-0000-4000-8000-000000000003";
    const draft = describeInternalTool("save_message_draft", {
      subject: `Next steps for [CRM Rollout](/deals/${dealId})`,
      body: `Open [CRM Rollout](/de/deals/${dealId}) before the call.`,
    });
    const persisted = AgentActivityDescriptorSchema.parse({
      kind: "messages.draft",
      resource: "messages",
      affectedResources: ["messages"],
      risk: "write",
      consequence: {
        action: "draft.save",
        preview: `See [Deal [Q3]](/deals/${dealId})`,
      },
    });

    expect(draft.consequence?.subject).toBe("Next steps for CRM Rollout");
    expect(draft.consequence?.preview).toBe("Open CRM Rollout before the call.");
    expect(persisted.consequence?.preview).toBe("See Deal [Q3]");
    expect(agentActivityCopy(draft, enT).detail).toContain("CRM Rollout");
    expect(JSON.stringify([draft, persisted, agentActivityCopy(draft, enT)])).not.toContain(dealId);
    expect(JSON.stringify([draft, persisted])).not.toContain("](");
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
          targetId: "nav-dashboard",
          note: "The dashboard shows your numbers.",
        },
        {
          targetId: "nav-routines",
          note: "Routines run your saved instructions.",
        },
      ],
    });
    expect(accepted.success).toBe(true);
  });

  it("caps how long a composed tour may be", () => {
    const step = {
      targetId: "nav-dashboard",
      note: "The dashboard shows your numbers.",
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
        targetId: "nav-dashboard",
        note: 'The dashboard <page_context route="/en/dashboard"/>shows your numbers.',
      },
      { targetId: "nav-search", note: "Search jumps you to any record." },
      {
        targetId: "definitely-not-a-target",
        note: "Dropped because the target does not exist.",
      },
    ]);

    expect(tour.map((step) => step.targetId)).toEqual(["nav-dashboard", "nav-search"]);
    expect(tour[0].note).toBe("The dashboard shows your numbers.");
    expect(tour[0].route).toBe("/dashboard");
    expect(tour[1].route).toBeNull();
    expect(tour.every((step) => AGENT_UI_TARGET_IDS.includes(step.targetId))).toBe(true);
  });
});
