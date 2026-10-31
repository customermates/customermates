import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const TARGETS = ["cloud-chromium", "cloud-firefox", "cloud-webkit", "cloud-mobile", "self-hosted-chromium"];
const SMOKE_SPECS = ["browser-diagnostics", "route-refresh", "record-drawer-back", "record-tools", "workspace-profile"]
  .map((name) => `tests/e2e/${name}.spec.ts`)
  .join(" ");

// Only isolated public-page inputs qualify. Shared routing, layouts, i18n, dependencies, API definitions, and all
// unknown paths deliberately require the full suite. In particular, core/seo/route-aliases.ts is used by the proxy.
export function pathProfile(path) {
  if (/^(?:[^/]+\.md|(?:docs|\.github)\/.*\.md)$/.test(path)) return "docs";
  if (/^(?:content\/|app\/\[locale\]\/\(static\)\/|components\/(?:marketing|seo)\/)/.test(path)) return "marketing";
  if (
    /^core\/seo\/(?:alternates|branded-title|compare-title|homepage-metadata|hub-pagination|landing-hubs|missing-content-page|noindex-metadata|related-selection|schemas|sitemap)\.ts$/.test(
      path,
    )
  )
    return "marketing";
  if (/^core\/fumadocs\/(?:metadata|schemas\/[^/]+)\.tsx?$/.test(path)) return "marketing";
  if (/^app\/(?:sitemap|robots|manifest)\.ts$/.test(path)) return "marketing";
  if (/^app\/components\/footer(?:-badges|-selection)?\.tsx?$/.test(path)) return "marketing";
  if (/^public\/(?:images|marketing|screenshots)\/.*\.(?:avif|gif|ico|jpe?g|png|svg|webm|webp|mp4)$/.test(path))
    return "marketing";
  return "full";
}

export function createPlan({ files = null, eventName, requestedTargets = "all", reason } = {}) {
  const forced = !["pull_request", "push"].includes(eventName);
  const profiles = files?.map(pathProfile);
  const profile =
    forced || !profiles?.length || profiles.includes("full")
      ? "full"
      : profiles.includes("marketing")
        ? "marketing"
        : "docs";
  const full = profile === "full";
  let targets = full ? (eventName === "pull_request" ? ["cloud-chromium", "self-hosted-chromium"] : TARGETS) : [];
  if (eventName === "workflow_dispatch" && requestedTargets && requestedTargets !== "all") {
    targets = [...new Set(requestedTargets.split(",").map((target) => target.trim()))];
    assert(targets.length && targets.every((target) => TARGETS.includes(target)), "Invalid requested browser target");
  }
  const shards = targets.flatMap((target) => {
    const count = /webkit|mobile/.test(target) ? 8 : 6;
    return Array.from({ length: count }, (_, index) => ({
      target,
      shards: count,
      shard: index + 1,
      files: "",
    }));
  });
  if (full && eventName === "pull_request")
    shards.push({
      target: "cloud-firefox",
      shards: 1,
      shard: 1,
      files: SMOKE_SPECS,
    });
  const pages = profile !== "docs";
  const modes = [
    ...new Set([
      ...targets.map((target) => (target.startsWith("self-hosted") ? "self-hosted" : "cloud")),
      ...(pages ? ["self-hosted"] : []),
    ]),
  ].sort();
  return {
    profile,
    static: pages,
    unit: full,
    postgres: full,
    marketing: profile === "marketing",
    pages,
    build: pages,
    e2e: full,
    modes,
    shards,
    changedFiles: files?.length ?? null,
    reason:
      reason ??
      (forced
        ? "Scheduled/manual runs use full coverage"
        : !files?.length
          ? "No reliable changed-file list; use full coverage"
          : `All ${files.length} changed paths classified as ${profile}`),
  };
}

