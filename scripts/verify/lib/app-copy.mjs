import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, resolve } from "node:path";

import { capture, cleanEnvironment, REPO_ROOT, run } from "./process.mjs";

/**
 * A production build lives in its own copy of the worktree per APP_MODE and source digest
 * (~/.cache/customermates-verify/<worktree>/<mode>-<digest>). Cloud and self-hosted builds exist side by side and build
 * at the same time, the worktree stays free for edits while tests run, and a run never rebuilds a copy that another
 * run's servers are using: changed sources get a new copy (its build cache seeded from the newest older one), and
 * copies unused for two hours beyond the newest two per mode are removed. node_modules is hard-linked from the worktree.
 */
const OWNER_DIRECTORY = resolve(
  homedir(),
  ".cache/customermates-verify",
  // Outside the worktree: nested inside it, Next.js would take the worktree's lockfile as the project root and record
  // server action and trace paths relative to it.
  `${basename(REPO_ROOT)}-${createHash("sha256").update(REPO_ROOT).digest("hex").slice(0, 8)}`,
);

export function appDirectory(mode, digest = "<digest>") {
  return resolve(OWNER_DIRECTORY, `${mode}-${digest}`);
}

function copiesOf(mode) {
  if (!existsSync(OWNER_DIRECTORY)) return [];
  return readdirSync(OWNER_DIRECTORY)
    .filter((name) => name.startsWith(`${mode}-`) && !name.endsWith(".lock"))
    .map((name) => {
      const directory = resolve(OWNER_DIRECTORY, name);
      const used = resolve(directory, ".verify-last-used");
      return { directory, used: existsSync(used) ? statSync(used).mtimeMs : statSync(directory).mtimeMs };
    })
    .sort((a, b) => b.used - a.used);
}

function pruneCopies(mode, keep) {
  for (const copy of copiesOf(mode).slice(2))
    if (copy.directory !== keep && Date.now() - copy.used > 2 * 60 * 60 * 1000) rmSync(copy.directory, { recursive: true, force: true });
}

/**
 * A digest of the files the production build reads: every file except dependencies, generated output, run evidence,
 * tests and CI configuration, so editing a spec or a unit test reuses the build.
 */
export async function sourceDigest() {
  // File contents, not modification times: generators rewrite unchanged files (openapi:generate, raw-docs:generate).
  const listing = await capture("bash", [
    "-c",
    "find . \\( -name node_modules -o -path ./.runs -o -path ./.next -o -path ./generated -o -path ./.source -o -path ./.git -o -path ./tests -o -path ./.github -o -path ./scripts/verify -o -name __tests__ \\) -prune -o -type f ! -name '*.test.ts' ! -name '*.test.tsx' ! -name '.env' ! -name '*.tsbuildinfo' ! -name '.eslintcache' -print0 | sort -z | xargs -0 sha1sum",
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
export async function withCopyLock(mode, digest, task) {
  const lock = `${appDirectory(mode, digest)}.lock`;
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
export async function syncAppCopy(mode, { digest, databaseUrl, log }) {
  const directory = appDirectory(mode, digest);
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
    const previous = copiesOf(mode).find((copy) => copy.directory !== directory && existsSync(resolve(copy.directory, ".next/cache")));
    if (previous) {
      mkdirSync(resolve(directory, ".next"), { recursive: true });
      await run("cp", ["-a", resolve(previous.directory, ".next/cache"), resolve(directory, ".next/cache")], { log });
    }
  }
  writeFileSync(resolve(directory, ".verify-last-used"), new Date().toISOString());
  pruneCopies(mode, directory);
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
  const directory = appDirectory(mode, digest);
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
