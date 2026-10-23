import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import sharp from "sharp";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { assertLocalDatabaseEnvironment } from "./local-database-safety";
import {
  captureNavigationUrl,
  parseCaptureSolutionsArgs,
  type CaptureSolutionsOptions,
} from "./lib/capture-solutions-options";
import { solutionNavPreview, solutionNavRouteForPlanItem } from "./lib/solution-nav-routes";

import { SIDEBAR_MIN_WIDTH, SIDEBAR_WIDTH_COOKIE_NAME } from "@/components/layout/sidebar-width";
import { HOMEPAGE_CAPTURE_PROVENANCE } from "@/app/[locale]/(static)/components/homepage-capture-provenance";
import {
  SOLUTION_CAPTURE_VIEWPORT,
  SOLUTION_NAV_CAPTURE_CLIP,
  SOLUTION_NAV_CAPTURE_VIEWPORT,
  SOLUTION_NAV_IMAGE_SIZE,
  type SolutionCaptureAsset,
  type SolutionCaptureEntry,
  type SolutionCaptureFileFacts,
  type SolutionCaptureManifest,
  type SolutionCapturePlanItem,
  type SolutionCaptureProvenance,
  type SolutionCaptureProvenanceEntry,
  checkSolutionCaptureManifest,
  solutionCapturePlan,
} from "@/core/solutions/solution-captures";
import { formattingTagFor, isLocaleCode } from "@/i18n/locale-registry";
import { solutionDataLocaleForUiLocale } from "@/core/solutions/solution-catalog";

const ROOT = process.cwd();
const PUBLIC_ROOT = join(ROOT, "public");
const MANIFEST_PATH = join(ROOT, "core", "solutions", "solution-capture-manifest.json");
const PROVENANCE_PATH = join(ROOT, "core", "solutions", "solution-capture-provenance.json");
const MAIN_WEBP_QUALITY = 82;
const NAV_WEBP_QUALITY = 78;
const READY_TIMEOUT_MS = 60_000;
const STABLE_SAMPLES = 3;
const STABLE_SAMPLE_INTERVAL_MS = 400;
const NAVIGATION_TIMEOUT_MS = 90_000;
const CAPTURE_ATTEMPTS = 3;
const HIDE_DEV_OVERLAY_CSS = "nextjs-portal { display: none !important; }";

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(new Uint8Array(buffer)).digest("hex");
}

function publicFile(src: string): string {
  return join(PUBLIC_ROOT, src);
}

function readFacts(src: string): SolutionCaptureFileFacts | null {
  const file = publicFile(src);
  if (!existsSync(file)) return null;
  const buffer = readFileSync(file);
  return { bytes: buffer.byteLength, sha256: sha256(buffer) };
}

