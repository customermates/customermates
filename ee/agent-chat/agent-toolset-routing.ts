import { agentViewRequestTarget } from "./agent-page-context";
import type { AgentContextAttachment } from "./agent-context";
import type { LocaleCode } from "@/i18n/locale-registry";

export const AGENT_CORE_TOOLSETS = ["records", "workspace", "wiki", "docs", "support"] as const;
export const AGENT_ON_DEMAND_TOOLSETS = [
  "record-model",
  "views",
  "messaging",
  "social",
  "widgets",
  "webhooks",
  "routines",
  "admin",
] as const;

export const AGENT_CORE_TOOL_NAMES = ["get_activities"] as const;

export type AgentOnDemandToolset = (typeof AGENT_ON_DEMAND_TOOLSETS)[number];

export const LOAD_TOOLSET_TOOL_NAME = "load_toolset";
export const ANALYZE_RECORDS_TOOL_NAME = "analyze_records";

export const AGENT_TOOLSET_SUMMARY: Record<AgentOnDemandToolset, string> = {
  "record-model": "configure CRM types, fields, relationships, calculations, access presets and operation recovery",
  views: "saved views, filters, sorting, grouping and personal detail pins, hidden fields and ordering",
  messaging: "inbox, email, chat, calendar and connected messaging accounts",
  social: "LinkedIn, Instagram, posts, profiles, engagement and Sales Navigator",
  widgets: "dashboard widgets",
  webhooks: "webhooks and their deliveries",
  routines: "routines: scheduled or event-driven automations",
  admin: "team members, roles, record access, workspace settings and profile",
};

export const AGENT_TOOLSET_LEXICON: Record<AgentOnDemandToolset, Record<LocaleCode | "any", readonly string[]>> = {
  "record-model": {
    any: [],
    en: [
      "record type",
      "data model",
      "create a list",
      "create projects",
      "calculated field",
      "rollup",
      "lookup field",
      "weighted pipeline",
      "saved pricing",
    ],
    de: ["datenmodell", "datensatztyp", "berechnetes feld"],
    es: ["modelo de datos"],
    fr: ["modèle de données"],
    it: ["modello dati"],
  },
  views: {
    any: ["kanban"],
    en: [
      "pin field",
      "pin the",
      "hide field",
      "detail layout",
      "record details",
      "saved view",
      "current view",
      "new view",
      "my view",
      "create a view",
      "update a view",
      "delete a view",
    ],
    de: [
      "detailansicht",
      "feld anheften",
      "feld ausblenden",
      "gespeicherte ansicht",
      "aktuelle ansicht",
      "neue ansicht",
      "meine ansicht",
      "ansicht erstellen",
      "ansicht löschen",
    ],
    es: [
      "vista de detalle",
      "ocultar campo",
      "vista guardada",
      "vista actual",
      "nueva vista",
      "mi vista",
      "crear una vista",
    ],
    fr: [
      "fiche détaillée",
      "masquer le champ",
      "vue enregistrée",
      "vue actuelle",
      "nouvelle vue",
      "ma vue",
      "créer une vue",
    ],
    it: [
      "dettagli del record",
      "nascondi campo",
      "vista salvata",
      "vista attuale",
      "nuova vista",
      "mia vista",
      "crea una vista",
    ],
  },
  messaging: {
    any: ["whatsapp", "telegram"],
    en: [
      "email",
      "e-mail",
      "mail",
      "inbox",
      "thread",
      "message",
      "chat",
      "calendar",
      "meeting",
      "reply",
      "draft",
      "conversation",
    ],
    de: ["nachricht", "posteingang", "termin", "kalender", "antwort", "entwurf", "unterhaltung"],
    es: [
      "correo",
      "bandeja de entrada",
      "mensaje",
      "calendario",
      "reunión",
      "responder",
      "respuesta",
      "borrador",
      "conversación",
    ],
    fr: [
      "courriel",
      "boîte de réception",
      "messagerie",
      "calendrier",
      "réunion",
      "rendez-vous",
      "répondre",
      "réponse",
      "brouillon",
    ],
    it: [
      "posta elettronica",
      "casella di posta",
      "messaggio",
      "calendario",
      "riunione",
      "appuntamento",
      "rispondere",
      "risposta",
      "bozza",
      "conversazione",
    ],
  },
  social: {
    any: ["linkedin", "instagram", "sales navigator"],
    en: ["post", "profile", "engagement", "connection request", "prospect", "lead list", "follower"],
    de: ["kontaktanfrage", "profil", "beitrag"],
    es: ["publicación", "perfil", "solicitud de conexión", "seguidores", "lista de leads"],
    fr: ["publication", "profil", "demande de connexion", "abonnés", "liste de leads"],
    it: ["pubblicazione", "profilo", "richiesta di collegamento", "lista di lead"],
  },
  widgets: {
    any: ["widget", "dashboard", "kpi"],
    en: ["chart", "tile"],
    de: ["diagramm", "kachel"],
    es: ["gráfico", "tablero", "panel de control"],
    fr: ["graphique", "tableau de bord", "tuile"],
    it: ["grafico", "cruscotto", "riquadro"],
  },
  webhooks: {
    any: ["webhook", "endpoint"],
    en: ["delivery"],
    de: ["zustellung"],
    es: ["entrega"],
    fr: ["livraison"],
    it: ["consegna"],
  },
  routines: {
    any: ["cron"],
    en: [
      "routine",
      "schedule",
      "automation",
      "automate",
      "recurring",
      "every morning",
      "every week",
      "every day",
      "remind me",
    ],
    de: [
      "zeitplan",
      "automatisch",
      "automatisier",
      "wiederkehrend",
      "jeden morgen",
      "jede woche",
      "jeden tag",
      "erinnere mich",
    ],
    es: [
      "rutina",
      "automatiza",
      "automátic",
      "programar",
      "recurrente",
      "cada mañana",
      "cada semana",
      "cada día",
      "recuérdame",
    ],
    fr: [
      "automatis",
      "automatique",
      "planifier",
      "récurrent",
      "chaque matin",
      "chaque semaine",
      "chaque jour",
      "tous les jours",
      "rappelle-moi",
    ],
    it: [
      "automatizza",
      "automatic",
      "pianifica",
      "ricorrente",
      "ogni mattina",
      "ogni settimana",
      "ogni giorno",
      "ricordami",
    ],
  },
  admin: {
    any: ["avatar"],
    en: [
      "team member",
      "teammate",
      "invite",
      "role",
      "permission",
      "rename",
      "currency",
      "workspace setting",
      "my name",
    ],
    de: ["teammitglied", "einladen", "rolle", "berechtigung", "umbenennen", "währung", "einstellung"],
    es: [
      "miembro del equipo",
      "invita",
      "roles",
      "permiso",
      "cambiar el nombre",
      "renombrar",
      "moneda",
      "configuración",
      "mi nombre",
    ],
    fr: ["membre de l'équipe", "inviter", "rôle", "autorisation", "renommer", "devise", "paramètres", "mon nom"],
    it: ["membro del team", "invita", "ruolo", "permesso", "rinominare", "valuta", "impostazioni", "il mio nome"],
  },
};

