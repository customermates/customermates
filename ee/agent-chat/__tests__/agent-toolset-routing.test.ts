import { describe, expect, it } from "vitest";

import { MCP_TOOL_GROUPS } from "@/features/mcp-tools/tool-registry";

import { LOCALE_REGISTRY } from "@/i18n/locale-registry";

import {
  AGENT_CORE_TOOLSETS,
  AGENT_TOOLSET_LEXICON,
  AGENT_ON_DEMAND_TOOLSETS,
  AGENT_TOOLSET_SUMMARY,
  activeAgentToolNames,
  toolsetIndexSentence,
  toolsetsForRequest,
  toolsetsFromActivities,
  toolsetsUsedInMessages,
} from "../agent-toolset-routing";
import { coreToolNames, onDemandToolsetOfTool, toolNamesOfToolset } from "../agent-toolsets";

const TOOLS = [
  { name: "query_crm_records", toolset: null },
  { name: "search_docs", toolset: null },
  { name: "load_toolset", toolset: null },
  { name: "manage_data_views", toolset: "views" },
  { name: "get_messaging_threads", toolset: "messaging" },
  { name: "send_email", toolset: "messaging" },
  { name: "manage_webhooks", toolset: "webhooks" },
  { name: "manage_routines", toolset: "routines" },
  { name: "manage_team", toolset: "admin" },
  { name: "get_social_posts", toolset: "social" },
];

describe("toolset partition", () => {
  it("covers every registry group exactly once between core and on-demand sets", () => {
    const partitioned = [...AGENT_CORE_TOOLSETS, ...AGENT_ON_DEMAND_TOOLSETS].toSorted();
    expect(partitioned).toEqual(Object.keys(MCP_TOOL_GROUPS).toSorted());
    expect(new Set(partitioned).size).toBe(partitioned.length);
  });

  it("maps every on-demand tool to its set and every core tool to none", () => {
    for (const toolset of AGENT_ON_DEMAND_TOOLSETS)
      for (const name of toolNamesOfToolset(toolset)) expect(onDemandToolsetOfTool(name)).toBe(toolset);
    for (const name of coreToolNames()) expect(onDemandToolsetOfTool(name)).toBeNull();
    expect(coreToolNames().size).toBe(17);
    expect(coreToolNames().has("get_activities")).toBe(true);
    expect(coreToolNames().has("manage_wiki_pages")).toBe(true);
    expect(coreToolNames().has("manage_data_views")).toBe(false);
    expect(onDemandToolsetOfTool("manage_data_views")).toBe("views");
  });
});

describe("toolset lexicon", () => {
  it("has request words for every toolset in every interface language, lowercase and normalized", () => {
    for (const toolset of AGENT_ON_DEMAND_TOOLSETS) {
      const lexicon = AGENT_TOOLSET_LEXICON[toolset];
      expect(Object.keys(lexicon).toSorted(), toolset).toEqual([...Object.keys(LOCALE_REGISTRY), "any"].toSorted());
      for (const locale of Object.keys(LOCALE_REGISTRY) as Array<keyof typeof LOCALE_REGISTRY>)
        expect(lexicon[locale].length, `${toolset} ${locale}`).toBeGreaterThan(0);
      for (const term of Object.values(lexicon).flat())
        expect(term, `${toolset} ${term}`).toBe(term.toLocaleLowerCase("en-US").normalize("NFKC"));
    }
  });
});

