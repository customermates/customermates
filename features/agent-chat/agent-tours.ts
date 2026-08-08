import { z } from "zod";

export const AGENT_TOUR_IDS = [
  "platform",
  "dashboard",
  "contacts",
  "organizations",
  "deals",
  "services",
  "tasks",
] as const;

export const AgentTourIdSchema = z.enum(AGENT_TOUR_IDS);
export type AgentTourId = z.infer<typeof AgentTourIdSchema>;

export type AgentGuidedTourStep = {
  targetId: string;
  route: string | null;
  note: string;
};

type LocalizedStep = Omit<AgentGuidedTourStep, "note"> & {
  en: string;
  de: string;
};

const PAGE_TOURS: Record<Exclude<AgentTourId, "platform">, LocalizedStep[]> = {
  dashboard: [
    {
      targetId: "nav-dashboard",
      route: "/dashboard",
      en: "The dashboard is your at-a-glance view of the work that matters. Each card answers one operational question.",
      de: "Das Dashboard zeigt dir die wichtigsten Vorgänge auf einen Blick. Jede Karte beantwortet eine konkrete operative Frage.",
    },
    {
      targetId: "dashboard-add-widget",
      route: "/dashboard",
      en: "Add a widget whenever you need a new view. Widgets can summarize CRM records by status, owner, relationship, or a custom field.",
      de: "Füge ein Widget hinzu, wenn du eine neue Perspektive brauchst. Widgets fassen CRM-Datensätze nach Status, Zuständigkeit, Beziehung oder benutzerdefiniertem Feld zusammen.",
    },
  ],
  contacts: [
    {
      targetId: "nav-contacts",
      route: "/contacts",
      en: "Contacts are the people you work with. Their organizations, deals, tasks, and conversations stay connected here.",
      de: "Kontakte sind die Personen, mit denen du arbeitest. Organisationen, Deals, Aufgaben und Unterhaltungen bleiben hier verbunden.",
    },
    {
      targetId: "contacts-add",
      route: "/contacts",
      en: "Create a contact manually here, or ask the Assistant to create and link one after showing you the proposed change.",
      de: "Erstelle hier manuell einen Kontakt oder bitte den Assistenten, einen Kontakt nach einer Vorschau anzulegen und zu verknüpfen.",
    },
    {
      targetId: "contacts-search",
      route: "/contacts",
      en: "Search narrows the current list without changing your underlying data.",
      de: "Die Suche grenzt die aktuelle Liste ein, ohne deine Daten zu verändern.",
    },
    {
      targetId: "contacts-filter",
      route: "/contacts",
      en: "Filters combine standard properties, relationships, and your custom fields so recurring views stay focused.",
      de: "Filter kombinieren Standardfelder, Beziehungen und eigene Felder, damit wiederkehrende Ansichten fokussiert bleiben.",
    },
    {
      targetId: "contacts-display-options",
      route: "/contacts",
      en: "Display options control columns, sorting, and the view style for this page.",
      de: "Anzeigeoptionen steuern Spalten, Sortierung und Darstellungsart dieser Seite.",
    },
  ],
  organizations: [
    {
      targetId: "nav-organizations",
      route: "/organizations",
      en: "Organizations group the people, opportunities, and follow-ups belonging to one account or company.",
      de: "Organisationen bündeln Personen, Verkaufschancen und Follow-ups eines Accounts oder Unternehmens.",
    },
    {
      targetId: "organizations-add",
      route: "/organizations",
      en: "Create an organization here, then link its contacts, deals, and tasks so the account has one shared context.",
      de: "Erstelle hier eine Organisation und verknüpfe Kontakte, Deals und Aufgaben für einen gemeinsamen Account-Kontext.",
    },
    {
      targetId: "organizations-filter",
      route: "/organizations",
      en: "Use filters to build account lists such as customers with open deals or organizations missing a next task.",
      de: "Nutze Filter für Account-Listen wie Kunden mit offenen Deals oder Organisationen ohne nächste Aufgabe.",
    },
    {
      targetId: "organizations-display-options",
      route: "/organizations",
      en: "Choose the columns and ordering that make this account view useful for your workflow.",
      de: "Wähle Spalten und Reihenfolge passend zu deinem Account-Workflow.",
    },
  ],
  deals: [
    {
      targetId: "nav-deals",
      route: "/deals",
      en: "Deals track commercial opportunities and keep the involved organization, contacts, offerings, and next tasks together.",
      de: "Deals bilden Verkaufschancen ab und halten Organisation, Kontakte, Angebote und nächste Aufgaben zusammen.",
    },
    {
      targetId: "deals-add",
      route: "/deals",
      en: "Create a deal here or ask the Assistant to assemble one from the context already in your CRM.",
      de: "Erstelle hier einen Deal oder lass ihn vom Assistenten aus vorhandenem CRM-Kontext zusammenstellen.",
    },
    {
      targetId: "deals-filter",
      route: "/deals",
      en: "Filters turn the full pipeline into practical working views by stage, owner, relationship, value, or custom field.",
      de: "Filter machen aus der gesamten Pipeline praktische Arbeitsansichten nach Phase, Zuständigkeit, Beziehung, Wert oder eigenem Feld.",
    },
    {
      targetId: "deals-display-options",
      route: "/deals",
      en: "Switch the deal view and choose which signals should stay visible while you work the pipeline.",
      de: "Wechsle die Deal-Ansicht und bestimme, welche Signale bei der Pipeline-Arbeit sichtbar bleiben.",
    },
  ],
  services: [
    {
      targetId: "nav-services",
      route: "/services",
      en: "Services represent what you sell: services, products, packages, or retainers. They provide the commercial building blocks for deals.",
      de: "Leistungen bilden ab, was du verkaufst: Services, Produkte, Pakete oder Retainer. Sie sind die kaufmännischen Bausteine deiner Deals.",
    },
    {
      targetId: "services-add",
      route: "/services",
      en: "Create an offering with a clear name and price, then connect it to deals and delivery tasks.",
      de: "Lege ein Angebot mit klarem Namen und Preis an und verknüpfe es anschließend mit Deals und Lieferaufgaben.",
    },
    {
      targetId: "services-filter",
      route: "/services",
      en: "Filter the catalog by relationships or custom attributes when your offering set grows.",
      de: "Filtere den Katalog nach Beziehungen oder eigenen Merkmalen, wenn dein Angebot wächst.",
    },
    {
      targetId: "services-display-options",
      route: "/services",
      en: "Display options let each team keep the useful commercial details visible.",
      de: "Mit Anzeigeoptionen hält jedes Team die relevanten kaufmännischen Details sichtbar.",
    },
  ],
  tasks: [
    {
      targetId: "nav-tasks",
      route: "/tasks",
      en: "Tasks turn CRM context into concrete follow-up. A task can stay linked to the people, account, deal, and offering it advances.",
      de: "Aufgaben machen aus CRM-Kontext konkrete Follow-ups. Sie bleiben mit Personen, Account, Deal und Angebot verbunden.",
    },
    {
      targetId: "tasks-add",
      route: "/tasks",
      en: "Create a task here or ask the Assistant to prepare one from a conversation, deal, or missing next step.",
      de: "Erstelle hier eine Aufgabe oder lass sie vom Assistenten aus einer Unterhaltung, einem Deal oder einem fehlenden nächsten Schritt vorbereiten.",
    },
    {
      targetId: "tasks-filter",
      route: "/tasks",
      en: "Use filters for focused queues such as your open work, a specific customer, or tasks grouped by a custom status.",
      de: "Nutze Filter für fokussierte Listen wie deine offenen Aufgaben, einen bestimmten Kunden oder Aufgaben nach eigenem Status.",
    },
    {
      targetId: "tasks-display-options",
      route: "/tasks",
      en: "Display options make the same task data useful as a table, cards, or a grouped workflow.",
      de: "Anzeigeoptionen machen dieselben Aufgabendaten als Tabelle, Karten oder gruppierten Workflow nutzbar.",
    },
  ],
};

