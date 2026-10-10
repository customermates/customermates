import type { AgentDataCounts, SuggestionPageId } from "./agent-chat.schema";
import type { AgentTranslator } from "./agent-activity";

export type AgentPageAction = {
  id: string;
  label: string;
  prompt: string;
};

type SupportedPage = SuggestionPageId;
type PageState = "empty" | "data";

type AgentPageCapabilities = {
  canCreate?: boolean;
};

export const WIKI_WEBSITE_SETUP_ACTION_ID = "first-wiki-page";

const PAGE_ACTION_IDS: Record<SupportedPage, Record<PageState, readonly string[]>> = {
  dashboard: {
    empty: ["setup", "tour", "capabilities"],
    data: ["summary", "next-actions", "dashboard-tour"],
  },
  routines: {
    empty: ["first-routine", "routine-ideas", "routines-tour"],
    data: ["routine-health", "create-routine", "routines-tour-data"],
  },
  wiki: {
    empty: ["first-wiki-page", "wiki-structure", "wiki-tour"],
    data: ["wiki-summary", "create-wiki-page", "wiki-gaps"],
  },
  inbox: {
    empty: ["inbox-connect-email", "inbox-connect-whatsapp", "inbox-explain"],
    data: ["inbox-needs-reply", "inbox-explain-data", "inbox-add-channel"],
  },
  "connected-accounts": {
    empty: ["accounts-connect-email", "accounts-connect-whatsapp", "accounts-connect-linkedin"],
    data: ["accounts-list", "accounts-add-channel", "accounts-sync"],
  },
  default: {
    empty: ["default-capabilities", "default-import", "default-setup"],
    data: ["default-contact-count", "default-open-deals", "default-tour"],
  },
};

const READ_ONLY_ACTION_IDS = ["explain", "relationships", "tour"] as const;

export function agentPageState(page: SupportedPage, counts: AgentDataCounts): PageState {
  switch (page) {
    case "dashboard":
      return counts.widgets ? "data" : "empty";
    case "inbox":
    case "connected-accounts":
      return counts.connectedAccounts ? "data" : "empty";
    case "default":
      return counts.contacts || counts.deals ? "data" : "empty";
    default:
      return counts[page] ? "data" : "empty";
  }
}

function suggestionAction(page: SupportedPage, state: PageState, id: string, t: AgentTranslator) {
  return {
    id,
    label: t(`AgentChat.suggestions.pages.${page}.${state}.${id}.label`),
    prompt: t(`AgentChat.suggestions.pages.${page}.${state}.${id}.prompt`),
  };
}

export function agentPageActions(
  page: SupportedPage,
  state: PageState,
  t: AgentTranslator,
  capabilities: AgentPageCapabilities = {},
): AgentPageAction[] {
  const readOnly = readOnlyAgentPageActions(page, t);
  const writeGated = page === "dashboard" || page === "routines" || page === "wiki";
  if (writeGated && capabilities.canCreate === false) return readOnly;
  return PAGE_ACTION_IDS[page][state].map((id) => suggestionAction(page, state, id, t));
}

function readOnlyAgentPageActions(page: SupportedPage, t: AgentTranslator): AgentPageAction[] {
  return READ_ONLY_ACTION_IDS.map((id) => ({
    id: `${page}-${id}-read-only`,
    label: t(`AgentChat.suggestions.readOnly.${id}.label`),
    prompt: t(`AgentChat.suggestions.readOnly.${id}.prompt`),
  }));
}

export function agentActionPageFromPathname(pathname: string) {
  const segments = pathname.split(/[?#]/, 1)[0]?.split("/").filter(Boolean);
  const page = segments?.find((segment) => isAgentActionPage(segment as SuggestionPageId));
  return page && isAgentActionPage(page as SuggestionPageId) ? (page as SupportedPage) : null;
}

export function isAgentActionPage(page: SuggestionPageId): page is SupportedPage {
  return page === "dashboard";
}
