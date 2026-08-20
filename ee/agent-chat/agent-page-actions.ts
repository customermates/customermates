import { appLocaleOrDefault, type AppLocale } from "@/i18n/locale-registry";

import type { AgentDataCounts, SuggestionPageId } from "./agent-chat.schema";
import type { AgentTranslator } from "./agent-translator";

export type AgentPageAction = {
  id: string;
  label: string;
  prompt: string;
};

type SupportedPage = SuggestionPageId;
type EntityPage = Extract<SupportedPage, "tasks" | "contacts" | "organizations" | "deals" | "services">;
type PageState = "empty" | "data";

export type AgentPageTerminology = Partial<Record<EntityPage, { singular: string; plural: string }>>;

type AgentPageCapabilities = {
  canCreate?: boolean;
  canSetupWorkspace?: boolean;
  terminology?: AgentPageTerminology;
};

const PAGE_ACTION_IDS: Record<SupportedPage, Record<PageState, readonly string[]>> = {
  dashboard: {
    empty: ["setup", "tour", "capabilities"],
    data: ["summary", "next-actions", "dashboard-tour"],
  },
  contacts: {
    empty: ["setup-contacts", "first-contact", "contacts-tour"],
    data: ["contacts-summary", "create-contact", "contacts-cleanup"],
  },
  organizations: {
    empty: ["setup-organizations", "first-organization", "organizations-tour"],
    data: ["organizations-summary", "create-organization", "organization-gaps"],
  },
  deals: {
    empty: ["setup-pipeline", "first-deal", "deals-tour"],
    data: ["pipeline-summary", "create-deal", "pipeline-gaps"],
  },
  services: {
    empty: ["setup-services", "first-service", "services-tour"],
    data: ["services-summary", "create-service", "service-gaps"],
  },
  tasks: {
    empty: ["setup-tasks", "first-task", "tasks-tour"],
    data: ["task-priorities", "create-task", "task-gaps"],
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

type TermRule = readonly [source: string, template: string];
type LocaleTermRules = { caseSensitive: boolean; rules: Record<EntityPage, readonly TermRule[]> };

const TERM_RULES: Partial<Record<AppLocale, LocaleTermRules>> = {
  en: {
    caseSensitive: false,
    rules: {
      contacts: [
        ["contacts", "{plural}"],
        ["contact", "{singular}"],
      ],
      organizations: [
        ["organizations", "{plural}"],
        ["organization", "{singular}"],
      ],
      deals: [
        ["deals", "{plural}"],
        ["deal", "{singular}"],
      ],
      services: [
        ["services or products", "{plural}"],
        ["service or product", "{singular}"],
        ["offerings", "{plural}"],
        ["offering", "{singular}"],
        ["services", "{plural}"],
        ["service", "{singular}"],
      ],
      tasks: [
        ["tasks", "{plural}"],
        ["task", "{singular}"],
      ],
    },
  },
  de: {
    caseSensitive: true,
    rules: {
      contacts: [
        ["Kontaktstruktur", "{singular}-Struktur"],
        ["Kontaktseite", "{singular}-Seite"],
        ["Kontakten", "{plural}"],
        ["Kontakte", "{plural}"],
        ["Kontakt", "{singular}"],
      ],
      organizations: [
        ["Organisationsstruktur", "{singular}-Struktur"],
        ["Organisationen", "{plural}"],
        ["Organisation", "{singular}"],
      ],
      deals: [
        ["Deal-Pipeline", "{singular}-Pipeline"],
        ["Deals", "{plural}"],
        ["Deal", "{singular}"],
      ],
      services: [
        ["Leistungen oder Produkte", "{plural}"],
        ["Leistung oder Produkt", "{singular}"],
        ["Angebote", "{plural}"],
        ["Angebot", "{singular}"],
        ["Leistungen", "{plural}"],
        ["Leistung", "{singular}"],
      ],
      tasks: [
        ["Aufgaben-Workflow", "{singular}-Workflow"],
        ["Aufgaben", "{plural}"],
        ["Aufgabe", "{singular}"],
      ],
    },
  },
};
export function agentPageState(page: SupportedPage, counts: AgentDataCounts): PageState {
  switch (page) {
    case "dashboard":
      return counts.contacts || counts.organizations || counts.deals || counts.services || counts.tasks
        ? "data"
        : "empty";
    case "inbox":
    case "connected-accounts":
      return counts.connectedAccounts ? "data" : "empty";
    case "default":
      return counts.contacts || counts.deals ? "data" : "empty";
    default:
      return counts[page] ? "data" : "empty";
  }
}

function isEntityPage(page: SupportedPage): page is EntityPage {
  return page === "tasks" || page === "contacts" || page === "organizations" || page === "deals" || page === "services";
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
  locale: string,
  capabilities: AgentPageCapabilities = {},
): AgentPageAction[] {
  const readOnly = readOnlyAgentPageActions(page, t);
  const writeGated = isEntityPage(page) || page === "dashboard";
  let actions: AgentPageAction[];

  if (writeGated && capabilities.canCreate === false) actions = readOnly;
  else {
    actions = PAGE_ACTION_IDS[page][state].map((id) => suggestionAction(page, state, id, t));
    if (writeGated && state === "empty" && page !== "dashboard" && capabilities.canSetupWorkspace === false)
      actions = [actions[1], actions[2], readOnly[0]];
  }

  return applyAgentPageTerminology(actions, locale, capabilities.terminology);
}

function readOnlyAgentPageActions(page: SupportedPage, t: AgentTranslator): AgentPageAction[] {
  return READ_ONLY_ACTION_IDS.map((id) => ({
    id: `${page}-${id}-read-only`,
    label: t(`AgentChat.suggestions.readOnly.${id}.label`),
    prompt: t(`AgentChat.suggestions.readOnly.${id}.prompt`),
  }));
}

function lowerFirst(value: string) {
  return value ? `${value[0].toLocaleLowerCase()}${value.slice(1)}` : value;
}

function replaceTerms(value: string, replacements: readonly (readonly [string, string])[], caseSensitive: boolean) {
  const escape = (source: string) => source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const ordered = [...replacements].sort(([left], [right]) => right.length - left.length);
  const pattern = ordered.map(([source]) => escape(source)).join("|");
  if (!pattern) return value;
  const bySource = new Map(
    ordered.map(([source, replacement]) => [caseSensitive ? source : source.toLowerCase(), replacement]),
  );
  return value.replace(new RegExp(pattern, caseSensitive ? "g" : "gi"), (match) => {
    const replacement = bySource.get(caseSensitive ? match : match.toLowerCase()) ?? match;
    return caseSensitive || /^[A-Z]/.test(match) ? replacement : lowerFirst(replacement);
  });
}

function applyAgentPageTerminology(
  actions: AgentPageAction[],
  locale: string,
  terminology: AgentPageTerminology | undefined,
) {
  const localeRules = TERM_RULES[appLocaleOrDefault(locale)];
  if (!terminology || !localeRules) return actions;

  const replacements: [string, string][] = [];
  for (const entity of Object.keys(localeRules.rules) as EntityPage[]) {
    const terms = terminology[entity];
    if (!terms) continue;
    for (const [source, template] of localeRules.rules[entity])
      replacements.push([source, template.replace("{singular}", terms.singular).replace("{plural}", terms.plural)]);
  }
  if (replacements.length === 0) return actions;

  return actions.map((action) => ({
    ...action,
    label: replaceTerms(action.label, replacements, localeRules.caseSensitive),
    prompt: replaceTerms(action.prompt, replacements, localeRules.caseSensitive),
  }));
}

export function agentActionPageFromPathname(pathname: string) {
  const segments = pathname.split(/[?#]/, 1)[0]?.split("/").filter(Boolean);
  const page = segments?.find((segment) => isAgentActionPage(segment as SuggestionPageId));
  return page && isAgentActionPage(page as SuggestionPageId) ? (page as SupportedPage) : null;
}

export function isAgentActionPage(page: SuggestionPageId): page is SupportedPage {
  return (
    page === "dashboard" ||
    page === "tasks" ||
    page === "contacts" ||
    page === "organizations" ||
    page === "deals" ||
    page === "services"
  );
}
