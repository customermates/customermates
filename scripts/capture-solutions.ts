import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import sharp from "sharp";
import { chromium, type Browser } from "@playwright/test";

import { assertLocalDatabaseEnvironment } from "./local-database-safety";
import {
  captureNavigationUrl,
  parseCaptureSolutionsArgs,
  type CaptureSolutionsOptions,
} from "./lib/capture-solutions-options";

import { HOMEPAGE_CAPTURE_PROVENANCE } from "@/app/[locale]/(static)/components/homepage-capture-provenance";
import {
  SOLUTION_CAPTURE_VIEWPORT,
  type SolutionCaptureEntry,
  type SolutionCaptureFileFacts,
  type SolutionCaptureManifest,
  type SolutionCapturePlanItem,
  type SolutionCaptureProvenance,
  type SolutionCaptureProvenanceEntry,
  checkSolutionCaptureManifest,
  navThumbnailSize,
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
const READY_TIMEOUT_MS = 30_000;

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
  execFileSync("npx", ["prisma", "migrate", "reset", "--force", "--skip-seed"], { cwd: ROOT, stdio: "inherit" });
  execFileSync("npx", ["prisma", "db", "seed"], { cwd: ROOT, stdio: "inherit" });
}

async function captureItem(browser: Browser, baseUrl: string, item: SolutionCapturePlanItem) {
  const context = await browser.newContext({
    colorScheme: item.theme,
    deviceScaleFactor: SOLUTION_CAPTURE_VIEWPORT.deviceScaleFactor,
    locale: isLocaleCode(item.locale) ? formattingTagFor(item.locale) : undefined,
    timezoneId: "Europe/Berlin",
    viewport: { height: SOLUTION_CAPTURE_VIEWPORT.height, width: SOLUTION_CAPTURE_VIEWPORT.width },
  });
  await context.addInitScript((theme) => window.localStorage.setItem("theme", theme), item.theme);

  try {
    const page = await context.newPage();
    await page.goto(captureNavigationUrl(baseUrl, item.route), { waitUntil: "networkidle" });
    const landed = new URL(page.url()).pathname;
    if (landed !== item.route) throw new Error(`${item.key}: landed on ${landed}, expected ${item.route}`);

    await page.waitForFunction(
      () =>
        document.fonts.status === "loaded" &&
        document.querySelector("main") !== null &&
        document.querySelector('[aria-busy="true"], .animate-pulse') === null,
      undefined,
      { timeout: READY_TIMEOUT_MS },
    );
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

    const png = await page.screenshot({ animations: "disabled", caret: "hide", type: "png" });
    const main = await sharp(png).webp({ quality: MAIN_WEBP_QUALITY }).toBuffer({ resolveWithObject: true });
    const navSize = navThumbnailSize(main.info);
    const nav = await sharp(png)
      .resize(navSize.width, navSize.height)
      .webp({ quality: NAV_WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });

    for (const [src, buffer] of [
      [item.mainSrc, main.data],
      [item.navSrc, nav.data],
    ] as const) {
      mkdirSync(dirname(publicFile(src)), { recursive: true });
      writeFileSync(publicFile(src), new Uint8Array(buffer));
    }

    const entry: SolutionCaptureEntry = {
      locale: item.locale,
      main: { bytes: main.data.byteLength, height: main.info.height, src: item.mainSrc, width: main.info.width },
      nav: { bytes: nav.data.byteLength, height: nav.info.height, src: item.navSrc, width: nav.info.width },
      placeholder: false,
      solution: item.solution.id,
      theme: item.theme,
    };
    const evidence: SolutionCaptureProvenanceEntry = {
      key: item.key,
      mainSha256: sha256(main.data),
      navSha256: sha256(nav.data),
      route: item.route,
    };
    return { entry, evidence };
  } finally {
    await context.close();
  }
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

  const browser = await chromium.launch();
  try {
    for (const item of plan) {
      const result = await captureItem(browser, options.baseUrl, item);
      entries.set(item.key, result.entry);
      evidence.set(item.key, result.evidence);
      console.log(`captured ${item.key} ${result.entry.main.bytes + result.entry.nav.bytes} bytes`);
    }
  } finally {
    await browser.close();
  }

  const order = solutionCapturePlan().map((item) => item.key);
  const sorted = <T>(map: Map<string, T>) => order.filter((key) => map.has(key)).map((key) => map.get(key)!);
  const provenance: SolutionCaptureProvenance = {
    capturedOn: new Date().toISOString().slice(0, 10),
    entries: sorted(evidence),
    environment:
      "Local APP_MODE=demo instance on a freshly reset and seeded PostgreSQL database; Chromium via Playwright",
    sourceRevision: `${git(["rev-parse", "--short=9", "HEAD"])}${dirty ? "-dirty" : ""}`,
    viewport: SOLUTION_CAPTURE_VIEWPORT,
  };

  writeJson(MANIFEST_PATH, { entries: sorted(entries) } satisfies SolutionCaptureManifest);
  writeJson(PROVENANCE_PATH, provenance);
}

function check(options: CaptureSolutionsOptions): void {
  const result = checkSolutionCaptureManifest(
    readJson<SolutionCaptureManifest>(MANIFEST_PATH),
    readJson<SolutionCaptureProvenance>(PROVENANCE_PATH),
    { allowPlaceholders: options.allowPlaceholders, readFile: readFacts },
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
