import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { capture, cleanEnvironment, REPO_ROOT, run } from "./process.mjs";

/**
 * A production build per APP_MODE lives in its own copy of the worktree (.runs/verify/apps/<mode>), so a cloud and a
 * self-hosted build exist side by side, build at the same time, and the worktree stays free for edits while tests run.
 * node_modules is hard-linked from the worktree; the build is skipped when the copied sources are unchanged.
 */
export function appDirectory(mode) {
  return resolve(REPO_ROOT, ".runs/verify/apps", mode);
}

/** A digest of every file the build can see: tracked files, local edits and untracked, non-ignored files. */
export async function sourceDigest() {
  const hash = createHash("sha256");
  if (!existsSync(resolve(REPO_ROOT, ".git"))) {
    // An offloaded mirror has no Git metadata; rsync keeps modification times, so sizes and times identify the sources.
    hash.update(
      await capture("bash", ["-c", "find . \\( -path ./node_modules -o -path ./.runs -o -path ./.next -o -path ./generated -o -path ./.source \\) -prune -o -type f -printf '%P %s %T@\\n' | sort"]),
    );
    return hash.digest("hex").slice(0, 16);
  }
  hash.update(await capture("git", ["rev-parse", "HEAD"]));
  hash.update(await capture("git", ["diff", "HEAD", "--binary"]));
  const untracked = (await capture("git", ["ls-files", "--others", "--exclude-standard"])).split("\n").filter(Boolean).sort();
  for (const file of untracked) {
    hash.update(file);
    if (existsSync(resolve(REPO_ROOT, file))) hash.update(readFileSync(resolve(REPO_ROOT, file)));
  }
  return hash.digest("hex").slice(0, 16);
}

function envFile(mode, overrides) {
  const template = readFileSync(resolve(REPO_ROOT, ".env.cloud.template"), "utf8").split("\n");
  const seen = new Set();
  const lines = template.map((line) => {
    const name = /^([A-Z0-9_]+)=/.exec(line)?.[1];
    if (!name || !(name in overrides)) return line;
    seen.add(name);
    return `${name}=${JSON.stringify(overrides[name])}`;
  });
  for (const [name, value] of Object.entries(overrides)) if (!seen.has(name)) lines.push(`${name}=${JSON.stringify(value)}`);
  return `${lines.join("\n")}\n`;
}

export function e2eEnvironment(mode, { baseUrl, databaseUrl, secret }) {
  return {
    APP_MODE: mode,
    BASE_URL: baseUrl,
    DATABASE_URL: databaseUrl,
    DIRECT_URL: databaseUrl,
    BETTER_AUTH_SECRET: secret,
    HOSTED_AI_OPERATOR_CONTROLS_ENABLED: "true",
    HOSTED_AI_PROVIDER_WORK_PAUSED: "true",
    NEXT_PUBLIC_SENTRY_DSN: "",
    AI_GATEWAY_API_KEY: "",
    NEXT_TELEMETRY_DISABLED: "1",
    CRM_E2E_DATABASE_URL: databaseUrl,
    CRM_E2E_BASE_URL: baseUrl,
    CRM_E2E_SERVER_MODE: "production",
    WORKFLOW_TARGET_WORLD: "local",
  };
}

/** The .env the build and the Playwright fixtures read: the cloud template's placeholders (they select the local fake
 * providers) with the run's own database, origin and secret. */
export function writeEnvFile(directory, mode, { databaseUrl, secret }) {
  const values = e2eEnvironment(mode, { baseUrl: "http://127.0.0.1:4499", databaseUrl, secret });
  writeFileSync(resolve(directory, ".env"), envFile(mode, values), { mode: 0o600 });
}

/** Mirrors the worktree into the mode's copy and writes its private .env; returns the copy's directory and secret. */
export async function syncAppCopy(mode, { databaseUrl, log }) {
  const directory = appDirectory(mode);
  mkdirSync(directory, { recursive: true });
  const sync = await run(
    "rsync",
    ["-a", "--delete", "--filter=:- .gitignore", "--exclude=.git", "--exclude=.env", "--exclude=.env.*", "--exclude=/.runs", `${REPO_ROOT}/`, `${directory}/`],
    { log },
  );
  if (sync.code !== 0) throw new Error(`Copying the worktree for the ${mode} build failed.`);
  const lockStamp = createHash("sha256").update(readFileSync(resolve(REPO_ROOT, "yarn.lock"))).digest("hex");
  const lockFile = resolve(directory, ".verify-node-modules");
  if (!existsSync(lockFile) || readFileSync(lockFile, "utf8") !== lockStamp) {
    await run("rm", ["-rf", resolve(directory, "node_modules")], { log });
    const link = await run("cp", ["-al", resolve(REPO_ROOT, "node_modules"), resolve(directory, "node_modules")], { log });
    if (link.code !== 0) throw new Error("Linking node_modules into the build copy failed.");
    writeFileSync(lockFile, lockStamp);
  }
  const secretFile = resolve(directory, ".verify-auth-secret");
  if (!existsSync(secretFile)) writeFileSync(secretFile, randomBytes(32).toString("hex"), { mode: 0o600 });
  const secret = readFileSync(secretFile, "utf8").trim();
  writeEnvFile(directory, mode, { databaseUrl, secret });
  return { directory, secret };
}

/** Builds the copy unless its last successful build used the same sources. */
export async function buildAppCopy(mode, { digest, databaseUrl, secret, log, force = false }) {
  const directory = appDirectory(mode);
  const stampFile = resolve(directory, ".verify-build-stamp");
  if (!force && existsSync(stampFile) && existsSync(resolve(directory, ".next/BUILD_ID")) && readFileSync(stampFile, "utf8") === digest)
    return { code: 0, seconds: 0, reused: true };
  const env = cleanEnvironment({
    ...e2eEnvironment(mode, { baseUrl: "http://127.0.0.1:4499", databaseUrl, secret }),
    PATH: `${resolve(directory, "node_modules/.bin")}:${process.env.PATH}`,
  });
  const result = await run("yarn", ["build"], { cwd: directory, env, log });
  if (result.code === 0) writeFileSync(stampFile, digest);
  return { ...result, reused: false };
}
