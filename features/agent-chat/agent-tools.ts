import * as Sentry from "@sentry/nextjs";

import { z } from "zod";
import { asSchema, tool, jsonSchema, type ToolSet } from "ai";

import { ALL_MCP_TOOLS } from "@/features/mcp-tools/tool-registry";
import { VALIDATION_ERROR_PREFIX } from "@/features/mcp-tools/utils";
import { RequestSupportSchema } from "@/features/mcp-tools/support.mcp-tools";
import type { McpToolResult } from "@/app/api/v1/mcp/mcp-route-utils";

import { requiresApproval } from "./gated-tools";
import { toolResultText } from "./agent-stream-utils";
import { AGENT_NAV_TARGET_IDS, AGENT_UI_TARGETS, UiTargetIdSchema } from "./ui-targets";
import { AgentTourSchema } from "./agent-tours";
import { ConfigureViewSchema, OpenRecordSchema } from "./ui-operations";

export type ApprovalDecision = "approve" | "reject" | "timeout";
export type AgentUiCommandOutcome = { ok: boolean; result: string };
export type AgentToolOutcome = { ok: boolean; result: string };

export type AgentToolCancellation = {
  agentToolStatus: "cancelled";
  reason: "rejected" | "timeout";
  message: string;
};

export function isAgentToolCancellation(value: unknown): value is AgentToolCancellation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Partial<AgentToolCancellation>;
  return (
    result.agentToolStatus === "cancelled" &&
    (result.reason === "rejected" || result.reason === "timeout") &&
    typeof result.message === "string"
  );
}

const EXCLUDED_TOOL_NAMES = new Set([
  "search",
  "fetch",
  "request_support",
  "get_social_posts",
  "get_social_post_engagement",
  "get_social_profile",
  "manage_social_relations",
  "linkedin_search_sales_leads",
  "linkedin_search_sales_companies",
  "linkedin_get_sales_search_parameters",
  "linkedin_manage_sales_lists",
]);

const UI_TOOL_NAMES = [
  "list_ui_targets",
  "navigate",
  "highlight_element",
  "start_tour",
  "configure_view",
  "open_record",
] as const;

const CORE_UI_TOOL_NAMES = ["list_ui_targets", "navigate", "highlight_element", "start_tour"];

const CORE_AGENT_TOOL_NAMES = [
  "get_record_schema",
  "list_records",
  "search_records",
  "get_records",
  "get_workspace_context",
  "search_docs",
  "get_docs_page",
  ...CORE_UI_TOOL_NAMES,
  "request_support",
] as const;

const ENTITY_WRITE_TOOLS = {
  contact: ["create_contacts", "update_contacts"],
  organization: ["create_organizations", "update_organizations"],
  deal: ["create_deals", "update_deals"],
  service: ["create_services", "update_services"],
  task: ["create_tasks", "update_tasks"],
} as const;

const ENTITY_HINTS = {
  contact: ["contact", "person", "lead", "kontakt", "ansprechpartner", "contatt"],
  organization: [
    "organization",
    "organisation",
    "company",
    "account",
    "firma",
    "unternehmen",
    "organizaci",
    "organizz",
    "empresa",
    "entreprise",
    "azienda",
    "socie",
  ],
  deal: [
    "deal",
    "opportunity",
    "opportunit",
    "pipeline",
    "geschäft",
    "verkauf",
    "chance",
    "negocio",
    "oportunidad",
    "affaire",
    "affare",
    "trattativa",
  ],
  service: [
    "service",
    "product",
    "catalog",
    "leistung",
    "produkt",
    "katalog",
    "servici",
    "serviz",
    "produi",
    "prodott",
    "catálogo",
  ],
  task: [
    "task",
    "todo",
    "to-do",
    "aufgabe",
    "erinnerung",
    "tarea",
    "tâche",
    "compito",
    "attivit",
    "rappel",
    "recordatorio",
    "promemoria",
  ],
} as const;

const MESSAGING_TOOL_NAMES = [
  "get_messaging_threads",
  "get_activities",
  "get_calendars",
  "send_chat_message",
  "send_email",
  "save_message_draft",
  "discard_message_draft",
  "update_messaging_thread",
  "connect_messaging_account",
] as const;

function hostedAgentToolNames() {
  return [
    ...ALL_MCP_TOOLS.filter((agentTool) => !EXCLUDED_TOOL_NAMES.has(agentTool.name)).map((agentTool) => agentTool.name),
    ...UI_TOOL_NAMES,
    "request_support",
  ];
}