const TOOLSET_TERMS = new Map(
  AGENT_ON_DEMAND_TOOLSETS.map((toolset) => [toolset, Object.values(AGENT_TOOLSET_LEXICON[toolset]).flat()]),
);

const TOOLSET_ROUTES: Record<AgentOnDemandToolset, readonly string[]> = {
  "record-model": ["/records", "/configure"],
  views: [],
  messaging: ["/inbox", "/calendar"],
  social: ["/social"],
  widgets: ["/dashboard"],
  webhooks: ["/company/webhooks"],
  routines: ["/routines"],
  admin: ["/company", "/profile"],
};

const ACTIVITY_KIND_TOOLSETS: Record<string, AgentOnDemandToolset> = {
  views: "views",
  messages: "messaging",
  accounts: "messaging",
  widgets: "widgets",
  webhooks: "webhooks",
  routines: "routines",
  team: "admin",
  profile: "admin",
};

const ACTIVITY_KIND_EXACT_TOOLSETS: Record<string, AgentOnDemandToolset> = {
  "workspace.settings": "admin",
  "workspace.configure": "admin",
};

const CONSEQUENCE_ACTION_TOOLSETS: Record<string, AgentOnDemandToolset> = {
  "social.invite": "social",
  "social.accept": "social",
  "social.cancel": "social",
  "salesList.save": "social",
  "external.manage": "social",
};

export function isAgentOnDemandToolset(value: unknown): value is AgentOnDemandToolset {
  return typeof value === "string" && (AGENT_ON_DEMAND_TOOLSETS as readonly string[]).includes(value);
}

export type AgentToolsetLookup = (toolName: string) => AgentOnDemandToolset | null;

function normalizeText(value: string): string {
  return value.toLocaleLowerCase("en-US").normalize("NFKC");
}

