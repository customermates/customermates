import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { decide } from "../vercel-ignore-build.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));

const github = {
  VERCEL_GIT_PROVIDER: "github",
  VERCEL_GIT_REPO_OWNER: "customermates",
  VERCEL_GIT_REPO_SLUG: "customermates",
};

function preview(branch: string, extra: Record<string, string> = {}) {
  return { ...github, VERCEL_ENV: "preview", VERCEL_TARGET_ENV: "preview", VERCEL_GIT_COMMIT_REF: branch, ...extra };
}

function respond(body: unknown, status = 200) {
  const urls: string[] = [];
  const fetchImpl = (url: string) => {
    urls.push(url);
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  };
  return { fetchImpl: fetchImpl as unknown as typeof fetch, urls };
}

function pull(branch: string, labels: string[], state = "open") {
  return { state, head: { ref: branch }, labels: labels.map((name) => ({ name })) };
}

const unreachable = (() => Promise.reject(new Error("GitHub must not be asked"))) as unknown as typeof fetch;

describe("vercel ignored build step", () => {
  it("always builds production, the main branch and the Demo environment without asking GitHub", async () => {
    await expect(
      decide({ ...github, VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" }, unreachable),
    ).resolves.toMatchObject({ build: true });
    await expect(decide(preview("main"), unreachable)).resolves.toMatchObject({ build: true });
    await expect(decide(preview("main", { VERCEL_TARGET_ENV: "demo" }), unreachable)).resolves.toMatchObject({
      build: true,
    });
    await expect(decide({ VERCEL_GIT_COMMIT_REF: "fix/x" }, unreachable)).resolves.toMatchObject({ build: true });
  });

  it("builds SEO daily branches without asking GitHub", async () => {
    await expect(decide(preview("feat/seo-daily-2026-11-01"), unreachable)).resolves.toMatchObject({ build: true });
    await expect(decide(preview("feat/seo-daily-2026-10-30-audit-fixes"), unreachable)).resolves.toMatchObject({
      build: true,
    });
  });

  it("builds a preview only when the branch's open pull request has the preview label", async () => {
    const labelled = respond([pull("fix/production-errors", ["bug", "preview"])]);
    await expect(decide(preview("fix/production-errors"), labelled.fetchImpl)).resolves.toMatchObject({ build: true });
    expect(labelled.urls).toEqual([
      "https://api.github.com/repos/customermates/customermates/pulls?state=open&per_page=10&head=customermates%3Afix%2Fproduction-errors",
    ]);

    const unlabelled = respond([pull("fix/production-errors", ["bug"])]);
    await expect(decide(preview("fix/production-errors"), unlabelled.fetchImpl)).resolves.toMatchObject({
      build: false,
    });
    await expect(decide(preview("fix/production-errors"), respond([]).fetchImpl)).resolves.toMatchObject({
      build: false,
    });
    const otherBranch = respond([pull("fix/other", ["preview"])]);
    await expect(decide(preview("fix/production-errors"), otherBranch.fetchImpl)).resolves.toMatchObject({
      build: false,
    });
  });

  it("reads the pull request Vercel names and ignores a closed one", async () => {
    const open = respond(pull("feat/x", ["preview"]));
    await expect(
      decide(preview("feat/x", { VERCEL_GIT_PULL_REQUEST_ID: "267" }), open.fetchImpl),
    ).resolves.toMatchObject({ build: true });
    expect(open.urls).toEqual(["https://api.github.com/repos/customermates/customermates/pulls/267"]);
    const closed = respond(pull("feat/x", ["preview"], "closed"));
    await expect(
      decide(preview("feat/x", { VERCEL_GIT_PULL_REQUEST_ID: "267" }), closed.fetchImpl),
    ).resolves.toMatchObject({ build: false });
  });

  it("skips and names the workflow when GitHub cannot be asked", async () => {
    const result = await decide(preview("feat/x"), respond({ message: "rate limited" }, 403).fetchImpl);
    expect(result.build).toBe(false);
    expect(result.reason).toContain('"Preview deployment" workflow');
  });

  it("exits 1 to build and 0 to skip", () => {
    const script = join(root, "scripts/vercel-ignore-build.mjs");
    const build = spawnSync("node", [script], {
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "", VERCEL_ENV: "production", NODE_ENV: "test" },
    });
    expect(build.status).toBe(1);
    expect(build.stdout).toContain("Building: production deployment.");
    const skip = spawnSync("node", [script], {
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "fix/x", NODE_ENV: "test" },
    });
    expect(skip.status).toBe(0);
    expect(skip.stdout).toContain("Skipping the build: preview without a GitHub branch.");
  });
});