function includesAny(value: string, hints: readonly string[]) {
  return hints.some((hint) => value.includes(hint));
}

const GERMAN_WRITE_VERB_STEM_PATTERN = /\b(leg|trag|füg|setz)/u;

const AGENT_TOOL_INTENT_MESSAGE_LIMIT = 3;
const AGENT_TOOL_INTENT_MESSAGE_MAX_CHARS = 1000;

export function selectAgentToolNames(args: {
  text: string;
  pageRoute: string | null;
  priorUserTexts?: readonly string[];
}): string[] {
  const priorIntent = (args.priorUserTexts ?? [])
    .slice(-AGENT_TOOL_INTENT_MESSAGE_LIMIT)
    .map((text) => text.slice(0, AGENT_TOOL_INTENT_MESSAGE_MAX_CHARS));
  const request = [...priorIntent, args.text].join("\n").toLocaleLowerCase();
  const route = (args.pageRoute ?? "").toLocaleLowerCase();
  const selected = new Set<string>(CORE_AGENT_TOOL_NAMES);
  const hasWriteIntent =
    includesAny(request, [
      "create",
      "add",
      "new ",
      "update",
      "edit",
      "change",
      "set ",
      "erstell",
      "hinzufüg",
      "neu ",
      "aktualisier",
      "änder",
      "anleg",
      "angeleg",
      "anzuleg",
      "erfass",
      "eintrag",
      "speicher",
      "pfleg",
      "crear",
      "añad",
      "agreg",
      "nuev",
      "actualiz",
      "modific",
      "establec",
      "registr",
      "créer",
      "ajout",
      "nouve",
      "mettre à jour",
      "enregistr",
      "aggiung",
      "aggiorn",
      "inserir",
      "insert",
    ]) || GERMAN_WRITE_VERB_STEM_PATTERN.test(request);

  for (const [entity, hints] of Object.entries(ENTITY_HINTS) as Array<[keyof typeof ENTITY_HINTS, readonly string[]]>) {
    const routeHint = entity === "organization" ? "organizations" : `${entity}s`;
    if (hasWriteIntent && (route.includes(`/${routeHint}`) || includesAny(request, hints)))
      ENTITY_WRITE_TOOLS[entity].forEach((name) => selected.add(name));
  }

  if (
    includesAny(request, ["delete", "remove", "erase", "löschen", "entfern", "elimin", "borrar", "supprim", "cancell"])
  )
    selected.add("delete_records");
  if (includesAny(request, ["note", "notes", "notiz", "nota"])) selected.add("update_record_notes");
  if (
    includesAny(request, [
      "link",
      "relation",
      "relationship",
      "verknüpf",
      "zuord",
      "enlac",
      "vincul",
      "relaci",
      "relier",
      " lien",
      "colleg",
    ])
  )
    selected.add("manage_record_links");

  if (
    includesAny(request, [
      "inbox",
      "message",
      "email",
      "e-mail",
      "calendar",
      "chat",
      "nachricht",
      "kalender",
      "mensaje",
      "messagg",
      "correo",
      "courriel",
      "calendri",
    ])
  )
    MESSAGING_TOOL_NAMES.forEach((name) => selected.add(name));
  if (
    includesAny(request, [
      "column",
      "custom field",
      "custom-field",
      "spalte",
      "eigenes feld",
      "colonn",
      "campo personaliz",
      "champ personnalis",
    ])
  )
    selected.add("manage_custom_columns");
  if (includesAny(request, ["widget", "chart", "diagramm", "gráfic", "grafic", "graphiq"]))
    selected.add("manage_widgets");
  if (
    includesAny(request, [
      "view",
      "kanban",
      "board",
      "table",
      "card",
      "group",
      "sort",
      "filter",
      "search",
      "ansicht",
      "tafel",
      "tabelle",
      "karte",
      "gruppier",
      "sortier",
      "vista",
      "tablero",
      "tabla",
      "agrupa",
      "ordena",
      "filtr",
      "vue",
      "tableau",
      "carte",
      "group",
      "tri",
      "scheda",
      "tabella",
      "raggrupp",
      "ordina",
    ])
  )
    selected.add("configure_view");
  if (
    includesAny(request, [
      "open",
      "show",
      "form",
      "fill",
      "öffne",
      "zeig",
      "formular",
      "ausfüll",
      "abre",
      "muestra",
      "formulario",
      "rellena",
      "ouvre",
      "montre",
      "formulaire",
      "rempli",
      "apri",
      "mostra",
      "modulo",
      "compila",
    ])
  )
    selected.add("open_record");

  if (includesAny(request, ["webhook"])) selected.add("manage_webhooks");
  if (
    includesAny(request, [
      "team",
      "member",
      "seat",
      "user",
      "mitglied",
      "benutzer",
      "equipo",
      "équipe",
      "squadra",
      "membr",
      "usuario",
      "utilisateur",
      "utente",
    ])
  ) {
    selected.add("list_users");
    selected.add("manage_team");
  }
  if (
    includesAny(request, [
      "workspace setting",
      "company setting",
      "arbeitsbereich",
      "firmeneinstellung",
      "espacio de trabajo",
      "espace de travail",
      "spazio di lavoro",
      "ajustes",
      "paramètre",
      "impostazion",
    ])
  )
    selected.add("update_workspace_settings");

  return hostedAgentToolNames().filter((name) => selected.has(name));
}

