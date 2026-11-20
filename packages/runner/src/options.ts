import type { ClientName } from "./types.js";

import { readFileSync } from "node:fs";

import { CLIENT_NAMES } from "./types.js";

export type RunnerOptions = {
  token: string;
  tokenOnCommandLine: boolean;
  url: string;
  client: ClientName | null;
  workdir: string | null;
  permissionMode: string;
  settingSources: string;
  allowedTools: string[];
  allowShell: boolean;
  heartbeatMs: number;
  help: boolean;
};

export type ParsedOptions = { ok: true; options: RunnerOptions } | { ok: false; error: string };

export type TokenFileReader = (path: string) => string;

export const TOKEN_ENV = "CUSTOMERMATES_RUNNER_TOKEN";
export const TOKEN_FILE_ENV = "CUSTOMERMATES_RUNNER_TOKEN_FILE";

export const HELP_TEXT = [
  "customermates-runner: run your own agent jobs of a Customermates workspace with your Claude Code, Codex or Gemini CLI.",
  "",
  "Usage: CUSTOMERMATES_RUNNER_TOKEN=<runner token> npx customermates-runner --url <https://app.customermates.com>",
  "",
  "Options:",
  "  --token-file <file>        File that holds the runner token (or CUSTOMERMATES_RUNNER_TOKEN_FILE)",
  "  --token <token>            Runner token on the command line: other users of the machine can read it there.",
  "                             Prefer CUSTOMERMATES_RUNNER_TOKEN or --token-file",
  "  --url <url>                Address of your Customermates (or CUSTOMERMATES_URL)",
  "  --client <claude|codex|gemini>",
  "                             The CLI that runs the jobs, default: the first one found",
  "  --workdir <dir>            Run the CLI in this directory, default: an empty temporary one per job",
  "  --permission-mode <mode>   Claude Code permission mode, default: dontAsk",
  "  --setting-sources <list>   Claude Code settings to load (user,project,local), default: project,",
  "                             so allow rules of your own user settings do not apply to jobs",
  "  --allowed-tools <tools>    Extra Claude Code tools to allow, comma separated",
  "  --allow-shell              Let Codex run shell commands in its read-only sandbox. They can read",
  "                             every file your account can read",
  "  -h, --help                 Show this text",
].join("\n");

const DEFAULT_PERMISSION_MODE = "dontAsk";
const DEFAULT_SETTING_SOURCES = "project";
const DEFAULT_HEARTBEAT_MS = 60_000;
const SWITCHES = new Set(["allow-shell"]);
const KNOWN = new Set([
  "token",
  "token-file",
  "url",
  "client",
  "workdir",
  "permission-mode",
  "setting-sources",
  "allowed-tools",
  "allow-shell",
  "heartbeat-seconds",
]);

function readFlags(argv: readonly string[]): { flags: Map<string, string>; help: boolean; error?: string } {
  const flags = new Map<string, string>();
  let help = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? "";
    if (argument === "-h" || argument === "--help") {
      help = true;
      continue;
    }
    if (!argument.startsWith("--")) return { flags, help, error: `Unexpected argument ${argument}` };
    const [name, inline] = argument.slice(2).split(/=(.*)/su, 2);
    if (name && SWITCHES.has(name) && inline === undefined) {
      flags.set(name, "true");
      continue;
    }
    const value = inline ?? argv[(index += 1)];
    if (!name || value === undefined || value === "")
      return { flags, help, error: `Missing value for --${name ?? ""}` };
    flags.set(name, value);
  }
  return { flags, help };
}

function tokenFrom(
  flags: Map<string, string>,
  env: Record<string, string | undefined>,
  readTokenFile: TokenFileReader,
): { token: string; onCommandLine: boolean } | { error: string } {
  const file = flags.get("token-file") ?? env[TOKEN_FILE_ENV];
  if (file) {
    try {
      return { token: readTokenFile(file).trim(), onCommandLine: false };
    } catch {
      return { error: `The token file could not be read: ${file}` };
    }
  }
  const fromEnvironment = env[TOKEN_ENV];
  if (fromEnvironment) return { token: fromEnvironment.trim(), onCommandLine: false };
  const fromFlag = flags.get("token");
  return { token: fromFlag ?? "", onCommandLine: fromFlag !== undefined };
}

export function parseOptions(
  argv: readonly string[],
  env: Record<string, string | undefined>,
  readTokenFile: TokenFileReader = (path) => readFileSync(path, "utf8"),
): ParsedOptions {
  const { flags, help, error } = readFlags(argv);
  if (error) return { ok: false, error };

  const unknown = [...flags.keys()].find((name) => !KNOWN.has(name));
  if (unknown) return { ok: false, error: `Unknown option --${unknown}` };

  const url = (flags.get("url") ?? env.CUSTOMERMATES_URL ?? "").replace(/\/+$/u, "");
  const client = flags.get("client") ?? null;
  const heartbeatSeconds = Number(flags.get("heartbeat-seconds") ?? DEFAULT_HEARTBEAT_MS / 1000);

  if (client !== null && !(CLIENT_NAMES as readonly string[]).includes(client))
    return { ok: false, error: `--client must be one of ${CLIENT_NAMES.join(", ")}` };
  if (!Number.isFinite(heartbeatSeconds) || heartbeatSeconds < 1)
    return { ok: false, error: "--heartbeat-seconds must be a number of at least 1" };

  const base = {
    url,
    client: client as ClientName | null,
    workdir: flags.get("workdir") ?? null,
    permissionMode: flags.get("permission-mode") ?? DEFAULT_PERMISSION_MODE,
    settingSources: flags.get("setting-sources") ?? DEFAULT_SETTING_SOURCES,
    allowedTools: (flags.get("allowed-tools") ?? "")
      .split(",")
      .map((tool) => tool.trim())
      .filter(Boolean),
    allowShell: flags.get("allow-shell") === "true",
    heartbeatMs: heartbeatSeconds * 1000,
    help,
  };
  if (help) return { ok: true, options: { ...base, token: "", tokenOnCommandLine: false } };

  const token = tokenFrom(flags, env, readTokenFile);
  if ("error" in token) return { ok: false, error: token.error };
  if (!token.token) {
    return {
      ok: false,
      error: `A runner token is required: ${TOKEN_ENV}, --token-file or ${TOKEN_FILE_ENV}`,
    };
  }
  if (!url) return { ok: false, error: "The address of your Customermates is required: --url or CUSTOMERMATES_URL" };
  if (!URL.canParse(url)) return { ok: false, error: `--url is not a valid address: ${url}` };
  return { ok: true, options: { ...base, token: token.token, tokenOnCommandLine: token.onCommandLine } };
}
