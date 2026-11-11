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
  es: {
    deals: "1a581e09-7d88-8f2f-800c-468fafd0adc7",
    contacts: "a11e8710-bcbb-8961-8e67-6ee14e42f9ec",
    organizations: "d1301ec4-b526-83ba-89a4-1c56b0d96885",
    tasks: "bd130fcb-9f65-8eb8-8450-c345877d7a2f",
  },
  pt: {
    deals: "7b504572-0806-82d2-828b-115f9daaa95f",
    contacts: "220c9d98-f1e4-851b-8a04-0061c15b6eb7",
    organizations: "e9c6a0ee-e9dc-8807-8a4a-253f22b0999c",
    tasks: "9bbc77d2-e5ab-8b5c-85ba-436235631529",
  },
  pl: {
    deals: "ae56c040-1977-8d36-8996-3f17d0c1f082",
    contacts: "fa88dc01-cde7-820b-81af-f9d35769f32a",
    organizations: "91f4ae34-1a16-8f2d-83cc-ef07480357c9",
    tasks: "1658cde7-2dec-8366-87d4-b509ebf64fe1",
  },
  nl: {
    deals: "08f55aeb-288d-8059-8d11-fb4acfc7a305",
    contacts: "5268520c-328d-8c7b-8d41-daf478d1f641",
    organizations: "45ca8580-c830-8814-874b-7245f1cebc57",
    tasks: "0a6e5930-19bb-83a7-83c0-8cbeefde3995",
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
