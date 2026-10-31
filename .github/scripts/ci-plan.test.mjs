import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

import { assertJobResults, createPlan, isMarketingTest, pathProfile, planForEvent } from "./ci-plan.mjs";

test("isolated content and SEO changes avoid application databases and browsers", () => {
  const plan = createPlan({
    eventName: "pull_request",
    files: ["content/blog/en/example.mdx", "app/sitemap.ts", "core/seo/sitemap.ts", "README.md"],
  });
  assert.equal(plan.profile, "marketing");
  for (const flag of ["static", "marketing", "pages", "build"]) assert.equal(plan[flag], true);
  for (const flag of ["unit", "postgres", "e2e"]) assert.equal(plan[flag], false);
  assert.deepEqual(plan.modes, ["self-hosted"]);
  assert.deepEqual(plan.shards, []);
  assert.equal(createPlan({ eventName: "push", files: ["content/blog/en/example.mdx"] }).profile, "marketing");
});

test("repository guides need no application build; product documentation still does", () => {
  const plan = createPlan({
    eventName: "pull_request",
    files: ["README.md", ".github/CONTRIBUTING.md", "docs/operations.md"],
  });
  assert.equal(plan.profile, "docs");
  assert.deepEqual(plan.modes, []);
  for (const flag of ["static", "unit", "postgres", "marketing", "pages", "build", "e2e"])
    assert.equal(plan[flag], false);
  assert.equal(pathProfile("content/docs/en/api.mdx"), "marketing");
});

test("shared code, dependencies, CI, generated APIs and unknown paths always require full coverage", () => {
  for (const path of [
    "features/record/save.interactor.ts",
    "app/api/records/route.ts",
    "prisma/schema.prisma",
    "prisma/migrations/new/migration.sql",
    "proxy.ts",
    "next.config.ts",
    "app/[locale]/layout.tsx",
    "core/seo/route-aliases.ts",
    "core/seo/public-host.ts",
    "components/shared/button.tsx",
    "i18n/locales/en.json",
    "app/globals.css",
    "package.json",
    "yarn.lock",
    ".github/workflows/e2e.yml",
    ".github/actions/ci-plan/action.yml",
    ".github/scripts/ci-plan.mjs",
    "public/v1/openapi.json",
    "public/.well-known/mcp/server-card.json",
    "a-new-directory/file.ts",
  ]) {
    const plan = createPlan({
      eventName: "pull_request",
      files: ["content/blog/en/seo.mdx", path],
    });
    assert.equal(plan.profile, "full", path);
    assert.equal(plan.unit, true, path);
    assert.equal(plan.shards.length, 13, path);
  }
});

test("full PRs retain both Chromium targets and Firefox smoke; main and nightly retain all five targets", () => {
  const pr = createPlan({
    eventName: "pull_request",
    files: ["features/example.ts"],
  });
  assert.equal(pr.shards.filter((shard) => shard.target === "cloud-firefox").length, 1);
  assert.match(pr.shards.find((shard) => shard.target === "cloud-firefox").files, /browser-diagnostics/);
  for (const eventName of ["push", "schedule", "workflow_dispatch"]) {
    const plan = createPlan({ eventName, files: ["features/example.ts"] });
    assert.equal(new Set(plan.shards.map((shard) => shard.target)).size, 5);
    assert.equal(plan.shards.length, 34);
  }
});

test("manual/nightly/unknown events and an empty or unavailable diff select full coverage", () => {
  for (const eventName of ["schedule", "workflow_dispatch", "unexpected-event"]) {
    assert.equal(createPlan({ eventName, files: ["README.md"] }).profile, "full");
  }
  for (const files of [[], null]) assert.equal(createPlan({ eventName: "pull_request", files }).profile, "full");
  const manual = createPlan({
    eventName: "workflow_dispatch",
    requestedTargets: "cloud-webkit",
  });
  assert.equal(manual.shards.length, 8);
  assert.deepEqual(manual.modes, ["cloud", "self-hosted"]);
  assert.throws(
    () =>
      createPlan({
        eventName: "workflow_dispatch",
        requestedTargets: "unknown",
      }),
    /Invalid/,
  );
});

test("every public-page test and the entire convention suite are included without selecting database tests", () => {
  for (const path of [
    "tests/conventions/env-config.test.ts",
    "core/seo/__tests__/sitemap.test.ts",
    "core/fumadocs/__tests__/metadata.test.ts",
    "components/marketing/__tests__/hero.test.tsx",
    "app/[locale]/(static)/__tests__/static-layout.test.ts",
    "app/__tests__/sitemap.test.ts",
    "app/components/__tests__/footer-content.test.ts",
  ])
    assert.equal(isMarketingTest(path), true, path);
  for (const path of [
    "tests/conventions/review-base.ts",
    "features/record/__tests__/save.test.ts",
    "tests/e2e/records.spec.ts",
  ])
    assert.equal(isMarketingTest(path), false, path);
});