export function toolsetsForRequest(args: {
  text: string;
  pageRoute: string | null;
  contexts?: readonly AgentContextAttachment[];
}): Set<AgentOnDemandToolset> {
  const text = normalizeText(args.text);
  const route = args.pageRoute ? normalizeText(args.pageRoute).replace(/^\/[a-z]{2}(?=\/|$)/, "") : "";
  const matched = new Set<AgentOnDemandToolset>();
  if (agentViewRequestTarget(args.pageRoute).kind === "target") matched.add("views");
  if (args.contexts?.some((context) => context.reference.kind === "dataView")) matched.add("views");
  if (args.contexts?.some((context) => context.reference.kind === "widget")) matched.add("widgets");
  if (
    args.contexts?.some(
      ({ reference }) =>
        ["dataModel", "recordType", "recordField", "widget"].includes(reference.kind) ||
        (reference.kind === "record" && "typeId" in reference),
    )
  )
    matched.add("record-model");
  for (const toolset of AGENT_ON_DEMAND_TOOLSETS) {
    if (TOOLSET_TERMS.get(toolset)?.some((term) => text.includes(term))) matched.add(toolset);
    if (route && TOOLSET_ROUTES[toolset].some((prefix) => route === prefix || route.startsWith(`${prefix}/`)))
      matched.add(toolset);
  }
  return matched;
}

export function toolsetsFromActivities(
  activities: readonly { kind: string; consequence?: { action?: string } | null }[],
): Set<AgentOnDemandToolset> {
  const matched = new Set<AgentOnDemandToolset>();
  for (const activity of activities) {
    const exact = ACTIVITY_KIND_EXACT_TOOLSETS[activity.kind];
    if (exact) matched.add(exact);
    const byPrefix = ACTIVITY_KIND_TOOLSETS[activity.kind.split(".")[0] ?? ""];
    if (byPrefix) matched.add(byPrefix);
    const byAction = activity.consequence?.action ? CONSEQUENCE_ACTION_TOOLSETS[activity.consequence.action] : null;
    if (byAction) matched.add(byAction);
  }
  return matched;
}

type PromptLike = readonly unknown[] | undefined;

function toolCallsIn(messages: PromptLike): { toolName: string; input: unknown }[] {
  const calls: { toolName: string; input: unknown }[] = [];
  for (const message of messages ?? []) {
    const content = (message as { content?: unknown })?.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      const candidate = part as { type?: unknown; toolName?: unknown; input?: unknown };
      if (candidate?.type === "tool-call" && typeof candidate.toolName === "string")
        calls.push({ toolName: candidate.toolName, input: candidate.input });
    }
  }
  return calls;
}

export function toolsetsUsedInMessages(messages: PromptLike, toolsetOf: AgentToolsetLookup): Set<AgentOnDemandToolset> {
  const matched = new Set<AgentOnDemandToolset>();
  for (const call of toolCallsIn(messages)) {
    if (call.toolName === LOAD_TOOLSET_TOOL_NAME) {
      const toolset = (call.input as { toolset?: unknown } | null)?.toolset;
      if (isAgentOnDemandToolset(toolset)) matched.add(toolset);
      continue;
    }
    const toolset = toolsetOf(call.toolName);
    if (toolset) matched.add(toolset);
  }
  return matched;
}

export function activeAgentToolNames(args: {
  tools: readonly { name: string; toolset: string | null }[];
  initialToolsets: readonly string[];
  messages: PromptLike;
}): string[] {
  const toolsetOf: AgentToolsetLookup = (toolName) => {
    const toolset = args.tools.find((tool) => tool.name === toolName)?.toolset ?? null;
    return isAgentOnDemandToolset(toolset) ? toolset : null;
  };
  const active = new Set<AgentOnDemandToolset>(args.initialToolsets.filter(isAgentOnDemandToolset));
  for (const toolset of toolsetsUsedInMessages(args.messages, toolsetOf)) active.add(toolset);
  const everySetLoaded = AGENT_ON_DEMAND_TOOLSETS.every((toolset) => active.has(toolset));
  return args.tools
    .filter((tool) => !isAgentOnDemandToolset(tool.toolset) || active.has(tool.toolset))
    .filter((tool) => !everySetLoaded || tool.name !== LOAD_TOOLSET_TOOL_NAME)
    .map((tool) => tool.name);
}

export function toolsetIndexSentence(loadedToolsets: readonly string[] = []): string {
  const loaded = AGENT_ON_DEMAND_TOOLSETS.filter((toolset) => loadedToolsets.includes(toolset));
  const loadable = AGENT_ON_DEMAND_TOOLSETS.filter((toolset) => !loadedToolsets.includes(toolset));
  const always =
    "Tool sets: records, workspace, Knowledge Base, documentation, interface and support tools are always in your list.";
  const already = loaded.length > 0 ? ` Already loaded for this turn: ${loaded.join(", ")}.` : "";
  if (loadable.length === 0)
    return `${always}${already} Every on-demand set is loaded, so there is nothing left to load.`;

  const sets = loadable.map((toolset) => `${toolset} (${AGENT_TOOLSET_SUMMARY[toolset]})`).join("; ");
  return `${always}${already} These sets are not loaded yet: ${sets}. When a request needs one of them, call ${LOAD_TOOLSET_TOOL_NAME} with the set's name first, and never for a set that is already loaded; a loaded set stays available for the rest of the turn.`;
}