function git(args: string[]): string {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function selectedPlan(options: CaptureSolutionsOptions): SolutionCapturePlanItem[] {
  const plan = solutionCapturePlan();
  if (options.only.length === 0) return plan;
  const unknown = options.only.filter((id) => !plan.some((item) => item.solution.id === id));
  if (unknown.length > 0) throw new Error(`Unknown solution ids: ${unknown.join(", ")}`);
  return plan.filter((item) => options.only.includes(item.solution.id));
}

async function assetFor(src: string) {
  const buffer = readFileSync(publicFile(src));
  const metadata = await sharp(buffer).metadata();
  if (!metadata.width || !metadata.height) throw new Error(`${src} has no readable size`);
  return {
    asset: { bytes: buffer.byteLength, height: metadata.height, src, width: metadata.width },
    sha256: sha256(buffer),
  };
}

async function writePlaceholders(): Promise<void> {
  const entries: SolutionCaptureEntry[] = [];
  const evidence: SolutionCaptureProvenanceEntry[] = [];

  for (const item of solutionCapturePlan()) {
    const src = `/captures/${item.theme}/homepage-dashboard-${solutionDataLocaleForUiLocale(item.locale)}.png`;
    const { asset, sha256: digest } = await assetFor(src);
    entries.push({
      locale: item.locale,
      main: asset,
      nav: asset,
      placeholder: true,
      solution: item.solution.id,
      theme: item.theme,
    });
    evidence.push({ key: item.key, mainSha256: digest, navSha256: digest, route: item.route });
  }

  const provenance: SolutionCaptureProvenance = {
    capturedOn: HOMEPAGE_CAPTURE_PROVENANCE.capturedOn,
    entries: evidence,
    environment: `Placeholder: homepage dashboard captures. ${HOMEPAGE_CAPTURE_PROVENANCE.environment}`,
    sourceRevision: HOMEPAGE_CAPTURE_PROVENANCE.productRef,
    viewport: SOLUTION_CAPTURE_VIEWPORT,
  };

  writeJson(MANIFEST_PATH, { entries } satisfies SolutionCaptureManifest);
  writeJson(PROVENANCE_PATH, provenance);
  console.log(`Wrote ${entries.length} placeholder entries`);
}

function resetDatabase(): void {
  assertLocalDatabaseEnvironment(process.env);
  execFileSync("npx", ["prisma", "migrate", "reset", "--force"], { cwd: ROOT, stdio: "inherit" });
  execFileSync("npx", ["prisma", "db", "seed"], { cwd: ROOT, stdio: "inherit" });
}

async function waitForStableGeometry(page: Page): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let previous = "";
  let stableSamples = 0;
  while (stableSamples < STABLE_SAMPLES) {
    if (Date.now() > deadline) throw new Error(`${page.url()}: charts kept moving for ${READY_TIMEOUT_MS} ms`);
    await page.waitForTimeout(STABLE_SAMPLE_INTERVAL_MS);
    const current = await page.evaluate(() =>
      Array.from(document.querySelectorAll("main svg path, main svg rect, main svg circle"))
        .map(
          (node) =>
            `${node.getAttribute("d") ?? ""}|${node.getAttribute("height") ?? ""}|${node.getAttribute("r") ?? ""}`,
        )
        .join(";"),
    );
    stableSamples = current === previous ? stableSamples + 1 : 0;
    previous = current;
  }
  await page.mouse.move(0, 0);
}

type CapturedImage = { asset: SolutionCaptureAsset; sha256: string };

async function newCaptureContext(
  browser: Browser,
  item: SolutionCapturePlanItem,
  viewport: { deviceScaleFactor: number; height: number; width: number },
): Promise<BrowserContext> {
  const context = await browser.newContext({
    colorScheme: item.theme,
    deviceScaleFactor: viewport.deviceScaleFactor,
    locale: isLocaleCode(item.locale) ? formattingTagFor(item.locale) : undefined,
    timezoneId: "Europe/Berlin",
    viewport: { height: viewport.height, width: viewport.width },
  });
  await context.addInitScript((theme) => window.localStorage.setItem("theme", theme), item.theme);
  return context;
}

async function openReadyPage(
  context: BrowserContext,
  baseUrl: string,
  key: string,
  route: string,
  area?: { height: number; width: number },
): Promise<Page> {
  const page = await context.newPage();
  await page.goto(captureNavigationUrl(baseUrl, route), { timeout: NAVIGATION_TIMEOUT_MS, waitUntil: "networkidle" });
  const expected = new URL(route, `${baseUrl}/`).pathname;
  const landed = new URL(page.url()).pathname;
  if (landed !== expected) throw new Error(`${key}: landed on ${landed}, expected ${expected}`);

  await page.addStyleTag({ content: HIDE_DEV_OVERLAY_CSS });
  await page.waitForFunction(
    (visible) =>
      document.fonts.status === "loaded" &&
      document.querySelector("main") !== null &&
      Array.from(document.querySelectorAll('[aria-busy="true"], .animate-pulse')).every((node) => {
        if (!visible) return false;
        const box = node.getBoundingClientRect();
        return box.left >= visible.width || box.top >= visible.height || box.width === 0 || box.height === 0;
      }),
    area ?? null,
    { timeout: READY_TIMEOUT_MS },
  );
  await waitForStableGeometry(page);
  return page;
}