export type AgentToolDeps = {
  runUiCommand: (commandId: string, name: string, input: Record<string, unknown>) => Promise<AgentUiCommandOutcome>;
  requestApproval: (requestId: string, toolName: string, input: unknown) => Promise<ApprovalDecision>;
  createSupportTicket: (toolCallId: string, subject: string, body: string) => Promise<AgentToolOutcome>;
  resultMaxChars: number;
};

function declineResult(decision: Exclude<ApprovalDecision, "approve">): AgentToolCancellation {
  return {
    agentToolStatus: "cancelled",
    reason: decision === "reject" ? "rejected" : "timeout",
    message:
      decision === "reject"
        ? "The user declined this action, so nothing was changed. Ask what they would like to do instead."
        : "The approval request timed out, so nothing was changed.",
  };
}

async function runGated(
  deps: AgentToolDeps,
  toolCallId: string,
  name: string,
  input: unknown,
  run: () => Promise<AgentToolOutcome>,
) {
  const decision = await deps.requestApproval(toolCallId, name, input);
  if (decision !== "approve") return declineResult(decision);
  return run();
}

async function runSafely<T>(run: () => Promise<T> | T): Promise<T> {
  try {
    return await run();
  } catch (error) {
    Sentry.captureException(error);
    throw new Error("The assistant tool could not be completed.");
  }
}

