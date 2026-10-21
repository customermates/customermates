import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const INHERITED_DATABASE_VARIABLES = [
  "DATABASE_URL",
  "DIRECT_URL",
  "RUN_DATABASE_TESTS",
  "CRM_E2E_DATABASE_URL",
  "CRM_E2E_BASE_URL",
  "CRM_E2E_SERVER_MODE",
  "CRM_E2E_RUN_ID",
  "WORKFLOW_LOCAL_DATA_DIR",
  "WORKFLOW_POSTGRES_URL",
  "WORKFLOW_TARGET_WORLD",
  "PGHOST",
  "PGHOSTADDR",
  "PGPORT",
  "PGDATABASE",
  "PGSERVICE",
  "PGSERVICEFILE",
  "PGPASSWORD",
];

/** The caller's environment without any database routing, so a verification run can only reach the databases it created. */
export function cleanEnvironment(extra = {}) {
  const environment = { ...process.env };
  for (const name of INHERITED_DATABASE_VARIABLES) delete environment[name];
  return {
    ...environment,
    PATH: `${resolve(REPO_ROOT, "node_modules/.bin")}:${process.env.PATH}`,
    NEXT_TELEMETRY_DISABLED: "1",
    ...extra,
  };
}

export function seconds(startedAt) {
  return Math.round((Date.now() - startedAt) / 100) / 10;
}

export function formatDuration(totalSeconds) {
  if (totalSeconds == null) return "-";
  const minutes = Math.floor(totalSeconds / 60);
  const rest = Math.round(totalSeconds - minutes * 60);
  return minutes ? `${minutes}m${String(rest).padStart(2, "0")}s` : `${rest}s`;
}

/**
 * Runs a command with its output in a log file (and optionally echoed with a prefix). Resolves with the exit code and
 * duration; never rejects for a failing command.
 */
export function run(command, args, { cwd = REPO_ROOT, env = cleanEnvironment(), log, echo = false, prefix = "" } = {}) {
  const startedAt = Date.now();
  if (log) mkdirSync(dirname(log), { recursive: true });
  const file = log ? createWriteStream(log, { flags: "a" }) : null;
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    const forward = (chunk) => {
      file?.write(chunk);
      if (echo)
        process.stdout.write(
          chunk
            .toString()
            .split("\n")
            .map((line, index, lines) => (index === lines.length - 1 && line === "" ? "" : `${prefix}${line}\n`))
            .join(""),
        );
    };
    child.stdout.on("data", forward);
    child.stderr.on("data", forward);
    child.on("error", (error) => {
      file?.write(`\n${error.message}\n`);
      file?.end();
      resolvePromise({ code: 127, seconds: seconds(startedAt) });
    });
    child.on("close", (code, signal) => {
      file?.end();
      resolvePromise({ code: code ?? (signal ? 128 : 1), seconds: seconds(startedAt) });
    });
  });
}

/** Runs a command and returns its trimmed stdout, throwing on a non-zero exit. */
export function capture(command, args, { cwd = REPO_ROOT, env = cleanEnvironment(), input } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    if (input !== undefined) child.stdin.end(input);
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolvePromise(stdout.trim())
        : reject(new Error(`${command} ${args[0] ?? ""} exited ${code}: ${stderr.trim().split("\n").slice(-3).join(" ")}`)),
    );
  });
}

/** Runs tasks with at most `limit` in flight, preserving result order. */
export async function pool(items, limit, task) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

export function table(rows, columns) {
  const widths = columns.map((column) => Math.max(column.length, ...rows.map((row) => String(row[column] ?? "").length)));
  const line = (cells) => `| ${cells.map((cell, index) => String(cell ?? "").padEnd(widths[index])).join(" | ")} |`;
  return [line(columns), `|${widths.map((width) => "-".repeat(width + 2)).join("|")}|`, ...rows.map((row) => line(columns.map((column) => row[column])))].join("\n");
}

export function parseArguments(argv, defaults) {
  const options = { ...defaults, _: [] };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (!argument.startsWith("--")) {
      options._.push(argument);
      continue;
    }
    const [key, inline] = argument.slice(2).split("=", 2);
    const name = key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const negated = /^no[A-Z]/.test(name) ? name[2].toLowerCase() + name.slice(3) : null;
    if (negated && negated in defaults && inline === undefined) {
      options[negated] = typeof defaults[negated] === "boolean" ? false : "false";
      continue;
    }
    if (typeof defaults[name] === "boolean") options[name] = inline === undefined ? true : inline !== "false";
    else options[name] = inline ?? argv[++index];
  }
  return options;
}
