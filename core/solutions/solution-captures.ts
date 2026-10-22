import {
  SOLUTION_CATALOG,
  type SolutionCatalogEntry,
  type SolutionId,
  type SolutionPublicLocale,
  solutionDataLocaleForUiLocale,
} from "./solution-catalog";

export const SOLUTION_CAPTURE_THEMES = ["light", "dark"] as const;

export type SolutionCaptureTheme = (typeof SOLUTION_CAPTURE_THEMES)[number];

export const SOLUTION_CAPTURE_VIEWPORT = { deviceScaleFactor: 2, height: 900, width: 1440 } as const;

export const SOLUTION_NAV_THUMBNAIL_WIDTH = 720;

export const SOLUTION_CAPTURE_BUDGET_BYTES = 15 * 1024 * 1024;

export const SOLUTION_CAPTURE_PUBLIC_DIR = "/captures/solutions";

export type SolutionCaptureAsset = {
  bytes: number;
  height: number;
  src: string;
  width: number;
};

export type SolutionCaptureEntry = {
  locale: SolutionPublicLocale;
  main: SolutionCaptureAsset;
  nav: SolutionCaptureAsset;
  placeholder: boolean;
  solution: SolutionId;
  theme: SolutionCaptureTheme;
};

export type SolutionCaptureManifest = {
  entries: readonly SolutionCaptureEntry[];
};

export type SolutionCaptureProvenanceEntry = {
  key: string;
  mainSha256: string;
  navSha256: string;
  route: string;
};

export type SolutionCaptureProvenance = {
  capturedOn: string;
  entries: readonly SolutionCaptureProvenanceEntry[];
  environment: string;
  sourceRevision: string;
  viewport: typeof SOLUTION_CAPTURE_VIEWPORT;
};

export type SolutionCapturePlanItem = {
  key: string;
  locale: SolutionPublicLocale;
  mainSrc: string;
  navSrc: string;
  route: string;
  solution: SolutionCatalogEntry;
  theme: SolutionCaptureTheme;
  workspaceSlug: string;
};

export function solutionCaptureKey(solution: SolutionId, locale: string, theme: SolutionCaptureTheme): string {
  return `${solution}:${locale}:${theme}`;
}

export function solutionCaptureRoute(solution: SolutionCatalogEntry, uiLocale: string): string {
  const dataLocale = solutionDataLocaleForUiLocale(uiLocale);
  return `/${uiLocale}/w/${solution.workspaces[dataLocale].slug}${solution.previewRoute}`;
}

export function solutionCaptureSrc(
  solution: SolutionId,
  locale: string,
  theme: SolutionCaptureTheme,
  variant: "main" | "nav",
): string {
  const suffix = variant === "nav" ? "-nav" : "";
  return `${SOLUTION_CAPTURE_PUBLIC_DIR}/${theme}/${solution}-${locale}${suffix}.webp`;
}

export function solutionCapturePlan(catalog: readonly SolutionCatalogEntry[] = SOLUTION_CATALOG) {
  return catalog.flatMap((solution) =>
    solution.publicLocales.flatMap((locale) =>
      SOLUTION_CAPTURE_THEMES.map(
        (theme): SolutionCapturePlanItem => ({
          key: solutionCaptureKey(solution.id, locale, theme),
          locale,
          mainSrc: solutionCaptureSrc(solution.id, locale, theme, "main"),
          navSrc: solutionCaptureSrc(solution.id, locale, theme, "nav"),
          route: solutionCaptureRoute(solution, locale),
          solution,
          theme,
          workspaceSlug: solution.workspaces[solutionDataLocaleForUiLocale(locale)].slug,
        }),
      ),
    ),
  );
}

export function navThumbnailSize(main: { height: number; width: number }): { height: number; width: number } {
  if (main.width <= SOLUTION_NAV_THUMBNAIL_WIDTH) return { height: main.height, width: main.width };
  return {
    height: Math.round((main.height * SOLUTION_NAV_THUMBNAIL_WIDTH) / main.width),
    width: SOLUTION_NAV_THUMBNAIL_WIDTH,
  };
}

export function findSolutionCapture(
  manifest: SolutionCaptureManifest,
  solution: SolutionId,
  locale: string,
  theme: SolutionCaptureTheme,
): SolutionCaptureEntry | undefined {
  return manifest.entries.find(
    (entry) => entry.solution === solution && entry.locale === locale && entry.theme === theme,
  );
}

