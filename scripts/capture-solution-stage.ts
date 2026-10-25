import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { chromium, type Browser } from "@playwright/test";

import { newCaptureContext, openReadyPage, sha256, withRetries } from "./lib/capture-page";
import { parseCaptureSolutionStageArgs, type CaptureSolutionStageOptions } from "./lib/capture-solution-stage-options";
import { solutionTargetPath, solutionNavRouteForPlanItem } from "./lib/solution-nav-routes";

import {
  SOLUTION_CAPTURE_BUDGET_BYTES,
  type SolutionCaptureFileFacts,
  type SolutionCaptureManifest,
  type SolutionCaptureProvenance,
  checkSolutionCaptureManifest,
} from "@/core/solutions/solution-captures";
import { SOLUTION_CATALOG, SOLUTION_DATA_LOCALES } from "@/core/solutions/solution-catalog";
import {
  SOLUTION_STAGE_CAPTURE_VIEWPORT,
  SOLUTION_STAGE_IMAGE_SIZE,
  type SolutionStageCaptureEntry,
  type SolutionStageCaptures,
  type SolutionStagePlanItem,
  type SolutionStageRoutes,
  checkSolutionStageCaptures,
  solutionStagePlan,
} from "@/core/solutions/solution-stage";

const ROOT = process.cwd();
const PUBLIC_ROOT = join(ROOT, "public");
const STAGE_PATH = join(ROOT, "core", "solutions", "solution-stage-captures.json");
const MANIFEST_PATH = join(ROOT, "core", "solutions", "solution-capture-manifest.json");
const PROVENANCE_PATH = join(ROOT, "core", "solutions", "solution-capture-provenance.json");
const WEBP_QUALITY = 72;
const MIN_WEBP_QUALITY = 46;
const QUALITY_STEP = 6;

function publicFile(src: string): string {
  return join(PUBLIC_ROOT, src);
}