function temporaryRepo(run) {
  const cwd = mkdtempSync(join(tmpdir(), "customermates-ci-plan-"));
  const git = (...args) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const write = (path, content = "example") => {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), content);
  };
  const commit = () => {
    git("add", ".");
    git("commit", "-m", "test: exercise diff selection");
    return git("rev-parse", "HEAD");
  };
  try {
    git("init", "--initial-branch=main");
    git("config", "user.name", "CI selection test");
    git("config", "user.email", "ci-plan@customermates.test");
    write("README.md");
    const base = commit();
    run({ cwd, git, write, commit, base });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("PR selection uses the entire PR diff, rather than the final SEO-only commit", () =>
  temporaryRepo(({ cwd, write, commit, base }) => {
    write("features/record.ts");
    commit();
    write("content/blog/en/seo.mdx");
    const head = commit();
    assert.equal(
      planForEvent("pull_request", { pull_request: { base: { sha: base }, head: { sha: head } } }, { cwd }).profile,
      "full",
    );
  }));

test("a PR merge-base ignores unrelated changes that landed on main", () =>
  temporaryRepo(({ cwd, git, write, commit, base }) => {
    git("checkout", "-b", "feat/content");
    write("content/blog/en/seo.mdx");
    const head = commit();
    git("checkout", "main");
    write("features/main-only.ts");
    const advancedBase = commit();
    assert.notEqual(base, advancedBase);
    assert.equal(
      planForEvent("pull_request", { pull_request: { base: { sha: advancedBase }, head: { sha: head } } }, { cwd })
        .profile,
      "marketing",
    );
  }));

test("renames include the old backend path and deletions remain visible", () =>
  temporaryRepo(({ cwd, git, write, commit, base }) => {
    write("features/backend.ts");
    const before = commit();
    git("mv", "features/backend.ts", "content.mdx");
    const after = commit();
    assert.equal(planForEvent("push", { before, after }, { cwd }).profile, "full");
    git("rm", "content.mdx");
    const deleted = commit();
    assert.equal(planForEvent("push", { before: after, after: deleted }, { cwd }).changedFiles, 1);
    assert.notEqual(base, before);
  }));

test("paths containing newlines survive the Git diff and large diffs have no API pagination cutoff", () =>
  temporaryRepo(({ cwd, write, commit, base }) => {
    for (let index = 0; index < 350; index++) write(`content/blog/en/${index}.mdx`);
    write("content/blog/en/with\nnewline.mdx");
    write("features/late-backend.ts");
    const head = commit();
    const plan = planForEvent("push", { before: base, after: head }, { cwd });
    assert.equal(plan.changedFiles, 352);
    assert.equal(plan.profile, "full");
  }));

test("missing history and malformed events cannot skip checks", () =>
  temporaryRepo(({ cwd, base }) => {
    for (const event of [{}, { before: "0".repeat(40), after: base }, { before: "f".repeat(40), after: base }]) {
      const plan = planForEvent("push", event, { cwd });
      assert.equal(plan.profile, "full");
      assert.equal(plan.unit, true);
      assert.match(plan.reason, /Diff unavailable/);
    }
  }));

for (const profile of ["full", "marketing", "docs"]) {
  test(`required gates accept only deliberate skips for the ${profile} profile`, () => {
    const plan = createPlan({
      eventName: "pull_request",
      files: profile === "full" ? ["unknown"] : profile === "marketing" ? ["content/blog/en/seo.mdx"] : ["README.md"],
    });
    for (const [workflow, enabled] of Object.entries({
      tests: {
        plan: true,
        static: plan.static,
        vitest: plan.unit,
        "self-hosted-postgres-16": plan.postgres,
        marketing: plan.marketing,
        browser: true,
      },
      e2e: {
        plan: true,
        build: plan.build,
        shard: plan.e2e,
        pages: plan.pages,
      },
    })) {
      const results = Object.fromEntries(
        Object.entries(enabled).map(([job, run]) => [job, { result: run ? "success" : "skipped" }]),
      );
      assert.doesNotThrow(() => assertJobResults(workflow, plan, results));
      for (const job of Object.keys(results)) {
        for (const result of ["failure", "cancelled", ...(enabled[job] ? ["skipped"] : [])]) {
          assert.throws(
            () =>
              assertJobResults(workflow, plan, {
                ...results,
                [job]: { result },
              }),
            undefined,
            `${profile}/${job}/${result}`,
          );
        }
      }
      const brokenPlan = { ...plan };
      delete brokenPlan.profile;
      assert.throws(() => assertJobResults(workflow, brokenPlan, results));
      assert.throws(() => assertJobResults(workflow, { ...plan, unit: !plan.unit }, results));
      assert.throws(() =>
        assertJobResults(workflow, plan, {
          ...results,
          unexpected: { result: "success" },
        }),
      );
    }
  });
}
