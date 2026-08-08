import type { AgentDataCounts, SuggestionPageId } from "./agent-chat.schema";

export type AgentPageAction = {
  id: string;
  label: string;
  prompt: string;
};

type SupportedPage = SuggestionPageId;
type EntityPage = Extract<SupportedPage, "tasks" | "contacts" | "organizations" | "deals" | "services">;
type PageState = "empty" | "data";
type Catalog = Record<SupportedPage, Record<PageState, AgentPageAction[]>>;

export type AgentPageTerminology = Partial<Record<EntityPage, { singular: string; plural: string }>>;

type AgentPageCapabilities = {
  canCreate?: boolean;
  canSetupWorkspace?: boolean;
  terminology?: AgentPageTerminology;
};

const EN: Catalog = {
  dashboard: {
    empty: [
      {
        id: "setup",
        label: "Set up my workspace",
        prompt:
          "Help me set up Customermates for my business. Ask me a few focused questions before proposing any changes.",
      },
      {
        id: "tour",
        label: "Show me around",
        prompt: "Give me an in-depth guided tour of Customermates and explain how the core areas work together.",
      },
      {
        id: "capabilities",
        label: "What can I automate?",
        prompt: "Based on this page, explain the most useful work you can automate for me in Customermates.",
      },
    ],
    data: [
      {
        id: "summary",
        label: "Summarize my workspace",
        prompt: "Give me a concise, decision-ready summary of my workspace.",
      },
      {
        id: "next-actions",
        label: "Recommend next actions",
        prompt: "Review my CRM and recommend the three highest-value next actions.",
      },
      {
        id: "dashboard-tour",
        label: "Explain this dashboard",
        prompt: "Walk me through this dashboard and explain what each area tells me.",
      },
    ],
  },
  contacts: {
    empty: [
      {
        id: "setup-contacts",
        label: "Set up contacts",
        prompt: "Help me design and create a minimal contact setup for my business. Ask about my use case first.",
      },
      {
        id: "first-contact",
        label: "Create my first contact",
        prompt: "Help me create my first contact. Ask for only the details you need.",
      },
      {
        id: "contacts-tour",
        label: "Learn how contacts work",
        prompt: "Show me around the contacts page and explain how contacts connect to the rest of the CRM.",
      },
    ],
    data: [
      {
        id: "contacts-summary",
        label: "Summarize contacts",
        prompt: "Summarize my contacts and point out useful patterns or missing information.",
      },
      {
        id: "create-contact",
        label: "Create a contact",
        prompt: "Help me create a contact. Ask for only the required details.",
      },
      {
        id: "contacts-cleanup",
        label: "Find data gaps",
        prompt: "Review my contacts for missing or inconsistent information and suggest what to fix.",
      },
    ],
  },
  organizations: {
    empty: [
      {
        id: "setup-organizations",
        label: "Set up organizations",
        prompt: "Help me design and create a minimal organization setup for my business. Ask about my use case first.",
      },
      {
        id: "first-organization",
        label: "Create my first organization",
        prompt: "Help me create my first organization and connect the right people or deals.",
      },
      {
        id: "organizations-tour",
        label: "Learn how organizations work",
        prompt: "Show me around organizations and explain how they connect contacts, deals, and tasks.",
      },
    ],
    data: [
      {
        id: "organizations-summary",
        label: "Summarize organizations",
        prompt: "Summarize my organizations and highlight the relationships that deserve attention.",
      },
      {
        id: "create-organization",
        label: "Create an organization",
        prompt: "Help me create an organization and link the relevant records.",
      },
      {
        id: "organization-gaps",
        label: "Find relationship gaps",
        prompt: "Find organizations missing useful contact, deal, or task relationships.",
      },
    ],
  },
  deals: {
    empty: [
      {
        id: "setup-pipeline",
        label: "Set up my pipeline",
        prompt:
          "Help me design a minimal sales pipeline for my business, then propose the fields and example deals to create.",
      },
      {
        id: "first-deal",
        label: "Create my first deal",
        prompt: "Help me create my first deal and link the right organization, contacts, and services.",
      },
      {
        id: "deals-tour",
        label: "Learn how deals work",
        prompt: "Show me around deals and explain how to manage a pipeline in Customermates.",
      },
    ],
    data: [
      {
        id: "pipeline-summary",
        label: "Summarize my pipeline",
        prompt: "Summarize my deal pipeline, risks, and most useful next actions.",
      },
      {
        id: "create-deal",
        label: "Create a deal",
        prompt: "Help me create a deal and connect all relevant records.",
      },
      {
        id: "pipeline-gaps",
        label: "Find pipeline gaps",
        prompt: "Review my deals for missing relationships, values, or next steps.",
      },
    ],
  },
  services: {
    empty: [
      {
        id: "setup-services",
        label: "Set up my offerings",
        prompt: "Help me define a minimal set of services or products for my business and create them after review.",
      },
      {
        id: "first-service",
        label: "Create my first offering",
        prompt: "Help me create my first service or product with the right name and price.",
      },
      {
        id: "services-tour",
        label: "Learn how offerings work",
        prompt: "Show me around services and explain how offerings connect to deals and tasks.",
      },
    ],
    data: [
      {
        id: "services-summary",
        label: "Summarize offerings",
        prompt: "Summarize my services or products and how they are used in deals.",
      },
      {
        id: "create-service",
        label: "Create an offering",
        prompt: "Help me create a service or product with the right commercial details.",
      },
      {
        id: "service-gaps",
        label: "Find catalog gaps",
        prompt: "Review my services or products for missing prices, relationships, or duplicated offerings.",
      },
    ],
  },
  tasks: {
    empty: [
      {
        id: "setup-tasks",
        label: "Set up my workflow",
        prompt:
          "Help me design a minimal task workflow for my business and propose the fields and first tasks to create.",
      },
      {
        id: "first-task",
        label: "Create my first task",
        prompt: "Help me create my first task and connect it to the right records.",
      },
      {
        id: "tasks-tour",
        label: "Learn how tasks work",
        prompt: "Show me around tasks and explain how they connect to contacts, organizations, deals, and services.",
      },
    ],
    data: [
      {
        id: "task-priorities",
        label: "Plan my next actions",
        prompt: "Review my tasks and related CRM data, then recommend what I should do next.",
      },
      {
        id: "create-task",
        label: "Create a task",
        prompt: "Help me create a task and connect it to the right records.",
      },
      {
        id: "task-gaps",
        label: "Find follow-up gaps",
        prompt: "Find important records that appear to be missing a clear follow-up task.",
      },
    ],
  },
  inbox: {
    empty: [
      {
        id: "inbox-connect-email",
        label: "Connect my email",
        prompt: "Walk me through connecting my email account to the Customermates inbox.",
      },
      {
        id: "inbox-connect-whatsapp",
        label: "Connect WhatsApp",
        prompt: "Walk me through connecting WhatsApp to the Customermates inbox.",
      },
      {
        id: "inbox-explain",
        label: "Show me how the inbox works",
        prompt: "Explain how the Customermates inbox works and how it relates to my CRM records.",
      },
    ],
    data: [
      {
        id: "inbox-needs-reply",
        label: "Which conversations need a reply?",
        prompt: "Review my inbox and tell me which conversations still need a reply, most urgent first.",
      },
      {
        id: "inbox-explain-data",
        label: "Show me how the inbox works",
        prompt: "Explain how the Customermates inbox works and how it relates to my CRM records.",
      },
      {
        id: "inbox-add-channel",
        label: "Connect another channel",
        prompt: "Walk me through connecting another messaging channel to Customermates.",
      },
    ],
  },
  "connected-accounts": {
    empty: [
      {
        id: "accounts-connect-email",
        label: "Connect my email",
        prompt: "Walk me through connecting my email account to Customermates.",
      },
      {
        id: "accounts-connect-whatsapp",
        label: "Connect WhatsApp",
        prompt: "Walk me through connecting WhatsApp to Customermates.",
      },
      {
        id: "accounts-connect-linkedin",
        label: "Connect LinkedIn",
        prompt: "Walk me through connecting LinkedIn to Customermates.",
      },
    ],
    data: [
      {
        id: "accounts-list",
        label: "Which accounts are connected?",
        prompt: "Tell me which messaging accounts are connected and what each one currently covers.",
      },
      {
        id: "accounts-add-channel",
        label: "Add another channel",
        prompt: "Walk me through adding another messaging channel to Customermates.",
      },
      {
        id: "accounts-sync",
        label: "How does syncing work?",
        prompt: "Explain how Customermates syncs connected accounts and what it does with the messages it imports.",
      },
    ],
  },
  default: {
    empty: [
      {
        id: "default-capabilities",
        label: "What can you do?",
        prompt: "Explain what you can do for me in Customermates and where you are most useful.",
      },
      {
        id: "default-import",
        label: "How do I import my contacts?",
        prompt: "Walk me through importing my existing contacts into Customermates.",
      },
      {
        id: "default-setup",
        label: "Help me set up my CRM",
        prompt:
          "Help me set up Customermates for my business. Ask me a few focused questions before proposing any changes.",
      },
    ],
    data: [
      {
        id: "default-contact-count",
        label: "How many contacts do we have?",
        prompt: "Tell me how many contacts we have and how that has been trending.",
      },
      {
        id: "default-open-deals",
        label: "What deals are open?",
        prompt: "Summarize the deals that are currently open and where each one stands.",
      },
      {
        id: "default-tour",
        label: "Show me around the app",
        prompt: "Give me an in-depth guided tour of Customermates and explain how the core areas work together.",
      },
    ],
  },
};

