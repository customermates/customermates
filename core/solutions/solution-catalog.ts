import {
  ASSET_LOCALES,
  type AssetLocale,
  DEFAULT_LOCALE,
  type MarketingLocale,
  assetLocaleFor,
  isLocaleCode,
  marketingLocalesForPath,
} from "@/i18n/locale-registry";

export const SOLUTION_DATA_LOCALES: readonly AssetLocale[] = ASSET_LOCALES;

export type SolutionDataLocale = AssetLocale;

export type SolutionGroup = "team" | "workflow";

export type SolutionId =
  | "smb"
  | "consultants"
  | "agencies"
  | "freelancers"
  | "startups"
  | "client-management"
  | "sales-pipeline"
  | "linkedin-crm"
  | "whatsapp-crm";

export type SolutionPublicLocale = MarketingLocale;

export type SolutionWorkspace = {
  slug: string;
  companyId: string;
};

export type SolutionNavPreviewTarget =
  | { kind: "dashboard" }
  | { kind: "configure" }
  | { kind: "view"; view: string }
  | { kind: "record"; list: string; key: string }
  | { kind: "inbox"; account?: "linkedin" | "whatsapp"; link?: string };

export type SolutionStageTarget = SolutionNavPreviewTarget | { kind: "calendar" };

export type SolutionStageTabId =
  | "dashboard"
  | "pipeline"
  | "engagements"
  | "pitchBoard"
  | "clients"
  | "clientOverview"
  | "inbox"
  | "calendar";

export type SolutionStageTab = {
  id: SolutionStageTabId;
  target: SolutionStageTarget;
};

const DASHBOARD_TAB: SolutionStageTab = { id: "dashboard", target: { kind: "dashboard" } };

const INBOX_TAB: SolutionStageTab = { id: "inbox", target: { kind: "inbox" } };

const CALENDAR_TAB: SolutionStageTab = { id: "calendar", target: { kind: "calendar" } };

const PIPELINE_TAB: SolutionStageTab = { id: "pipeline", target: { kind: "view", view: "pipeline" } };

type SolutionDefinition = {
  id: SolutionId;
  group: SolutionGroup;
  landingPath: string;
  navPreview: SolutionNavPreviewTarget;
  navLabelKey: string;
  previewRoute: string;
  stage: readonly SolutionStageTab[];
  workspaces: Record<SolutionDataLocale, SolutionWorkspace>;
};

export type SolutionCatalogEntry = SolutionDefinition & {
  workspaceSlugs: Record<SolutionDataLocale, string>;
  companyIds: Record<SolutionDataLocale, string>;
  publicLocales: readonly SolutionPublicLocale[];
};