export type SolutionCapturePair = Record<SolutionCaptureTheme, SolutionCaptureEntry>;

export function solutionCapturePair(
  manifest: SolutionCaptureManifest,
  solution: SolutionId,
  locale: string,
): SolutionCapturePair | null {
  const light = findSolutionCapture(manifest, solution, locale, "light");
  const dark = findSolutionCapture(manifest, solution, locale, "dark");
  return light && dark ? { dark, light } : null;
}

export type SolutionCaptureFileFacts = {
  bytes: number;
  sha256: string;
};

export type SolutionCaptureCheckOptions = {
  allowPlaceholders: boolean;
  budgetBytes?: number;
  catalog?: readonly SolutionCatalogEntry[];
  readFile: (publicSrc: string) => SolutionCaptureFileFacts | null;
};

export type SolutionCaptureCheckResult = {
  placeholders: string[];
  problems: string[];
  totalBytes: number;
};

function checkAsset(
  label: string,
  asset: SolutionCaptureAsset,
  expectedSha256: string | undefined,
  readFile: SolutionCaptureCheckOptions["readFile"],
  problems: string[],
): number {
  const facts = readFile(asset.src);
  if (!facts) {
    problems.push(`${label}: missing file ${asset.src}`);
    return 0;
  }
  if (facts.bytes !== asset.bytes)
    problems.push(`${label}: ${asset.src} is ${facts.bytes} bytes, manifest says ${asset.bytes}`);
  if (expectedSha256 !== undefined && facts.sha256 !== expectedSha256)
    problems.push(`${label}: ${asset.src} sha256 differs from its provenance`);
  if (asset.width <= 0 || asset.height <= 0) problems.push(`${label}: ${asset.src} has no usable size`);
  return facts.bytes;
}

export function checkSolutionCaptureManifest(
  manifest: SolutionCaptureManifest,
  provenance: SolutionCaptureProvenance,
  options: SolutionCaptureCheckOptions,
): SolutionCaptureCheckResult {
  const plan = solutionCapturePlan(options.catalog);
  const problems: string[] = [];
  const placeholders: string[] = [];
  const planned = new Map(plan.map((item) => [item.key, item]));
  const provenanceByKey = new Map(provenance.entries.map((entry) => [entry.key, entry]));
  const seen = new Set<string>();
  const counted = new Set<string>();
  let totalBytes = 0;

  for (const entry of manifest.entries) {
    const key = solutionCaptureKey(entry.solution, entry.locale, entry.theme);
    const item = planned.get(key);
    if (!item) {
      problems.push(`${key}: not a published solution view`);
      continue;
    }
    if (seen.has(key)) problems.push(`${key}: listed twice`);
    seen.add(key);

    if (entry.placeholder) {
      placeholders.push(key);
      if (!options.allowPlaceholders) problems.push(`${key}: still a placeholder capture`);
    } else if (entry.main.src !== item.mainSrc || entry.nav.src !== item.navSrc)
      problems.push(`${key}: captured files must live at ${item.mainSrc} and ${item.navSrc}`);

    const evidence = provenanceByKey.get(key);
    if (!evidence) problems.push(`${key}: no provenance entry`);
    else if (!entry.placeholder && evidence.route !== item.route)
      problems.push(`${key}: captured ${evidence.route}, expected ${item.route}`);

    for (const [label, asset, sha] of [
      ["main", entry.main, evidence?.mainSha256],
      ["nav", entry.nav, evidence?.navSha256],
    ] as const) {
      const bytes = checkAsset(`${key} ${label}`, asset, sha, options.readFile, problems);
      if (!entry.placeholder && !counted.has(asset.src)) {
        counted.add(asset.src);
        totalBytes += bytes;
      }
    }
  }

  for (const key of planned.keys()) if (!seen.has(key)) problems.push(`${key}: missing capture`);

  const budget = options.budgetBytes ?? SOLUTION_CAPTURE_BUDGET_BYTES;
  if (totalBytes > budget) problems.push(`captures use ${totalBytes} bytes, over the ${budget}-byte budget`);

  return { placeholders, problems, totalBytes };
}