function writeWebp(src: string, buffer: Buffer, width: number, height: number): CapturedImage {
  mkdirSync(dirname(publicFile(src)), { recursive: true });
  writeFileSync(publicFile(src), new Uint8Array(buffer));
  return { asset: { bytes: buffer.byteLength, height, src, width }, sha256: sha256(buffer) };
}

async function withRetries<T>(key: string, run: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= CAPTURE_ATTEMPTS) throw error;
      console.warn(
        `${key}: attempt ${attempt} failed (${error instanceof Error ? error.message.split("\n")[0] : error})`,
      );
    }
  }
}

async function captureMain(browser: Browser, baseUrl: string, item: SolutionCapturePlanItem): Promise<CapturedImage> {
  const context = await newCaptureContext(browser, item, SOLUTION_CAPTURE_VIEWPORT);
  try {
    const page = await openReadyPage(context, baseUrl, item.key, item.route);
    const png = await page.screenshot({ animations: "disabled", caret: "hide", type: "png" });
    const main = await sharp(png).webp({ quality: MAIN_WEBP_QUALITY }).toBuffer({ resolveWithObject: true });
    return writeWebp(item.mainSrc, main.data, main.info.width, main.info.height);
  } finally {
    await context.close();
  }
}

async function captureNav(
  browser: Browser,
  baseUrl: string,
  item: SolutionCapturePlanItem,
  route: string,
): Promise<CapturedImage> {
  const context = await newCaptureContext(browser, item, SOLUTION_NAV_CAPTURE_VIEWPORT);
  await context.addCookies([{ name: SIDEBAR_WIDTH_COOKIE_NAME, url: baseUrl, value: String(SIDEBAR_MIN_WIDTH) }]);
  try {
    const page = await openReadyPage(context, baseUrl, item.key, route, SOLUTION_NAV_CAPTURE_CLIP);
    const png = await page.screenshot({
      animations: "disabled",
      caret: "hide",
      clip: { height: SOLUTION_NAV_CAPTURE_CLIP.height, width: SOLUTION_NAV_CAPTURE_CLIP.width, x: 0, y: 0 },
      type: "png",
    });
    const nav = await sharp(png)
      .resize(SOLUTION_NAV_IMAGE_SIZE.width, SOLUTION_NAV_IMAGE_SIZE.height)
      .webp({ quality: NAV_WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });
    return writeWebp(item.navSrc, nav.data, nav.info.width, nav.info.height);
  } finally {
    await context.close();
  }
}

async function captureItem(
  browser: Browser,
  options: CaptureSolutionsOptions,
  item: SolutionCapturePlanItem,
  previous: { entry?: SolutionCaptureEntry; evidence?: SolutionCaptureProvenanceEntry },
) {
  let main: CapturedImage;
  if (options.navOnly) {
    if (!previous.entry || previous.entry.placeholder || !previous.evidence)
      throw new Error(`${item.key}: --nav-only needs an earlier main capture`);
    main = { asset: previous.entry.main, sha256: previous.evidence.mainSha256 };
  } else main = await withRetries(item.key, () => captureMain(browser, options.baseUrl, item));

  const { fallback: navFallback, path: navRoute } = solutionNavPreview(item.solution, item.locale);
  if (navFallback) console.warn(`${item.key}: navigation preview falls back to ${navRoute} (${navFallback})`);
  const nav = await withRetries(item.key, () => captureNav(browser, options.baseUrl, item, navRoute));

  const entry: SolutionCaptureEntry = {
    locale: item.locale,
    main: main.asset,
    nav: nav.asset,
    placeholder: false,
    solution: item.solution.id,
    theme: item.theme,
  };
  const evidence: SolutionCaptureProvenanceEntry = {
    key: item.key,
    mainSha256: main.sha256,
    ...(navFallback ? { navFallback } : {}),
    navRoute,
    navSha256: nav.sha256,
    route: options.navOnly && previous.evidence ? previous.evidence.route : item.route,
  };
  return { entry, evidence };
}