function readFacts(src: string): SolutionCaptureFileFacts | null {
  const file = publicFile(src);
  if (!existsSync(file)) return null;
  const buffer = readFileSync(file);
  return { bytes: buffer.byteLength, sha256: sha256(buffer) };
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true, sensitivity: "base" }))
      .map(([key, child]) => [key, sortKeys(child)]),
  );
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(sortKeys(value), null, 2)}\n`);
}

function git(args: string[]): string {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function readStage(): SolutionStageCaptures {
  if (!existsSync(STAGE_PATH))
    return { capturedOn: null, entries: [], environment: null, routes: {}, sourceRevision: null };
  return readJson<SolutionStageCaptures>(STAGE_PATH);
}

function resolveRoutes(): SolutionStageRoutes {
  const routes: SolutionStageRoutes = {};
  for (const solution of SOLUTION_CATALOG) {
    const tabs: NonNullable<SolutionStageRoutes[typeof solution.id]> = {};
    for (const tab of solution.stage) {
      const byLocale = Object.fromEntries(
        SOLUTION_DATA_LOCALES.map((dataLocale) => {
          const resolved = solutionTargetPath(solution, tab.target, dataLocale);
          if (resolved.fallback) {
            console.warn(
              `${solution.id}:${tab.id}:${dataLocale}: falls back to ${resolved.path} (${resolved.fallback})`,
            );
          }
          return [dataLocale, resolved.path];
        }),
      );
      tabs[tab.id] = byLocale as Record<(typeof SOLUTION_DATA_LOCALES)[number], string>;
    }
    routes[solution.id] = tabs;
  }
  return routes;
}

function mainCaptureBytes(): number {
  return checkSolutionCaptureManifest(
    readJson<SolutionCaptureManifest>(MANIFEST_PATH),
    readJson<SolutionCaptureProvenance>(PROVENANCE_PATH),
    { allowPlaceholders: true, navRoute: solutionNavRouteForPlanItem, readFile: readFacts },
  ).totalBytes;
}

function selectedPlan(routes: SolutionStageRoutes, only: readonly string[]): SolutionStagePlanItem[] {
  const plan = solutionStagePlan(routes);
  if (only.length === 0) return plan;
  const unknown = only.filter((id) => !plan.some((item) => item.solution.id === id));
  if (unknown.length > 0) throw new Error(`Unknown solution ids: ${unknown.join(", ")}`);
  return plan.filter((item) => only.includes(item.solution.id));
}

function mainCaptureFiles(only: readonly string[]): string[] {
  return SOLUTION_CATALOG.filter((solution) => only.length === 0 || only.includes(solution.id)).flatMap((solution) =>
    solution.publicLocales.flatMap((locale) =>
      ["light", "dark"].flatMap((theme) => [
        `public/captures/solutions/${theme}/${solution.id}-${locale}.webp`,
        `public/captures/solutions/${theme}/${solution.id}-${locale}-nav.webp`,
      ]),
    ),
  );
}

function plannedFiles(options: CaptureSolutionStageOptions): string[] {
  const stage = selectedPlan(readStage().routes, options.only).map((item) => `public${item.src}`);
  const main = options.withMain
    ? [
        ...mainCaptureFiles(options.only),
        "core/solutions/solution-capture-manifest.json",
        "core/solutions/solution-capture-provenance.json",
      ]
    : [];
  return [...main, ...stage, "core/solutions/solution-stage-captures.json"];
}

async function encode(png: Buffer, cap: number): Promise<{ data: Buffer; quality: number }> {
  const { default: sharp } = await import("sharp");
  let quality = WEBP_QUALITY;
  for (;;) {
    const data = await sharp(png)
      .resize(SOLUTION_STAGE_IMAGE_SIZE.width, SOLUTION_STAGE_IMAGE_SIZE.height)
      .webp({ effort: 6, quality })
      .toBuffer();
    if (data.byteLength <= cap || quality - QUALITY_STEP < MIN_WEBP_QUALITY) return { data, quality };
    quality -= QUALITY_STEP;
  }
}

async function captureItem(
  browser: Browser,
  baseUrl: string,
  item: SolutionStagePlanItem,
  cap: number,
): Promise<SolutionStageCaptureEntry> {
  const context = await newCaptureContext(browser, item, SOLUTION_STAGE_CAPTURE_VIEWPORT);
  try {
    const page = await openReadyPage(context, baseUrl, item.key, item.route);
    const png = await page.screenshot({ animations: "disabled", caret: "hide", type: "png" });
    const { data, quality } = await encode(png, cap);
    mkdirSync(dirname(publicFile(item.src)), { recursive: true });
    writeFileSync(publicFile(item.src), new Uint8Array(data));
    console.log(`captured ${item.key} ${data.byteLength} bytes (webp q${quality})`);
    return {
      bytes: data.byteLength,
      height: SOLUTION_STAGE_IMAGE_SIZE.height,
      key: item.key,
      route: item.route,
      sha256: sha256(data),
      src: item.src,
      width: SOLUTION_STAGE_IMAGE_SIZE.width,
    };
  } finally {
    await context.close();
  }
}

function refreshRoutes(): SolutionStageCaptures {
  const stage = readStage();
  const routes = resolveRoutes();
  const plan = new Map(solutionStagePlan(routes).map((item) => [item.key, item]));
  const entries = stage.entries.filter((entry) => plan.get(entry.key)?.route === entry.route);
  const dropped = stage.entries.length - entries.length;
  if (dropped > 0) console.warn(`dropped ${dropped} stage captures whose route changed; recapture them`);
  const next = { ...stage, entries, routes };
  writeJson(STAGE_PATH, next);
  return next;
}

async function capture(options: CaptureSolutionStageOptions): Promise<void> {
  const dirty = git(["status", "--porcelain", "--untracked-files=no"]);
  if (dirty && !options.allowDirty)
    throw new Error("Commit or stash tracked changes before capturing (or pass --allow-dirty)");

  if (options.withMain) {
    const args = ["tsx", "scripts/capture-solutions.ts", "--base-url", options.baseUrl, "--allow-dirty"];
    if (options.only.length > 0) args.push("--only", options.only.join(","));
    execFileSync("npx", args, { cwd: ROOT, stdio: "inherit" });
  }

  const stage = refreshRoutes();
  const plan = selectedPlan(stage.routes, options.only);
  const fullPlan = solutionStagePlan(stage.routes);
  const cap = Math.floor((SOLUTION_CAPTURE_BUDGET_BYTES - mainCaptureBytes()) / fullPlan.length);
  const entries = new Map(stage.entries.map((entry) => [entry.key, entry]));
  const order = fullPlan.map((item) => item.key);
  const revision = `${git(["rev-parse", "--short=9", "HEAD"])}${dirty ? "-dirty" : ""}`;
  const written: string[] = [];

  const persist = () =>
    writeJson(STAGE_PATH, {
      capturedOn: new Date().toISOString().slice(0, 10),
      entries: order.flatMap((key) => entries.get(key) ?? []),
      environment: "Local APP_MODE=demo instance on its current seeded database; Chromium via Playwright",
      routes: stage.routes,
      sourceRevision: revision,
    } satisfies SolutionStageCaptures);

  console.log(`per-image cap ${cap} bytes for ${fullPlan.length} stage captures`);
  const browser = await chromium.launch();
  try {
    for (const item of plan) {
      const entry = await withRetries(item.key, () => captureItem(browser, options.baseUrl, item, cap));
      entries.set(item.key, entry);
      written.push(`public${item.src}`);
      persist();
    }
  } finally {
    await browser.close();
  }

  console.log(`\nWrote ${written.length} stage captures and core/solutions/solution-stage-captures.json:`);
  for (const file of written) console.log(`  ${file}`);
  check({ ...options, requireAll: options.only.length === 0 });
}

function check(options: CaptureSolutionStageOptions): void {
  const baseBytes = mainCaptureBytes();
  const result = checkSolutionStageCaptures(readStage(), {
    baseBytes,
    readFile: readFacts,
    requireAll: options.requireAll,
  });
  for (const problem of result.problems) console.error(problem);
  console.log(
    `${result.missing.length} stage tabs still on their fallback poster, ${result.totalBytes} stage bytes + ${baseBytes} main bytes of ${SOLUTION_CAPTURE_BUDGET_BYTES}, ${result.problems.length} problems`,
  );
  if (result.problems.length > 0) process.exitCode = 1;
}

async function main(): Promise<void> {
  const options = parseCaptureSolutionStageArgs(process.argv.slice(2));
  if (options.mode === "list") {
    for (const file of plannedFiles(options)) console.log(file);
    return;
  }
  if (options.mode === "routes") {
    refreshRoutes();
    console.log(`Wrote routes to core/solutions/solution-stage-captures.json`);
    return;
  }
  if (options.mode === "check") return check(options);
  return capture(options);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