describe("toolsetsForRequest", () => {
  it("discovers personal detail layout controls in all application locales", () => {
    for (const text of [
      "Change my detail layout",
      "Feld anheften",
      "Masquer le champ",
      "Ocultar campo",
      "Nascondi campo",
    ])
      expect(toolsetsForRequest({ text, pageRoute: null }).has("views")).toBe(true);
    expect(onDemandToolsetOfTool("manage_record_detail_layout")).toBe("views");
  });
  it("loads record configuration tools for stable contexts regardless of route or label", () => {
    for (const reference of [
      { kind: "dataModel" as const },
      { kind: "recordType" as const, typeId: "11111111-1111-4111-8111-111111111111" },
      {
        kind: "record" as const,
        typeId: "11111111-1111-4111-8111-111111111111",
        recordId: "22222222-2222-4222-8222-222222222222",
      },
    ]) {
      expect([
        ...toolsetsForRequest({ text: "Change this", pageRoute: null, contexts: [{ reference, label: "Renamed" }] }),
      ]).toEqual(["record-model"]);
    }
  });

  it("routes by user vocabulary in English and German", () => {
    expect([...toolsetsForRequest({ text: "Reply to the email from ACME", pageRoute: null })]).toEqual(["messaging"]);
    expect([...toolsetsForRequest({ text: "Erstelle eine Routine, die jeden Morgen läuft", pageRoute: null })]).toEqual(
      ["routines"],
    );
    expect([...toolsetsForRequest({ text: "Add a KPI chart to my dashboard", pageRoute: null })]).toEqual(["widgets"]);
    expect([...toolsetsForRequest({ text: "Lade Anna als Teammitglied ein", pageRoute: null })]).toEqual(["admin"]);
    expect([...toolsetsForRequest({ text: "Update my current view", pageRoute: null })]).toEqual(["views"]);
    expect([...toolsetsForRequest({ text: "Passe meine aktuelle Ansicht an", pageRoute: null })]).toEqual(["views"]);
  });

  it("routes by user vocabulary in Spanish, French and Italian", () => {
    const route = (text: string) => [...toolsetsForRequest({ text, pageRoute: null })];

    expect(route("Responde al correo de ACME")).toEqual(["messaging"]);
    expect(route("Réponds au courriel d'ACME")).toEqual(["messaging"]);
    expect(route("Rispondi all'ultimo messaggio di ACME")).toEqual(["messaging"]);
    expect(route("Crea una rutina que se ejecute cada mañana")).toEqual(["routines"]);
    expect(route("Crée une automatisation qui tourne chaque matin")).toEqual(["routines"]);
    expect(route("Crea un promemoria ricorrente ogni settimana")).toEqual(["routines"]);
    expect(route("Añade un gráfico al tablero")).toEqual(["widgets"]);
    expect(route("Ajoute un graphique au tableau de bord")).toEqual(["widgets"]);
    expect(route("Aggiungi un grafico al cruscotto")).toEqual(["widgets"]);
    expect(route("Invita a Ana como miembro del equipo")).toEqual(["admin"]);
    expect(route("Change la devise de l'espace de travail")).toEqual(["admin"]);
    expect(route("Cambia il ruolo di Marco")).toEqual(["admin"]);
    expect(route("Muestra el perfil de LinkedIn de Ana")).toEqual(["social"]);
  });

  it("routes by the current page and strips the locale prefix", () => {
    expect([...toolsetsForRequest({ text: "What is this?", pageRoute: "/de/company/webhooks" })]).toEqual([
      "webhooks",
      "admin",
    ]);
    expect([...toolsetsForRequest({ text: "Summarize this", pageRoute: "/en/inbox" })]).toEqual(["messaging"]);
    expect([
      ...toolsetsForRequest({
        text: "Only show records with deals",
        pageRoute: "/en/contacts?view=__all__&viewSurface=contacts-card-store&viewAction=update",
      }),
    ]).toEqual(["views"]);
    expect([
      ...toolsetsForRequest({
        text: "Nur Änderungen anzeigen",
        pageRoute:
          "/de/contacts/00000000-0000-4000-8000-000000000001?view=__all__&viewSurface=entity-timeline&viewAction=update",
      }),
    ]).toEqual(["views"]);
  });

  it("routes a selected data view context without relying on localized prompt text", () => {
    expect([
      ...toolsetsForRequest({
        text: "Bitte so ändern",
        pageRoute: null,
        contexts: [
          {
            reference: {
              kind: "dataView",
              surfaceKey: "records:10000000-0000-4000-8000-000000000011",
              viewKey: "11111111-1111-4111-8111-111111111111",
              requestedAction: "update",
            },
            label: "Qualifizierte Kontakte",
          },
        ],
      }),
    ]).toEqual(["views"]);
  });

  it("keeps a plain records question on the core set", () => {
    expect(toolsetsForRequest({ text: "How many open deals do we have?", pageRoute: "/en/deals" }).size).toBe(0);
  });
});

