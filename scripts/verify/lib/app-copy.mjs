import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, resolve } from "node:path";

import { capture, cleanEnvironment, REPO_ROOT, run } from "./process.mjs";

/**
 * A production build per APP_MODE lives in its own copy of the worktree (~/.cache/customermates-verify/<worktree>/<mode>), so a cloud and a
 * self-hosted build exist side by side, build at the same time, and the worktree stays free for edits while tests run.
 * node_modules is hard-linked from the worktree; the build is skipped when the copied sources are unchanged.
 */
export function appDirectory(mode) {
  // Outside the worktree: nested inside it, Next.js would take the worktree's lockfile as the project root and record
  // server action and trace paths relative to it.
  const owner = `${basename(REPO_ROOT)}-${createHash("sha256").update(REPO_ROOT).digest("hex").slice(0, 8)}`;
  return resolve(homedir(), ".cache/customermates-verify", owner, mode);
}

/**
 * A digest of the files the production build reads: every file except dependencies, generated output, run evidence,
 * tests and CI configuration (path, size and modification time), so editing a spec or a unit test reuses the build.
 */
export async function sourceDigest() {
  const listing = await capture("bash", [
    "-c",
    "find . \\( -name node_modules -o -path ./.runs -o -path ./.next -o -path ./generated -o -path ./.source -o -path ./.git -o -path ./tests -o -path ./.github -o -path ./scripts/verify -o -name __tests__ \\) -prune -o -type f ! -name '*.test.ts' ! -name '*.test.tsx' ! -name '.env' ! -name '*.tsbuildinfo' ! -name '.eslintcache' -printf '%P %s %T@\\n' | sort",
  ]);
  return createHash("sha256").update(listing).digest("hex").slice(0, 16);
}

function envFile(mode, overrides) {
  // `workspace offload` never copies .env.* files, so the offloaded run receives the template from the caller.
  const templateFile = resolve(REPO_ROOT, ".env.cloud.template");
  const template = (existsSync(templateFile)
    ? readFileSync(templateFile, "utf8")
    : Buffer.from(process.env.CRM_VERIFY_ENV_TEMPLATE_B64 ?? "", "base64").toString("utf8")
  ).split("\n");
  if (!template.some((line) => line.startsWith("APP_MODE="))) throw new Error("The .env.cloud.template is missing.");
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

/**
 * Serialises preparation of one copy across runs (several agents may verify the same worktree at once): an atomic
 * mkdir lock next to the copy, considered stale after 45 minutes.
 */
export async function withCopyLock(mode, task) {
  const lock = `${appDirectory(mode)}.lock`;
  mkdirSync(resolve(lock, ".."), { recursive: true });
  for (;;) {
    try {
      mkdirSync(lock);
      break;
    } catch {
      try {
        if (Date.now() - statSync(lock).mtimeMs > 45 * 60 * 1000) rmSync(lock, { recursive: true, force: true });
      } catch {}
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 2000));
    }
  }
  try {
    return await task();
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

/** Mirrors the worktree into the mode's copy and writes its private .env; returns the copy's directory and secret. */
export async function syncAppCopy(mode, { databaseUrl, log }) {
  const directory = appDirectory(mode);
  mkdirSync(directory, { recursive: true });
  const sync = await run(
    "rsync",
    ["-a", "--delete", "--filter=:- .gitignore", "--exclude=.git", "--exclude=.env", "--exclude=.env.*", "--exclude=/.runs", "--exclude=/.verify-*", `${REPO_ROOT}/`, `${directory}/`],
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