const DE: Catalog = {
  dashboard: {
    empty: [
      {
        id: "setup",
        label: "Workspace einrichten",
        prompt:
          "Hilf mir, Customermates für mein Unternehmen einzurichten. Stelle zuerst wenige gezielte Fragen, bevor du Änderungen vorschlägst.",
      },
      {
        id: "tour",
        label: "Plattform kennenlernen",
        prompt: "Gib mir eine ausführliche Tour durch Customermates und erkläre, wie die Kernbereiche zusammenspielen.",
      },
      {
        id: "capabilities",
        label: "Was kann ich automatisieren?",
        prompt:
          "Erkläre mir passend zu dieser Seite, welche Aufgaben du in Customermates am sinnvollsten automatisieren kannst.",
      },
    ],
    data: [
      {
        id: "summary",
        label: "Workspace zusammenfassen",
        prompt: "Gib mir eine kurze, entscheidungsorientierte Zusammenfassung meines Workspaces.",
      },
      {
        id: "next-actions",
        label: "Nächste Schritte empfehlen",
        prompt: "Prüfe mein CRM und empfehle die drei wertvollsten nächsten Schritte.",
      },
      {
        id: "dashboard-tour",
        label: "Dashboard erklären",
        prompt: "Führe mich durch dieses Dashboard und erkläre, was mir die einzelnen Bereiche zeigen.",
      },
    ],
  },
  contacts: {
    empty: [
      {
        id: "setup-contacts",
        label: "Kontakte einrichten",
        prompt:
          "Hilf mir, eine minimale Kontaktstruktur für mein Unternehmen zu planen und anzulegen. Frage zuerst nach meinem Anwendungsfall.",
      },
      {
        id: "first-contact",
        label: "Ersten Kontakt erstellen",
        prompt: "Hilf mir, meinen ersten Kontakt zu erstellen. Frage nur die nötigen Angaben ab.",
      },
      {
        id: "contacts-tour",
        label: "Kontakte kennenlernen",
        prompt: "Zeige mir die Kontaktseite und erkläre, wie Kontakte mit dem restlichen CRM verbunden sind.",
      },
    ],
    data: [
      {
        id: "contacts-summary",
        label: "Kontakte zusammenfassen",
        prompt: "Fasse meine Kontakte zusammen und zeige nützliche Muster oder fehlende Informationen.",
      },
      {
        id: "create-contact",
        label: "Kontakt erstellen",
        prompt: "Hilf mir, einen Kontakt zu erstellen. Frage nur die nötigen Angaben ab.",
      },
      {
        id: "contacts-cleanup",
        label: "Datenlücken finden",
        prompt: "Prüfe meine Kontakte auf fehlende oder uneinheitliche Angaben und schlage Verbesserungen vor.",
      },
    ],
  },
  organizations: {
    empty: [
      {
        id: "setup-organizations",
        label: "Organisationen einrichten",
        prompt:
          "Hilf mir, eine minimale Organisationsstruktur für mein Unternehmen zu planen und anzulegen. Frage zuerst nach meinem Anwendungsfall.",
      },
      {
        id: "first-organization",
        label: "Erste Organisation erstellen",
        prompt: "Hilf mir, meine erste Organisation zu erstellen und passende Personen oder Deals zu verknüpfen.",
      },
      {
        id: "organizations-tour",
        label: "Organisationen kennenlernen",
        prompt: "Zeige mir Organisationen und erkläre ihre Verbindung zu Kontakten, Deals und Aufgaben.",
      },
    ],
    data: [
      {
        id: "organizations-summary",
        label: "Organisationen zusammenfassen",
        prompt: "Fasse meine Organisationen zusammen und hebe wichtige Beziehungen hervor.",
      },
      {
        id: "create-organization",
        label: "Organisation erstellen",
        prompt: "Hilf mir, eine Organisation zu erstellen und die passenden Datensätze zu verknüpfen.",
      },
      {
        id: "organization-gaps",
        label: "Beziehungslücken finden",
        prompt: "Finde Organisationen, denen sinnvolle Kontakte, Deals oder Aufgaben fehlen.",
      },
    ],
  },
  deals: {
    empty: [
      {
        id: "setup-pipeline",
        label: "Pipeline einrichten",
        prompt:
          "Hilf mir, eine minimale Vertriebspipeline zu planen, und schlage danach passende Felder und Beispiel-Deals vor.",
      },
      {
        id: "first-deal",
        label: "Ersten Deal erstellen",
        prompt:
          "Hilf mir, meinen ersten Deal zu erstellen und passende Organisationen, Kontakte und Leistungen zu verknüpfen.",
      },
      {
        id: "deals-tour",
        label: "Deals kennenlernen",
        prompt: "Zeige mir Deals und erkläre, wie eine Pipeline in Customermates verwaltet wird.",
      },
    ],
    data: [
      {
        id: "pipeline-summary",
        label: "Pipeline zusammenfassen",
        prompt: "Fasse meine Deal-Pipeline, Risiken und die sinnvollsten nächsten Schritte zusammen.",
      },
      {
        id: "create-deal",
        label: "Deal erstellen",
        prompt: "Hilf mir, einen Deal zu erstellen und alle relevanten Datensätze zu verknüpfen.",
      },
      {
        id: "pipeline-gaps",
        label: "Pipeline-Lücken finden",
        prompt: "Prüfe meine Deals auf fehlende Beziehungen, Werte oder nächste Schritte.",
      },
    ],
  },
  services: {
    empty: [
      {
        id: "setup-services",
        label: "Angebot einrichten",
        prompt:
          "Hilf mir, eine minimale Auswahl an Leistungen oder Produkten für mein Unternehmen zu definieren und nach meiner Prüfung anzulegen.",
      },
      {
        id: "first-service",
        label: "Erstes Angebot erstellen",
        prompt: "Hilf mir, meine erste Leistung oder mein erstes Produkt mit passendem Namen und Preis zu erstellen.",
      },
      {
        id: "services-tour",
        label: "Angebote kennenlernen",
        prompt: "Zeige mir Leistungen und erkläre, wie Angebote mit Deals und Aufgaben verbunden sind.",
      },
    ],
    data: [
      {
        id: "services-summary",
        label: "Angebote zusammenfassen",
        prompt: "Fasse meine Leistungen oder Produkte und ihre Verwendung in Deals zusammen.",
      },
      {
        id: "create-service",
        label: "Angebot erstellen",
        prompt: "Hilf mir, eine Leistung oder ein Produkt mit den passenden kaufmännischen Angaben zu erstellen.",
      },
      {
        id: "service-gaps",
        label: "Kataloglücken finden",
        prompt: "Prüfe meine Leistungen oder Produkte auf fehlende Preise, Beziehungen oder Dubletten.",
      },
    ],
  },
  tasks: {
    empty: [
      {
        id: "setup-tasks",
        label: "Workflow einrichten",
        prompt:
          "Hilf mir, einen minimalen Aufgaben-Workflow zu planen, und schlage passende Felder und erste Aufgaben vor.",
      },
      {
        id: "first-task",
        label: "Erste Aufgabe erstellen",
        prompt: "Hilf mir, meine erste Aufgabe zu erstellen und mit den passenden Datensätzen zu verknüpfen.",
      },
      {
        id: "tasks-tour",
        label: "Aufgaben kennenlernen",
        prompt: "Zeige mir Aufgaben und erkläre ihre Verbindung zu Kontakten, Organisationen, Deals und Leistungen.",
      },
    ],
    data: [
      {
        id: "task-priorities",
        label: "Nächste Schritte planen",
        prompt: "Prüfe meine Aufgaben und verknüpften CRM-Daten und empfehle, was ich als Nächstes tun sollte.",
      },
      {
        id: "create-task",
        label: "Aufgabe erstellen",
        prompt: "Hilf mir, eine Aufgabe zu erstellen und mit den passenden Datensätzen zu verknüpfen.",
      },
      {
        id: "task-gaps",
        label: "Follow-up-Lücken finden",
        prompt: "Finde wichtige Datensätze, denen eine klare Follow-up-Aufgabe fehlt.",
      },
    ],
  },
  inbox: {
    empty: [
      {
        id: "inbox-connect-email",
        label: "E-Mail verbinden",
        prompt: "Führe mich durch das Verbinden meines E-Mail-Kontos mit dem Customermates-Posteingang.",
      },
      {
        id: "inbox-connect-whatsapp",
        label: "WhatsApp verbinden",
        prompt: "Führe mich durch das Verbinden von WhatsApp mit dem Customermates-Posteingang.",
      },
      {
        id: "inbox-explain",
        label: "Zeig mir, wie der Posteingang funktioniert",
        prompt:
          "Erkläre, wie der Customermates-Posteingang funktioniert und wie er mit meinen CRM-Daten zusammenhängt.",
      },
    ],
    data: [
      {
        id: "inbox-needs-reply",
        label: "Welche Unterhaltungen brauchen eine Antwort?",
        prompt: "Sieh meinen Posteingang durch und nenne mir die Unterhaltungen, die noch eine Antwort brauchen.",
      },
      {
        id: "inbox-explain-data",
        label: "Zeig mir, wie der Posteingang funktioniert",
        prompt:
          "Erkläre, wie der Customermates-Posteingang funktioniert und wie er mit meinen CRM-Daten zusammenhängt.",
      },
      {
        id: "inbox-add-channel",
        label: "Weiteren Kanal verbinden",
        prompt: "Führe mich durch das Verbinden eines weiteren Nachrichtenkanals mit Customermates.",
      },
    ],
  },
  "connected-accounts": {
    empty: [
      {
        id: "accounts-connect-email",
        label: "E-Mail verbinden",
        prompt: "Führe mich durch das Verbinden meines E-Mail-Kontos mit Customermates.",
      },
      {
        id: "accounts-connect-whatsapp",
        label: "WhatsApp verbinden",
        prompt: "Führe mich durch das Verbinden von WhatsApp mit Customermates.",
      },
      {
        id: "accounts-connect-linkedin",
        label: "LinkedIn verbinden",
        prompt: "Führe mich durch das Verbinden von LinkedIn mit Customermates.",
      },
    ],
    data: [
      {
        id: "accounts-list",
        label: "Welche Konten sind verbunden?",
        prompt: "Nenne mir die verbundenen Nachrichtenkonten und was jedes davon aktuell abdeckt.",
      },
      {
        id: "accounts-add-channel",
        label: "Weiteren Kanal hinzufügen",
        prompt: "Führe mich durch das Hinzufügen eines weiteren Nachrichtenkanals zu Customermates.",
      },
      {
        id: "accounts-sync",
        label: "Wie funktioniert die Synchronisierung?",
        prompt:
          "Erkläre, wie Customermates verbundene Konten synchronisiert und was mit importierten Nachrichten passiert.",
      },
    ],
  },
  default: {
    empty: [
      {
        id: "default-capabilities",
        label: "Was kannst du?",
        prompt: "Erkläre, was du in Customermates für mich tun kannst und wo du am nützlichsten bist.",
      },
      {
        id: "default-import",
        label: "Wie importiere ich meine Kontakte?",
        prompt: "Führe mich durch den Import meiner bestehenden Kontakte in Customermates.",
      },
      {
        id: "default-setup",
        label: "Hilf mir bei der Einrichtung",
        prompt:
          "Hilf mir, Customermates für mein Unternehmen einzurichten. Stelle mir zuerst ein paar gezielte Fragen, bevor du Änderungen vorschlägst.",
      },
    ],
    data: [
      {
        id: "default-contact-count",
        label: "Wie viele Kontakte haben wir?",
        prompt: "Nenne mir die Anzahl unserer Kontakte und wie sich diese zuletzt entwickelt hat.",
      },
      {
        id: "default-open-deals",
        label: "Welche Deals sind offen?",
        prompt: "Fasse zusammen, welche Deals aktuell offen sind und wo jeder davon steht.",
      },
      {
        id: "default-tour",
        label: "Zeig mir die App",
        prompt:
          "Gib mir eine ausführliche geführte Tour durch Customermates und erkläre, wie die Bereiche zusammenspielen.",
      },
    ],
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

export function agentPageActions(
  page: SupportedPage,
  state: PageState,
  locale: string,
  capabilities: AgentPageCapabilities = {},
): AgentPageAction[] {
  const readOnly = readOnlyAgentPageActions(page, locale);
  const writeGated = isEntityPage(page) || page === "dashboard";
  let actions: AgentPageAction[];

  if (writeGated && capabilities.canCreate === false) actions = readOnly;
  else {
    actions = (locale.toLowerCase().startsWith("de") ? DE : EN)[page][state];
    if (writeGated && state === "empty" && page !== "dashboard" && capabilities.canSetupWorkspace === false)
      actions = [actions[1], actions[2], readOnly[0]];
  }

  return applyAgentPageTerminology(actions, locale, capabilities.terminology);
}

function readOnlyAgentPageActions(page: SupportedPage, locale: string): AgentPageAction[] {
  const de = locale.toLowerCase().startsWith("de");
  return [
    {
      id: `${page}-explain-read-only`,
      label: de ? "Diese Seite erklären" : "Explain this page",
      prompt: de
        ? "Erkläre mir diese Seite, ihre wichtigsten Informationen und wie ich sie sinnvoll nutze. Nimm keine Änderungen vor."
        : "Explain this page, its most important information, and how to use it well. Do not make any changes.",
    },
    {
      id: `${page}-relationships-read-only`,
      label: de ? "Zusammenhänge zeigen" : "Show how it connects",
      prompt: de
        ? "Erkläre, wie diese Seite mit den anderen Bereichen von Customermates zusammenspielt. Nimm keine Änderungen vor."
        : "Explain how this page connects to the other areas of Customermates. Do not make any changes.",
    },
    {
      id: `${page}-tour-read-only`,
      label: de ? "Geführte Tour starten" : "Take a guided tour",
      prompt: de
        ? "Führe mich ausführlich durch diese Seite, ohne Daten zu verändern."
        : "Give me an in-depth guided tour of this page without changing any data.",
    },
  ];
}

function lowerFirst(value: string) {
  return value ? `${value[0].toLocaleLowerCase()}${value.slice(1)}` : value;
}

function replaceTerms(value: string, replacements: readonly (readonly [string, string])[], locale: string) {
  const escape = (source: string) => source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const ordered = [...replacements].sort(([left], [right]) => right.length - left.length);
  const pattern = ordered.map(([source]) => escape(source)).join("|");
  if (!pattern) return value;
  const german = locale.toLowerCase().startsWith("de");
  const bySource = new Map(
    ordered.map(([source, replacement]) => [german ? source : source.toLowerCase(), replacement]),
  );
  return value.replace(new RegExp(pattern, german ? "g" : "gi"), (match) => {
    const replacement = bySource.get(german ? match : match.toLowerCase()) ?? match;
    return german || /^[A-Z]/.test(match) ? replacement : lowerFirst(replacement);
  });
}

function applyAgentPageTerminology(
  actions: AgentPageAction[],
  locale: string,
  terminology: AgentPageTerminology | undefined,
) {
  if (!terminology) return actions;
  const de = locale.toLowerCase().startsWith("de");

  return actions.map((action) => {
    const replacements: [string, string][] = [];
    const replace = (source: string, replacement: string) => {
      replacements.push([source, replacement]);
    };

    const contacts = terminology.contacts;
    if (contacts) {
      if (de) {
        replace("Kontaktstruktur", `${contacts.singular}-Struktur`);
        replace("Kontaktseite", `${contacts.singular}-Seite`);
        replace("Kontakten", contacts.plural);
        replace("Kontakte", contacts.plural);
        replace("Kontakt", contacts.singular);
      } else {
        replace("contacts", contacts.plural);
        replace("contact", contacts.singular);
      }
    }

    const organizations = terminology.organizations;
    if (organizations) {
      if (de) {
        replace("Organisationsstruktur", `${organizations.singular}-Struktur`);
        replace("Organisationen", organizations.plural);
        replace("Organisation", organizations.singular);
      } else {
        replace("organizations", organizations.plural);
        replace("organization", organizations.singular);
      }
    }

    const deals = terminology.deals;
    if (deals) {
      if (de) {
        replace("Deal-Pipeline", `${deals.singular}-Pipeline`);
        replace("Deals", deals.plural);
        replace("Deal", deals.singular);
      } else {
        replace("deals", deals.plural);
        replace("deal", deals.singular);
      }
    }

    const services = terminology.services;
    if (services) {
      if (de) {
        replace("Leistungen oder Produkte", services.plural);
        replace("Leistung oder Produkt", services.singular);
        replace("Angebote", services.plural);
        replace("Angebot", services.singular);
        replace("Leistungen", services.plural);
        replace("Leistung", services.singular);
      } else {
        replace("services or products", services.plural);
        replace("service or product", services.singular);
        replace("offerings", services.plural);
        replace("offering", services.singular);
        replace("services", services.plural);
        replace("service", services.singular);
      }
    }

    const tasks = terminology.tasks;
    if (tasks) {
      if (de) {
        replace("Aufgaben-Workflow", `${tasks.singular}-Workflow`);
        replace("Aufgaben", tasks.plural);
        replace("Aufgabe", tasks.singular);
      } else {
        replace("tasks", tasks.plural);
        replace("task", tasks.singular);
      }
    }

    return {
      ...action,
      label: replaceTerms(action.label, replacements, locale),
      prompt: replaceTerms(action.prompt, replacements, locale),
    };
  });
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