const SOLUTION_DEFINITIONS: readonly SolutionDefinition[] = [
  {
    id: "smb",
    group: "team",
    landingPath: "/for/smb",
    navPreview: { kind: "dashboard" },
    navLabelKey: "smb",
    previewRoute: "/dashboard",
    stage: [DASHBOARD_TAB, PIPELINE_TAB, INBOX_TAB, CALENDAR_TAB],
    workspaces: {
      en: { slug: "small-business", companyId: "10000000-0000-4000-8000-000000000001" },
      de: { slug: "kleine-unternehmen", companyId: "10000000-0000-4000-8000-000000000202" },
      es: { slug: "pymes", companyId: "10000000-0000-4000-8000-000000000301" },
      pt: { slug: "pequenas-empresas", companyId: "10000000-0000-4000-8000-000000000311" },
      pl: { slug: "male-firmy", companyId: "10000000-0000-4000-8000-000000000321" },
      nl: { slug: "kleine-bedrijven", companyId: "10000000-0000-4000-8000-000000000331" },
    },
  },
  {
    id: "consultants",
    group: "team",
    landingPath: "/for/consultants",
    navPreview: { kind: "view", view: "active" },
    navLabelKey: "consultants",
    previewRoute: "/dashboard",
    stage: [DASHBOARD_TAB, { id: "engagements", target: { kind: "view", view: "active" } }, INBOX_TAB, CALENDAR_TAB],
    workspaces: {
      en: { slug: "consultants", companyId: "10000000-0000-4000-8000-000000000203" },
      de: { slug: "beratung", companyId: "10000000-0000-4000-8000-000000000003" },
      es: { slug: "consultoria", companyId: "10000000-0000-4000-8000-000000000302" },
      pt: { slug: "consultores", companyId: "10000000-0000-4000-8000-000000000312" },
      pl: { slug: "doradztwo", companyId: "10000000-0000-4000-8000-000000000322" },
      nl: { slug: "advies", companyId: "10000000-0000-4000-8000-000000000332" },
    },
  },
  {
    id: "agencies",
    group: "team",
    landingPath: "/for/agencies",
    navPreview: { kind: "view", view: "pitchBoard" },
    navLabelKey: "agencies",
    previewRoute: "/dashboard",
    stage: [DASHBOARD_TAB, { id: "pitchBoard", target: { kind: "view", view: "pitchBoard" } }, INBOX_TAB, CALENDAR_TAB],
    workspaces: {
      en: { slug: "agencies", companyId: "10000000-0000-4000-8000-000000000205" },
      de: { slug: "agenturen", companyId: "10000000-0000-4000-8000-000000000206" },
      es: { slug: "agencias", companyId: "10000000-0000-4000-8000-000000000303" },
      pt: { slug: "agencias-criativas", companyId: "10000000-0000-4000-8000-000000000313" },
      pl: { slug: "agencje", companyId: "10000000-0000-4000-8000-000000000323" },
      nl: { slug: "bureaus", companyId: "10000000-0000-4000-8000-000000000333" },
    },
  },
  {
    id: "freelancers",
    group: "team",
    landingPath: "/for/freelancers",
    navPreview: { kind: "view", view: "clients" },
    navLabelKey: "freelancers",
    previewRoute: "/dashboard",
    stage: [DASHBOARD_TAB, { id: "clients", target: { kind: "view", view: "clients" } }, INBOX_TAB, CALENDAR_TAB],
    workspaces: {
      en: { slug: "freelancers", companyId: "10000000-0000-4000-8000-000000000207" },
      de: { slug: "selbststaendige", companyId: "10000000-0000-4000-8000-000000000208" },
      es: { slug: "autonomos", companyId: "10000000-0000-4000-8000-000000000304" },
      pt: { slug: "profissionais-autonomos", companyId: "10000000-0000-4000-8000-000000000314" },
      pl: { slug: "freelancerzy", companyId: "10000000-0000-4000-8000-000000000324" },
      nl: { slug: "zelfstandigen", companyId: "10000000-0000-4000-8000-000000000334" },
    },
  },
  {
    id: "startups",
    group: "team",
    landingPath: "/for/startups",
    navPreview: { kind: "dashboard" },
    navLabelKey: "startups",
    previewRoute: "/dashboard",
    stage: [DASHBOARD_TAB, PIPELINE_TAB, INBOX_TAB, CALENDAR_TAB],
    workspaces: {
      en: { slug: "founder-sales", companyId: "10000000-0000-4000-8000-000000000209" },
      de: { slug: "gruender-vertrieb", companyId: "10000000-0000-4000-8000-000000000210" },
      es: { slug: "ventas-fundadores", companyId: "10000000-0000-4000-8000-000000000305" },
      pt: { slug: "vendas-fundadores", companyId: "10000000-0000-4000-8000-000000000315" },
      pl: { slug: "sprzedaz-zalozyciela", companyId: "10000000-0000-4000-8000-000000000325" },
      nl: { slug: "oprichters-verkoop", companyId: "10000000-0000-4000-8000-000000000335" },
    },
  },
  {
    id: "client-management",
    group: "workflow",
    landingPath: "/features/contact-management",
    navPreview: { kind: "view", view: "clientOverview" },
    navLabelKey: "clientManagement",
    previewRoute: "/dashboard",
    stage: [
      DASHBOARD_TAB,
      { id: "clientOverview", target: { kind: "view", view: "clientOverview" } },
      INBOX_TAB,
      CALENDAR_TAB,
    ],
    workspaces: {
      en: { slug: "client-management", companyId: "10000000-0000-4000-8000-000000000211" },
      de: { slug: "kundenverwaltung", companyId: "10000000-0000-4000-8000-000000000212" },
      es: { slug: "gestion-de-clientes", companyId: "10000000-0000-4000-8000-000000000306" },
      pt: { slug: "gestao-de-clientes", companyId: "10000000-0000-4000-8000-000000000316" },
      pl: { slug: "zarzadzanie-klientami", companyId: "10000000-0000-4000-8000-000000000326" },
      nl: { slug: "klantbeheer", companyId: "10000000-0000-4000-8000-000000000336" },
    },
  },
  {
    id: "sales-pipeline",
    group: "workflow",
    landingPath: "/features/pipeline",
    navPreview: { kind: "view", view: "pipeline" },
    navLabelKey: "salesPipeline",
    previewRoute: "/dashboard",
    stage: [DASHBOARD_TAB, PIPELINE_TAB, INBOX_TAB, CALENDAR_TAB],
    workspaces: {
      en: { slug: "sales-pipeline", companyId: "10000000-0000-4000-8000-000000000213" },
      de: { slug: "vertriebspipeline", companyId: "10000000-0000-4000-8000-000000000214" },
      es: { slug: "pipeline-de-ventas", companyId: "10000000-0000-4000-8000-000000000307" },
      pt: { slug: "pipeline-de-vendas", companyId: "10000000-0000-4000-8000-000000000317" },
      pl: { slug: "pipeline-sprzedazy", companyId: "10000000-0000-4000-8000-000000000327" },
      nl: { slug: "verkooppipeline", companyId: "10000000-0000-4000-8000-000000000337" },
    },
  },
  {
    id: "linkedin-crm",
    group: "workflow",
    landingPath: "/features/linkedin-integration",
    navPreview: { kind: "inbox", account: "linkedin", link: "deal:hollisProgram" },
    navLabelKey: "linkedinCrm",
    previewRoute: "/dashboard",
    stage: [
      DASHBOARD_TAB,
      { id: "inbox", target: { kind: "inbox", account: "linkedin", link: "deal:hollisProgram" } },
      PIPELINE_TAB,
      CALENDAR_TAB,
    ],
    workspaces: {
      en: { slug: "linkedin-sales", companyId: "10000000-0000-4000-8000-000000000215" },
      de: { slug: "linkedin-vertrieb", companyId: "10000000-0000-4000-8000-000000000216" },
      es: { slug: "linkedin-ventas", companyId: "10000000-0000-4000-8000-000000000308" },
      pt: { slug: "linkedin-vendas", companyId: "10000000-0000-4000-8000-000000000318" },
      pl: { slug: "linkedin-sprzedaz", companyId: "10000000-0000-4000-8000-000000000328" },
      nl: { slug: "linkedin-verkoop", companyId: "10000000-0000-4000-8000-000000000338" },
    },
  },
  {
    id: "whatsapp-crm",
    group: "workflow",
    landingPath: "/features/whatsapp-integration",
    navPreview: { kind: "inbox", account: "whatsapp", link: "deal:copperCounter" },
    navLabelKey: "whatsappCrm",
    previewRoute: "/dashboard",
    stage: [
      DASHBOARD_TAB,
      { id: "inbox", target: { kind: "inbox", account: "whatsapp", link: "deal:copperCounter" } },
      PIPELINE_TAB,
      CALENDAR_TAB,
    ],
    workspaces: {
      en: { slug: "whatsapp", companyId: "10000000-0000-4000-8000-000000000217" },
      de: { slug: "whatsapp-kundenkontakt", companyId: "10000000-0000-4000-8000-000000000218" },
      es: { slug: "whatsapp-clientes", companyId: "10000000-0000-4000-8000-000000000309" },
      pt: { slug: "whatsapp-atendimento", companyId: "10000000-0000-4000-8000-000000000319" },
      pl: { slug: "whatsapp-klienci", companyId: "10000000-0000-4000-8000-000000000329" },
      nl: { slug: "whatsapp-klantcontact", companyId: "10000000-0000-4000-8000-000000000339" },
    },
  },
];

