import { versionedAssetSrc } from "@/core/utils/versioned-asset-src";

import {
  SOLUTION_CAPTURE_BUDGET_BYTES,
  SOLUTION_CAPTURE_THEMES,
  type SolutionCaptureAsset,
  type SolutionCaptureFileFacts,
  type SolutionCaptureTheme,
} from "./solution-captures";
import {
  SOLUTION_CATALOG,
  type SolutionCatalogEntry,
  type SolutionDataLocale,
  type SolutionId,
  type SolutionPublicLocale,
  type SolutionStageTabId,
  solutionDataLocaleForUiLocale,
} from "./solution-catalog";

export const SOLUTION_STAGE_CAPTURE_VIEWPORT = { deviceScaleFactor: 2, height: 900, width: 1440 } as const;

export const SOLUTION_STAGE_IMAGE_SIZE = { height: 1000, width: 1600 } as const;

export const SOLUTION_STAGE_PUBLIC_DIR = "/captures/solutions/stage";

export const SOLUTION_STAGE_MAIN_CAPTURE_TAB: SolutionStageTabId = "dashboard";

export type SolutionStageRoutes = Partial<
  Record<SolutionId, Partial<Record<SolutionStageTabId, Record<SolutionDataLocale, string>>>>
>;

export type SolutionStageCaptureEntry = SolutionCaptureAsset & {
  key: string;
  route: string;
  sha256: string;
};

export type SolutionStageCaptures = {
  capturedOn: string | null;
  entries: readonly SolutionStageCaptureEntry[];
  environment: string | null;
  routes: SolutionStageRoutes;
  sourceRevision: string | null;
};

export type SolutionStagePlanItem = {
  key: string;
  locale: SolutionPublicLocale;
  route: string;
  solution: SolutionCatalogEntry;
  src: string;
  tab: SolutionStageTabId;
  theme: SolutionCaptureTheme;
};

export type SolutionStagePoster = Record<SolutionCaptureTheme, SolutionCaptureAsset>;

export function solutionStageCaptureKey(
  solution: SolutionId,
  tab: SolutionStageTabId,
  locale: string,
  theme: SolutionCaptureTheme,
): string {
  return `${solution}:${tab}:${locale}:${theme}`;
}

export function solutionStageCaptureSrc(
  solution: SolutionId,
  tab: SolutionStageTabId,
  locale: string,
  theme: SolutionCaptureTheme,
): string {
  return `${SOLUTION_STAGE_PUBLIC_DIR}/${theme}/${solution}-${tab}-${locale}.webp`;
}

export function solutionStageWorkspacePath(
  routes: SolutionStageRoutes,
  solution: SolutionId,
  tab: SolutionStageTabId,
  uiLocale: string,
): string | undefined {
  return routes[solution]?.[tab]?.[solutionDataLocaleForUiLocale(uiLocale)];
}

export function solutionStageRoute(
  routes: SolutionStageRoutes,
  solution: SolutionCatalogEntry,
  tab: SolutionStageTabId,
  uiLocale: string,
): string | undefined {
  const path = solutionStageWorkspacePath(routes, solution.id, tab, uiLocale);
  if (path === undefined) return undefined;
  return `/${uiLocale}/w/${solution.workspaces[solutionDataLocaleForUiLocale(uiLocale)].slug}${path}`;
}

export function solutionStagePlan(
  routes: SolutionStageRoutes,
  catalog: readonly SolutionCatalogEntry[] = SOLUTION_CATALOG,
): SolutionStagePlanItem[] {
  return catalog.flatMap((solution) =>
    solution.stage
      .filter((tab) => tab.id !== SOLUTION_STAGE_MAIN_CAPTURE_TAB)
      .flatMap((tab) =>
        solution.publicLocales.flatMap((locale) =>
          SOLUTION_CAPTURE_THEMES.map(
            (theme): SolutionStagePlanItem => ({
              key: solutionStageCaptureKey(solution.id, tab.id, locale, theme),
              locale,
              route: solutionStageRoute(routes, solution, tab.id, locale) ?? "",
              solution,
              src: solutionStageCaptureSrc(solution.id, tab.id, locale, theme),
              tab: tab.id,
              theme,
            }),
          ),
        ),
      ),
  );
}

export function solutionStagePoster(
  captures: SolutionStageCaptures,
  solution: SolutionId,
  tab: SolutionStageTabId,
  locale: string,
): SolutionStagePoster | null {
  const find = (theme: SolutionCaptureTheme) =>
    captures.entries.find((entry) => entry.key === solutionStageCaptureKey(solution, tab, locale, theme));
  const light = find("light");
  const dark = find("dark");
  if (!light || !dark) return null;
  const asset = ({ bytes, height, sha256, src, width }: SolutionStageCaptureEntry) => ({
    bytes,
    height,
    src: versionedAssetSrc(src, sha256.slice(0, 12)),
    width,
  });
  return { dark: asset(dark), light: asset(light) };
}

export type SolutionStageCheckOptions = {
  baseBytes: number;
  budgetBytes?: number;
  catalog?: readonly SolutionCatalogEntry[];
  readFile: (publicSrc: string) => SolutionCaptureFileFacts | null;
  requireAll: boolean;
};

export type SolutionStageCheckResult = {
  missing: string[];
  problems: string[];
  totalBytes: number;
};

export function checkSolutionStageCaptures(
  captures: SolutionStageCaptures,
  options: SolutionStageCheckOptions,
): SolutionStageCheckResult {
  const plan = new Map(solutionStagePlan(captures.routes, options.catalog).map((item) => [item.key, item]));
  const problems: string[] = [];
  const seen = new Set<string>();
  let totalBytes = 0;

  for (const item of plan.values()) if (!item.route) problems.push(`${item.key}: no resolved route`);

  for (const entry of captures.entries) {
    const item = plan.get(entry.key);
    if (!item) {
      problems.push(`${entry.key}: not a published stage tab`);
      continue;
    }
    if (seen.has(entry.key)) problems.push(`${entry.key}: listed twice`);
    seen.add(entry.key);
    if (entry.src !== item.src) problems.push(`${entry.key}: captured file must live at ${item.src}`);
    if (entry.route !== item.route) problems.push(`${entry.key}: captured ${entry.route}, expected ${item.route}`);
    if (entry.width !== SOLUTION_STAGE_IMAGE_SIZE.width || entry.height !== SOLUTION_STAGE_IMAGE_SIZE.height)
      problems.push(`${entry.key}: ${entry.width}x${entry.height}, expected the stage image size`);

    const facts = options.readFile(entry.src);
    if (!facts) {
      problems.push(`${entry.key}: missing file ${entry.src}`);
      continue;
    }
    if (facts.bytes !== entry.bytes)
      problems.push(`${entry.key}: ${entry.src} is ${facts.bytes} bytes, listed ${entry.bytes}`);
    if (facts.sha256 !== entry.sha256) problems.push(`${entry.key}: ${entry.src} sha256 differs from the listing`);
    totalBytes += facts.bytes;
  }

  const missing = [...plan.keys()].filter((key) => !seen.has(key));
  if (options.requireAll) for (const key of missing) problems.push(`${key}: missing stage capture`);

  const budget = options.budgetBytes ?? SOLUTION_CAPTURE_BUDGET_BYTES;
  if (options.baseBytes + totalBytes > budget) {
    problems.push(
      `solution captures use ${options.baseBytes + totalBytes} bytes with the stage, over the ${budget}-byte budget`,
    );
  }

  return { missing, problems, totalBytes };
}