describe("toolsetsFromActivities", () => {
  it("re-enables the sets a conversation already used", () => {
    const toolsets = toolsetsFromActivities([
      { kind: "messages.read" },
      { kind: "workspace.terminology" },
      { kind: "views.configure" },
      { kind: "records.read" },
      { kind: "generic", consequence: { action: "salesList.save" } },
    ]);
    expect([...toolsets].toSorted()).toEqual(["admin", "messaging", "social", "views"]);
  });
});

describe("activeAgentToolNames", () => {
  it("starts from the core set plus the requested sets", () => {
    expect(activeAgentToolNames({ tools: TOOLS, initialToolsets: [], messages: [] })).toEqual([
      "query_crm_records",
      "search_docs",
      "load_toolset",
    ]);
    expect(activeAgentToolNames({ tools: TOOLS, initialToolsets: ["webhooks"], messages: [] })).toContain(
      "manage_webhooks",
    );
    expect(activeAgentToolNames({ tools: TOOLS, initialToolsets: ["views"], messages: [] })).toContain(
      "manage_data_views",
    );
  });

  it("adds a set once load_toolset was called or one of its tools was used earlier in the turn", () => {
    const messages = [
      {
        role: "assistant",
        content: [{ type: "tool-call", toolName: "load_toolset", input: { toolset: "messaging" } }],
      },
      { role: "assistant", content: [{ type: "tool-call", toolName: "manage_routines", input: { action: "list" } }] },
    ];
    const active = activeAgentToolNames({ tools: TOOLS, initialToolsets: [], messages });
    expect(active).toContain("send_email");
    expect(active).toContain("manage_routines");
    expect(active).not.toContain("manage_team");
    expect(active).not.toContain("get_social_posts");
  });

  it("drops the loader from the list once every set is loaded", () => {
    const active = activeAgentToolNames({
      tools: TOOLS,
      initialToolsets: [...AGENT_ON_DEMAND_TOOLSETS],
      messages: [],
    });
    expect(active).not.toContain("load_toolset");
    expect(activeAgentToolNames({ tools: TOOLS, initialToolsets: ["messaging"], messages: [] })).toContain(
      "load_toolset",
    );
  });

  it("ignores malformed tool calls and unknown sets", () => {
    const messages = [
      {
        role: "assistant",
        content: [{ type: "tool-call", toolName: "load_toolset", input: { toolset: "spaceships" } }],
      },
      { role: "assistant", content: "plain text" },
      { role: "user", content: [{ type: "text", text: "hi" }] },
    ];
    expect(toolsetsUsedInMessages(messages, () => null).size).toBe(0);
  });
});

describe("toolsetIndexSentence", () => {
  it("names every on-demand set and the loader", () => {
    const sentence = toolsetIndexSentence();
    for (const toolset of AGENT_ON_DEMAND_TOOLSETS) expect(sentence).toContain(toolset);
    expect(sentence).toContain("load_toolset");
  });

  it("separates the sets already loaded from the ones still loadable", () => {
    const sentence = toolsetIndexSentence(["messaging"]);
    expect(sentence).toContain("Already loaded for this turn: messaging.");
    expect(sentence).toContain("not loaded yet");
    expect(sentence).toContain("never for a set that is already loaded");
    expect(sentence).not.toContain(`messaging (${AGENT_TOOLSET_SUMMARY.messaging})`);
  });

  it("stops offering the loader once every set is loaded", () => {
    const sentence = toolsetIndexSentence([...AGENT_ON_DEMAND_TOOLSETS]);
    expect(sentence).toContain("nothing left to load");
    expect(sentence).not.toContain("load_toolset");
  });
});
