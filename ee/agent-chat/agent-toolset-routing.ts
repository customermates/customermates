import { agentViewRequestTarget } from "./agent-page-context";

export const AGENT_CORE_TOOLSETS = ["records", "workspace", "docs", "custom-columns", "support"] as const;
export const AGENT_ON_DEMAND_TOOLSETS = [
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

export const AGENT_TOOLSET_SUMMARY: Record<AgentOnDemandToolset, string> = {
  views: "saved views, filters, sorting, grouping and layouts",
  messaging: "inbox, email, chat, calendar and connected messaging accounts",
  social: "LinkedIn, Instagram, posts, profiles, engagement and Sales Navigator",
  widgets: "dashboard widgets",
  webhooks: "webhooks and their deliveries",
  routines: "routines: scheduled or event-driven automations",
  admin: "team members, terminology, workspace settings and profile",
};

const TOOLSET_LEXICON: Record<AgentOnDemandToolset, readonly string[]> = {
  views: [
    "saved view",
    "current view",
    "new view",
    "my view",
    "create a view",
    "update a view",
    "delete a view",
    "gespeicherte ansicht",
    "aktuelle ansicht",
    "neue ansicht",
    "meine ansicht",
    "ansicht erstellen",
    "ansicht löschen",
    "vista guardada",
    "vista actual",
    "nueva vista",
    "mi vista",
    "crear una vista",
    "vue enregistrée",
    "vue actuelle",
    "nouvelle vue",
    "ma vue",
    "créer une vue",
    "vista salvata",
    "vista attuale",
    "nuova vista",
    "mia vista",
    "crea una vista",
    "kanban",
  ],
  messaging: [
    "email",
    "e-mail",
    "mail",
    "inbox",
    "thread",
    "message",
    "chat",
    "whatsapp",
    "telegram",
    "calendar",
    "meeting",
    "reply",
    "draft",
    "conversation",
    "nachricht",
    "posteingang",
    "termin",
    "kalender",
    "antwort",
    "entwurf",
    "unterhaltung",
  ],
  social: [
    "linkedin",
    "instagram",
    "post",
    "profile",
    "engagement",
    "connection request",
    "sales navigator",
    "prospect",
    "lead list",
    "follower",
    "kontaktanfrage",
    "profil",
    "beitrag",
  ],
  widgets: ["widget", "dashboard", "chart", "kpi", "tile", "diagramm", "kachel"],
  webhooks: ["webhook", "delivery", "endpoint", "zustellung"],
  routines: [
    "routine",
    "schedule",
    "automation",
    "automate",
    "cron",
    "recurring",
    "every morning",
    "every week",
    "every day",
    "remind me",
    "zeitplan",
    "automatisch",
    "automatisier",
    "wiederkehrend",
    "jeden morgen",
    "jede woche",
    "jeden tag",
    "erinnere mich",
  ],
  admin: [
    "team member",
    "teammate",
    "invite",
    "role",
    "permission",
    "terminology",
    "rename",
    "currency",
    "workspace setting",
    "avatar",
    "my name",
    "teammitglied",
    "einladen",
    "rolle",
    "berechtigung",
    "terminologie",
    "umbenennen",
    "währung",
    "einstellung",
  ],
};

const TOOLSET_ROUTES: Record<AgentOnDemandToolset, readonly string[]> = {
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
  "workspace.terminology": "admin",
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

export function toolsetsForRequest(args: { text: string; pageRoute: string | null }): Set<AgentOnDemandToolset> {
  const text = normalizeText(args.text);
  const route = args.pageRoute ? normalizeText(args.pageRoute).replace(/^\/[a-z]{2}(?=\/|$)/, "") : "";
  const matched = new Set<AgentOnDemandToolset>();
  if (agentViewRequestTarget(args.pageRoute).kind === "target") matched.add("views");
  for (const toolset of AGENT_ON_DEMAND_TOOLSETS) {
    if (TOOLSET_LEXICON[toolset].some((term) => text.includes(term))) matched.add(toolset);
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
    "Tool sets: records, workspace, documentation, custom fields, interface and support tools are always in your list.";
  const already = loaded.length > 0 ? ` Already loaded for this turn: ${loaded.join(", ")}.` : "";
  if (loadable.length === 0)
    return `${always}${already} Every on-demand set is loaded, so there is nothing left to load.`;

  const sets = loadable.map((toolset) => `${toolset} (${AGENT_TOOLSET_SUMMARY[toolset]})`).join("; ");
  return `${always}${already} These sets are not loaded yet: ${sets}. When a request needs one of them, call ${LOAD_TOOLSET_TOOL_NAME} with the set's name first, and never for a set that is already loaded; a loaded set stays available for the rest of the turn.`;
}