const PLATFORM: LocalizedStep[] = [
  {
    targetId: "nav-dashboard",
    route: "/dashboard",
    en: "Start on the dashboard for a visual summary of your business. You can shape it around the questions you review most often.",
    de: "Starte auf dem Dashboard mit einer visuellen Zusammenfassung deines Geschäfts. Richte es nach den Fragen aus, die du regelmäßig prüfst.",
  },
  ...PAGE_TOURS.dashboard.slice(1),
  {
    targetId: "nav-inbox",
    route: "/inbox",
    en: "The inbox brings supported communication channels into one place and keeps messages connected to CRM context.",
    de: "Der Posteingang bündelt unterstützte Kommunikationskanäle und verbindet Nachrichten mit deinem CRM-Kontext.",
  },
  ...PAGE_TOURS.contacts.slice(0, 2),
  ...PAGE_TOURS.organizations.slice(0, 2),
  ...PAGE_TOURS.deals.slice(0, 2),
  ...PAGE_TOURS.tasks.slice(0, 2),
  ...PAGE_TOURS.services.slice(0, 2),
  {
    targetId: "nav-search",
    route: null,
    en: "Global search is the fastest way to jump to a record from anywhere. The Assistant complements it when you want an answer or an action instead of a destination.",
    de: "Mit der globalen Suche springst du von überall direkt zu einem Datensatz. Der Assistent ergänzt sie, wenn du statt eines Ziels eine Antwort oder Aktion brauchst.",
  },
];

export function agentGuidedTour(tourId: AgentTourId, locale: string): AgentGuidedTourStep[] {
  const source = tourId === "platform" ? PLATFORM : PAGE_TOURS[tourId];
  const language = locale.toLowerCase().startsWith("de") ? "de" : "en";
  return source.map((step) => ({
    targetId: step.targetId,
    route: step.route,
    note: step[language],
  }));
}