function byDataLocale(definition: SolutionDefinition, pick: (workspace: SolutionWorkspace) => string) {
  return Object.fromEntries(
    SOLUTION_DATA_LOCALES.map((dataLocale) => [dataLocale, pick(definition.workspaces[dataLocale])]),
  ) as Record<SolutionDataLocale, string>;
}

export const SOLUTION_CATALOG: readonly SolutionCatalogEntry[] = SOLUTION_DEFINITIONS.map((definition) => ({
  ...definition,
  workspaceSlugs: byDataLocale(definition, (workspace) => workspace.slug),
  companyIds: byDataLocale(definition, (workspace) => workspace.companyId),
  publicLocales: marketingLocalesForPath(definition.landingPath),
}));

export const DEMO_DEFAULT_WORKSPACE_SLUG = "small-business";

export const DEMO_DEFAULT_SOLUTION_ID: SolutionId = "smb";

export const PROFESSIONAL_SERVICES_SOLUTION_ID: SolutionId = "smb";

export function solutionDataLocaleForUiLocale(uiLocale: string): SolutionDataLocale {
  return assetLocaleFor(isLocaleCode(uiLocale) ? uiLocale : DEFAULT_LOCALE);
}

export function solutionDataLocales(solution: SolutionCatalogEntry): SolutionDataLocale[] {
  return [...new Set(solution.publicLocales.map(solutionDataLocaleForUiLocale))];
}

export function findSolution(id: SolutionId): SolutionCatalogEntry {
  const entry = SOLUTION_CATALOG.find((solution) => solution.id === id);
  if (!entry) throw new Error(`Unknown solution ${id}`);
  return entry;
}

export function findSolutionByLandingPath(landingPath: string): SolutionCatalogEntry | undefined {
  return SOLUTION_CATALOG.find((solution) => solution.landingPath === landingPath);
}

export function findSolutionByWorkspaceSlug(
  slug: string,
): { solution: SolutionCatalogEntry; dataLocale: SolutionDataLocale } | undefined {
  for (const solution of SOLUTION_CATALOG) {
    for (const dataLocale of SOLUTION_DATA_LOCALES)
      if (solution.workspaceSlugs[dataLocale] === slug) return { solution, dataLocale };
  }
  return undefined;
}

export function demoDefaultWorkspaceSlug(uiLocale: string): string {
  return findSolution(DEMO_DEFAULT_SOLUTION_ID).workspaceSlugs[solutionDataLocaleForUiLocale(uiLocale)];
}