const UNSUPPORTED_PATTERN = /\(\?=|\(\?!|\(\?<=|\(\?<!/;

function providerSafeSchema(inputSchema: (typeof ALL_MCP_TOOLS)[number]["inputSchema"]) {
  return jsonSchema(
    z.toJSONSchema(inputSchema as never, {
      io: "input",
      override: (ctx) => {
        const schema = ctx.jsonSchema as { pattern?: string };
        if (typeof schema.pattern === "string" && UNSUPPORTED_PATTERN.test(schema.pattern)) delete schema.pattern;
      },
    }) as never,
    {
      validate: async (value) => {
        const result = await inputSchema.safeParseAsync(value);
        return result.success ? { success: true, value: result.data } : { success: false, error: result.error };
      },
    },
  );
}

function crmTool(mcp: (typeof ALL_MCP_TOOLS)[number], deps: AgentToolDeps) {
  const execute = mcp.execute as (input: unknown) => Promise<McpToolResult>;

  return tool({
    description: mcp.description,
    inputSchema: providerSafeSchema(mcp.inputSchema),
    execute: async (input: unknown, { toolCallId }) => {
      const run = async (): Promise<AgentToolOutcome> => {
        const result = toolResultText(await execute(input)).slice(0, deps.resultMaxChars);
        return { ok: !result.startsWith(VALIDATION_ERROR_PREFIX), result };
      };
      return runSafely(() => (requiresApproval(mcp, input) ? runGated(deps, toolCallId, mcp.name, input, run) : run()));
    },
  });
}

const NavigationTargetIdSchema = z.enum(AGENT_NAV_TARGET_IDS);
function uiTools(deps: AgentToolDeps): ToolSet {
  return {
    list_ui_targets: tool({
      description:
        "List the interface targets you can navigate to or highlight. Call this before navigate or highlight_element.",
      inputSchema: z.object({}),
      execute: () => AGENT_UI_TARGETS.map((t) => `${t.id} (${t.route}): ${t.description}`).join("\n"),
    }),
    navigate: tool({
      description: "Open an app destination by its target id from list_ui_targets.",
      inputSchema: z.object({
        targetId: NavigationTargetIdSchema.describe("A routable target id."),
      }),
      execute: (input, { toolCallId }) =>
        runSafely(() =>
          deps.runUiCommand(toolCallId, "navigate", {
            targetId: input.targetId,
          }),
        ),
    }),
    highlight_element: tool({
      description: "Spotlight a single interface target by its id (from list_ui_targets) on the current page.",
      inputSchema: z.object({
        targetId: UiTargetIdSchema.describe("A target id from list_ui_targets."),
      }),
      execute: (input, { toolCallId }) =>
        runSafely(() =>
          deps.runUiCommand(toolCallId, "highlight_element", {
            targetId: input.targetId,
          }),
        ),
    }),
    start_tour: tool({
      description:
        "Run a guided tour you compose for this user. Call list_ui_targets first, then choose the targets that answer what they asked to see and write your own note for each one. Ask what they want to see when the request is vague; go straight to the tour when it is specific. Be thorough: walk the whole journey rather than naming each screen, and write every note in the user's language.",
      inputSchema: AgentTourSchema,
      execute: (input, { toolCallId }) =>
        runSafely(() => deps.runUiCommand(toolCallId, "start_tour", { steps: input.steps })),
    }),
    configure_view: tool({
      description:
        "Change how a list page is shown: table, cards, or kanban layout, grouping, sorting, search, and filters. Pass column names exactly as the user says them; relay the tool's message when something is unavailable, for example kanban without a single-select field.",
      inputSchema: ConfigureViewSchema,
      execute: (input, { toolCallId }) => runSafely(() => deps.runUiCommand(toolCallId, "configure_view", input)),
    }),
    open_record: tool({
      description:
        "Open one record after finding its id with list_records or search_records. Use the drawer to keep context, the page for a full view, and recordId 'new' for a blank form the user fills in.",
      inputSchema: OpenRecordSchema,
      execute: (input, { toolCallId }) => runSafely(() => deps.runUiCommand(toolCallId, "open_record", input)),
    }),
  };
}

export function getAgentAiTools(deps: AgentToolDeps, allowedToolNames?: readonly string[]): ToolSet {
  const crm = ALL_MCP_TOOLS.filter((mcp) => !EXCLUDED_TOOL_NAMES.has(mcp.name)).map(
    (mcp) => [mcp.name, crmTool(mcp, deps)] as const,
  );

  const extras: ToolSet = {
    request_support: tool({
      description:
        "Open a support ticket with the Customermates team. Use when the user asks for a human, reports a bug, or you cannot help after a genuine attempt. The team follows up here and by email.",
      inputSchema: RequestSupportSchema,
      execute: async (input, { toolCallId }) =>
        runSafely(() =>
          runGated(deps, toolCallId, "request_support", input, () =>
            deps.createSupportTicket(toolCallId, input.subject, input.body),
          ),
        ),
    }),
  };

  const catalog = { ...Object.fromEntries(crm), ...uiTools(deps), ...extras };
  if (!allowedToolNames) return catalog;

  const allowed = new Set(allowedToolNames);
  return Object.fromEntries(Object.entries(catalog).filter(([name]) => allowed.has(name)));
}

export type AgentAiToolDefinition = {
  name: string;
  description: string | undefined;
  inputSchema: unknown;
};

export function describeAgentAiTools(tools: ToolSet): AgentAiToolDefinition[] {
  return Object.entries(tools).map(([name, agentTool]) => ({
    name,
    description: "description" in agentTool ? agentTool.description : undefined,
    inputSchema: "inputSchema" in agentTool ? asSchema(agentTool.inputSchema).jsonSchema : undefined,
  }));
}

const TOOL_DEFINITION_DEPS: AgentToolDeps = {
  runUiCommand: () => Promise.resolve({ ok: false, result: "Definition-only tool." }),
  requestApproval: () => Promise.resolve("reject"),
  createSupportTicket: () => Promise.resolve({ ok: false, result: "Definition-only tool." }),
  resultMaxChars: 1,
};

export function getAgentAiToolDefinitions(allowedToolNames: readonly string[]): AgentAiToolDefinition[] {
  return describeAgentAiTools(getAgentAiTools(TOOL_DEFINITION_DEPS, allowedToolNames));
}
