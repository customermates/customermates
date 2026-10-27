import {
  DEMO_DEFAULT_SOLUTION_ID,
  type SolutionDataLocale,
  type SolutionId,
  findSolution,
  solutionDataLocaleForUiLocale,
} from "@/core/solutions/solution-catalog";
import { appLocaleOrDefault } from "@/i18n/locale-registry";

export const PUBLIC_DEMO_ORIGIN = "https://demo.customermates.com";

export function externalLinkRel(href: string): string {
  return href.startsWith(`${PUBLIC_DEMO_ORIGIN}/`) ? "nofollow noopener noreferrer" : "noopener noreferrer";
}

export const DEMO_RECORD_TYPE_IDS = {
  deals: "3ba14418-0840-8ae7-8c7e-52a2a79a481d",
  contacts: "be3cd172-da59-82bd-8ad7-23ef34431a27",
  organizations: "9d9707c5-d1a2-8048-803b-a501301e2bc3",
  tasks: "7fee95c9-d304-8b5e-8c96-4c0e1019f331",
} as const;

export type DemoRecordList = keyof typeof DEMO_RECORD_TYPE_IDS;

export const DEMO_DEFAULT_RECORD_TYPE_IDS: Record<SolutionDataLocale, Record<DemoRecordList, string>> = {
  en: DEMO_RECORD_TYPE_IDS,
  de: {
    deals: "fe81a7a6-6bd5-8c33-8378-e97817774ef7",
    contacts: "6f7a587b-60a2-843e-89a7-aebda242dec1",
    organizations: "e132f26d-a4cf-8b42-8f06-7fe46e6cb7fa",
    tasks: "29a1caf6-958e-8d35-84c6-8bee12ff78f1",
  },
};

export const DEMO_RECORD_LIST_PATHS = {
  deals: `/records/${DEMO_RECORD_TYPE_IDS.deals}`,
  contacts: `/records/${DEMO_RECORD_TYPE_IDS.contacts}`,
  organizations: `/records/${DEMO_RECORD_TYPE_IDS.organizations}`,
  tasks: `/records/${DEMO_RECORD_TYPE_IDS.tasks}`,
} as const;

export function demoWorkspaceSlug(uiLocale: string, solutionId: SolutionId = DEMO_DEFAULT_SOLUTION_ID): string {
  return findSolution(solutionId).workspaceSlugs[solutionDataLocaleForUiLocale(uiLocale)];
}

function localizedDemoRoute(route: string, dataLocale: SolutionDataLocale): string {
  const ids = DEMO_DEFAULT_RECORD_TYPE_IDS[dataLocale];
  return (Object.keys(DEMO_RECORD_TYPE_IDS) as DemoRecordList[]).reduce(
    (path, list) => path.replaceAll(DEMO_RECORD_TYPE_IDS[list], ids[list]),
    route,
  );
}

export function demoWorkspacePath(
  uiLocale: string,
  route: string,
  solutionId: SolutionId = DEMO_DEFAULT_SOLUTION_ID,
): string {
  const appLocale = appLocaleOrDefault(uiLocale);
  const dataLocale = solutionDataLocaleForUiLocale(appLocale);
  const path = solutionId === DEMO_DEFAULT_SOLUTION_ID ? localizedDemoRoute(route, dataLocale) : route;

  return `/${appLocale}/w/${encodeURIComponent(demoWorkspaceSlug(appLocale, solutionId))}${path}`;
}

export function localDemoBaseUrl(): string | null {
  if (process.env.NODE_ENV !== "development") return null;

  const base = process.env.DEMO_PREVIEW_URL || process.env.BASE_URL;

  return base ? base.replace(/\/$/u, "") : null;
}

export function localProductDemoSrc(src: string): string {
  const base = localDemoBaseUrl();
  if (!base) return src;

  const url = new URL(src);
  if (url.origin !== PUBLIC_DEMO_ORIGIN) return src;

  return `${base}${url.pathname}${url.search}${url.hash}`;
}
