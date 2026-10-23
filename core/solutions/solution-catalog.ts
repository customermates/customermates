import {
  CONTENT_LOCALES,
  type ContentLocale,
  DEFAULT_LOCALE,
  type MarketingLocale,
  isContentLocale,
  marketingLocalesForPath,
} from "@/i18n/locale-registry";

export const SOLUTION_DATA_LOCALES: readonly ContentLocale[] = CONTENT_LOCALES;

export type SolutionDataLocale = ContentLocale;

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

type SolutionDefinition = {
  id: SolutionId;
  group: SolutionGroup;
  landingPath: string;
  navLabelKey: string;
  previewRoute: string;
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
    navLabelKey: "smb",
    previewRoute: "/dashboard",
    workspaces: {
      en: { slug: "small-business", companyId: "10000000-0000-4000-8000-000000000001" },
      de: { slug: "kleine-unternehmen", companyId: "10000000-0000-4000-8000-000000000202" },
    },
  },
  {
    id: "consultants",
    group: "team",
    landingPath: "/for/consultants",
    navLabelKey: "consultants",
    previewRoute: "/dashboard",
    workspaces: {
      en: { slug: "consultants", companyId: "10000000-0000-4000-8000-000000000203" },
      de: { slug: "beratung", companyId: "10000000-0000-4000-8000-000000000003" },
    },
  },
  {
    id: "agencies",
    group: "team",
    landingPath: "/for/agencies",
    navLabelKey: "agencies",
    previewRoute: "/dashboard",
    workspaces: {
      en: { slug: "agencies", companyId: "10000000-0000-4000-8000-000000000205" },
      de: { slug: "agenturen", companyId: "10000000-0000-4000-8000-000000000206" },
    },
  },
  {
    id: "freelancers",
    group: "team",
    landingPath: "/for/freelancers",
    navLabelKey: "freelancers",
    previewRoute: "/dashboard",
    workspaces: {
      en: { slug: "freelancers", companyId: "10000000-0000-4000-8000-000000000207" },
      de: { slug: "selbststaendige", companyId: "10000000-0000-4000-8000-000000000208" },
    },
  },
  {
    id: "startups",
    group: "team",
    landingPath: "/for/startups",
    navLabelKey: "startups",
    previewRoute: "/dashboard",
    workspaces: {
      en: { slug: "founder-sales", companyId: "10000000-0000-4000-8000-000000000209" },
      de: { slug: "gruender-vertrieb", companyId: "10000000-0000-4000-8000-000000000210" },
    },
  },
  {
    id: "client-management",
    group: "workflow",
    landingPath: "/features/contact-management",
    navLabelKey: "clientManagement",
    previewRoute: "/dashboard",
    workspaces: {
      en: { slug: "client-management", companyId: "10000000-0000-4000-8000-000000000211" },
      de: { slug: "kundenverwaltung", companyId: "10000000-0000-4000-8000-000000000212" },
    },
  },
  {
    id: "sales-pipeline",
    group: "workflow",
    landingPath: "/features/pipeline",
    navLabelKey: "salesPipeline",
    previewRoute: "/dashboard",
    workspaces: {
      en: { slug: "sales-pipeline", companyId: "10000000-0000-4000-8000-000000000213" },
      de: { slug: "vertriebspipeline", companyId: "10000000-0000-4000-8000-000000000214" },
    },
  },
  {
    id: "linkedin-crm",
    group: "workflow",
    landingPath: "/features/linkedin-integration",
    navLabelKey: "linkedinCrm",
    previewRoute: "/dashboard",
    workspaces: {
      en: { slug: "linkedin-sales", companyId: "10000000-0000-4000-8000-000000000215" },
      de: { slug: "linkedin-vertrieb", companyId: "10000000-0000-4000-8000-000000000216" },
    },
  },
  {
    id: "whatsapp-crm",
    group: "workflow",
    landingPath: "/features/whatsapp-integration",
    navLabelKey: "whatsappCrm",
    previewRoute: "/dashboard",
    workspaces: {
      en: { slug: "whatsapp", companyId: "10000000-0000-4000-8000-000000000217" },
      de: { slug: "whatsapp-kundenkontakt", companyId: "10000000-0000-4000-8000-000000000218" },
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
  return isContentLocale(uiLocale) ? uiLocale : DEFAULT_LOCALE;
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