async function capture(options: CaptureSolutionsOptions): Promise<void> {
  const dirty = git(["status", "--porcelain", "--untracked-files=no"]);
  if (dirty && !options.allowDirty)
    throw new Error("Commit or stash tracked changes before capturing (or pass --allow-dirty)");
  if (options.resetDatabase) resetDatabase();

  const plan = selectedPlan(options);
  const manifest = existsSync(MANIFEST_PATH) ? readJson<SolutionCaptureManifest>(MANIFEST_PATH) : { entries: [] };
  const previous = existsSync(PROVENANCE_PATH) ? readJson<SolutionCaptureProvenance>(PROVENANCE_PATH) : null;
  const entries = new Map(manifest.entries.map((entry) => [`${entry.solution}:${entry.locale}:${entry.theme}`, entry]));
  const evidence = new Map((previous?.entries ?? []).map((entry) => [entry.key, entry]));

  const persist = () => {
    const order = solutionCapturePlan().map((item) => item.key);
    const sorted = <T>(map: Map<string, T>) => order.filter((key) => map.has(key)).map((key) => map.get(key)!);
    const today = new Date().toISOString().slice(0, 10);
    const revision = `${git(["rev-parse", "--short=9", "HEAD"])}${dirty ? "-dirty" : ""}`;
    const environment =
      "Local APP_MODE=demo instance on a freshly reset and seeded PostgreSQL database; Chromium via Playwright";
    const keepMain = options.navOnly && previous;
    const provenance: SolutionCaptureProvenance = {
      capturedOn: keepMain ? previous.capturedOn : today,
      entries: sorted(evidence),
      environment: keepMain ? previous.environment : environment,
      nav: {
        capturedOn: today,
        clip: SOLUTION_NAV_CAPTURE_CLIP,
        environment: options.resetDatabase
          ? environment
          : "Local APP_MODE=demo instance on its current seeded database; Chromium via Playwright",
        image: SOLUTION_NAV_IMAGE_SIZE,
        sidebarWidth: SIDEBAR_MIN_WIDTH,
        sourceRevision: revision,
        viewport: SOLUTION_NAV_CAPTURE_VIEWPORT,
      },
      sourceRevision: keepMain ? previous.sourceRevision : revision,
      viewport: SOLUTION_CAPTURE_VIEWPORT,
    };

    writeJson(MANIFEST_PATH, { entries: sorted(entries) } satisfies SolutionCaptureManifest);
    writeJson(PROVENANCE_PATH, provenance);
  };

  const browser = await chromium.launch();
  try {
    for (const item of plan) {
      const result = await captureItem(browser, options, item, {
        entry: entries.get(item.key),
        evidence: evidence.get(item.key),
      });
      entries.set(item.key, result.entry);
      evidence.set(item.key, result.evidence);
      persist();
      console.log(`captured ${item.key} ${result.entry.main.bytes + result.entry.nav.bytes} bytes`);
    }
  } finally {
    await browser.close();
  }
}

function check(options: CaptureSolutionsOptions): void {
  const result = checkSolutionCaptureManifest(
    readJson<SolutionCaptureManifest>(MANIFEST_PATH),
    readJson<SolutionCaptureProvenance>(PROVENANCE_PATH),
    { allowPlaceholders: options.allowPlaceholders, navRoute: solutionNavRouteForPlanItem, readFile: readFacts },
  );
  for (const problem of result.problems) console.error(problem);
  console.log(
    `${result.placeholders.length} placeholder views, ${result.totalBytes} bytes of captured images, ${result.problems.length} problems`,
  );
  if (result.problems.length > 0) process.exitCode = 1;
}

async function main(): Promise<void> {
  const options = parseCaptureSolutionsArgs(process.argv.slice(2));
  if (options.mode === "check") return check(options);
  if (options.mode === "placeholders") return writePlaceholders();
  return capture(options);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
