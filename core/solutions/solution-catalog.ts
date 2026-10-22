export const SOLUTION_DATA_LOCALES = ["en", "de"] as const;

export type SolutionDataLocale = (typeof SOLUTION_DATA_LOCALES)[number];

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

export type SolutionPublicLocale = "en" | "de" | "fr";

export type SolutionCatalogEntry = {
  id: SolutionId;
  group: SolutionGroup;
  landingPath: string;
  navLabelKey: string;
  previewRoute: string;
  workspaceSlugs: Record<SolutionDataLocale, string>;
  companyIds: Record<SolutionDataLocale, string>;
  publicLocales: readonly SolutionPublicLocale[];
};

const EN_DE = ["en", "de"] as const;
const EN_DE_FR = ["en", "de", "fr"] as const;

export const SOLUTION_CATALOG: readonly SolutionCatalogEntry[] = [
  {
    id: "smb",
    group: "team",
    landingPath: "/for/smb",
    navLabelKey: "smb",
    previewRoute: "/dashboard",
    workspaceSlugs: { en: "small-business", de: "kleine-unternehmen" },
    companyIds: {
      en: "10000000-0000-4000-8000-000000000001",
      de: "10000000-0000-4000-8000-000000000202",
    },
    publicLocales: EN_DE_FR,
  },
  {
    id: "consultants",
    group: "team",
    landingPath: "/for/consultants",
    navLabelKey: "consultants",
    previewRoute: "/dashboard",
    workspaceSlugs: { en: "consultants", de: "beratung" },
    companyIds: {
      en: "10000000-0000-4000-8000-000000000203",
      de: "10000000-0000-4000-8000-000000000003",
    },
    publicLocales: EN_DE,
  },
  {
    id: "agencies",
    group: "team",
    landingPath: "/for/agencies",
    navLabelKey: "agencies",
    previewRoute: "/dashboard",
    workspaceSlugs: { en: "agencies", de: "agenturen" },
    companyIds: {
      en: "10000000-0000-4000-8000-000000000205",
      de: "10000000-0000-4000-8000-000000000206",
    },
    publicLocales: EN_DE_FR,
  },
  {
    id: "freelancers",
    group: "team",
    landingPath: "/for/freelancers",
    navLabelKey: "freelancers",
    previewRoute: "/dashboard",
    workspaceSlugs: { en: "freelancers", de: "selbststaendige" },
    companyIds: {
      en: "10000000-0000-4000-8000-000000000207",
      de: "10000000-0000-4000-8000-000000000208",
    },
    publicLocales: EN_DE,
  },
  {
    id: "startups",
    group: "team",
    landingPath: "/for/startups",
    navLabelKey: "startups",
    previewRoute: "/dashboard",
    workspaceSlugs: { en: "founder-sales", de: "gruender-vertrieb" },
    companyIds: {
      en: "10000000-0000-4000-8000-000000000209",
      de: "10000000-0000-4000-8000-000000000210",
    },
    publicLocales: EN_DE,
  },
  {
    id: "client-management",
    group: "workflow",
    landingPath: "/features/contact-management",
    navLabelKey: "clientManagement",
    previewRoute: "/dashboard",
    workspaceSlugs: { en: "client-management", de: "kundenverwaltung" },
    companyIds: {
      en: "10000000-0000-4000-8000-000000000211",
      de: "10000000-0000-4000-8000-000000000212",
    },
    publicLocales: EN_DE_FR,
  },
  {
    id: "sales-pipeline",
    group: "workflow",
    landingPath: "/features/pipeline",
    navLabelKey: "salesPipeline",
    previewRoute: "/dashboard",
    workspaceSlugs: { en: "sales-pipeline", de: "vertriebspipeline" },
    companyIds: {
      en: "10000000-0000-4000-8000-000000000213",
      de: "10000000-0000-4000-8000-000000000214",
    },
    publicLocales: EN_DE_FR,
  },
  {
    id: "linkedin-crm",
    group: "workflow",
    landingPath: "/features/linkedin-integration",
    navLabelKey: "linkedinCrm",
    previewRoute: "/dashboard",
    workspaceSlugs: { en: "linkedin-sales", de: "linkedin-vertrieb" },
    companyIds: {
      en: "10000000-0000-4000-8000-000000000215",
      de: "10000000-0000-4000-8000-000000000216",
    },
    publicLocales: EN_DE,
  },
  {
    id: "whatsapp-crm",
    group: "workflow",
    landingPath: "/features/whatsapp-integration",
    navLabelKey: "whatsappCrm",
    previewRoute: "/dashboard",
    workspaceSlugs: { en: "whatsapp", de: "whatsapp-kundenkontakt" },
    companyIds: {
      en: "10000000-0000-4000-8000-000000000217",
      de: "10000000-0000-4000-8000-000000000218",
    },
    publicLocales: EN_DE,
  },
];

export const DEMO_DEFAULT_WORKSPACE_SLUG = "small-business";

export const PROFESSIONAL_SERVICES_SOLUTION_ID: SolutionId = "smb";

export function solutionDataLocaleForUiLocale(uiLocale: string): SolutionDataLocale {
  return uiLocale === "de" ? "de" : "en";
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