export function planForEvent(
  eventName,
  event,
  { cwd = process.cwd(), requestedTargets = event?.inputs?.targets } = {},
) {
  if (!["pull_request", "push"].includes(eventName)) return createPlan({ eventName, requestedTargets });
  try {
    const base = eventName === "pull_request" ? event.pull_request.base.sha : event.before;
    const head = eventName === "pull_request" ? event.pull_request.head.sha : event.after;
    for (const sha of [base, head]) assert(/^[a-f0-9]{40}$/i.test(sha) && !/^0+$/.test(sha), "Missing commit SHA");
    const git = (args) =>
      execFileSync("git", args, {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 32 * 1024 * 1024,
      });
    const start = eventName === "pull_request" ? git(["merge-base", base, head]).trim() : base;
    // --no-renames includes both the deleted and added paths, so moving backend code into an allowlisted directory
    // cannot hide its original scope. NUL delimiters preserve spaces/newlines; there is no API changed-file limit.
    const files = git(["diff", "--name-only", "--no-renames", "-z", start, head, "--"]).split("\0").filter(Boolean);
    return createPlan({ eventName, files });
  } catch (error) {
    return createPlan({
      eventName,
      reason: `Diff unavailable; use full coverage (${error.message.split("\n")[0]})`,
    });
  }
}

export function isMarketingTest(path) {
  if (!/\.test\.tsx?$/.test(path)) return false;
  return (
    /^(?:tests\/conventions\/|core\/(?:seo|fumadocs)\/|components\/(?:marketing|seo)\/|app\/\[locale\]\/\(static\)\/)/.test(
      path,
    ) ||
    path === "app/__tests__/sitemap.test.ts" ||
    path === "app/components/__tests__/footer-content.test.ts"
  );
}

export function assertJobResults(workflow, plan, results) {
  assert(["full", "marketing", "docs"].includes(plan.profile), "CI plan must succeed and declare a known profile");
  const expected = createPlan({
    eventName: "pull_request",
    files: plan.profile === "docs" ? ["README.md"] : plan.profile === "marketing" ? ["content/example.mdx"] : null,
  });
  for (const flag of ["static", "unit", "postgres", "marketing", "pages", "build", "e2e"]) {
    assert.equal(String(plan[flag]), String(expected[flag]), `Invalid/missing plan flag: ${flag}`);
  }
  const required =
    workflow === "tests"
      ? {
          plan: true,
          static: expected.static,
          vitest: expected.unit,
          "self-hosted-postgres-16": expected.postgres,
          marketing: expected.marketing,
          browser: true,
        }
      : workflow === "e2e"
        ? {
            plan: true,
            build: expected.build,
            shard: expected.e2e,
            pages: expected.pages,
          }
        : null;
  assert(required, "Unknown CI workflow");
  assert.deepEqual(
    Object.keys(results).sort(),
    Object.keys(required).sort(),
    "Every planned dependency must be checked",
  );
  for (const [job, enabled] of Object.entries(required)) {
    assert.equal(
      results[job]?.result,
      enabled ? "success" : "skipped",
      `${job} must ${enabled ? "pass" : "be explicitly skipped by the plan"}`,
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === "--check-jobs") {
    assertJobResults(process.argv[3], JSON.parse(process.env.PLAN), JSON.parse(process.env.RESULTS));
    console.log("Every selected job passed; only deliberately omitted jobs were skipped.");
  } else if (process.argv[2] === "--marketing-tests") {
    const files = execFileSync("git", ["ls-files", "-z"], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    })
      .split("\0")
      .filter(isMarketingTest)
      .sort();
    assert(files.length > 100, "Marketing verification must include the complete convention suite");
    console.log(files.join(","));
  } else {
    let plan;
    try {
      plan = planForEvent(
        process.env.GITHUB_EVENT_NAME,
        JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")),
      );
    } catch {
      plan = createPlan({ reason: "Event unavailable; use full coverage" });
    }
    const output = Object.entries(plan)
      .map(([key, value]) => `${key}=${typeof value === "object" ? JSON.stringify(value) : value}`)
      .join("\n");
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${output}\n`);
    if (process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        `### CI selection: ${plan.profile}\n\n${plan.reason}\n\n| Check | Selected |\n| --- | --- |\n${["static", "unit", "postgres", "marketing", "pages", "e2e"].map((key) => `| ${key} | ${plan[key]} |`).join("\n")}\n\nProduction modes: ${plan.modes.join(", ") || "none"}; browser shards: ${plan.shards.length}.\n`,
      );
    console.log(JSON.stringify(plan, null, 2));
  }
}
