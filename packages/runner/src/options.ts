import type { ClientName } from "./types.js";

import { CLIENT_NAMES } from "./types.js";

export type RunnerOptions = {
  token: string;
  url: string;
  client: ClientName | null;
  workdir: string | null;
  permissionMode: string;
  allowedTools: string[];
  heartbeatMs: number;
  help: boolean;
};

export type ParsedOptions = { ok: true; options: RunnerOptions } | { ok: false; error: string };

export const HELP_TEXT = [
  "customermates-runner: run the agent jobs of a Customermates workspace with your own Claude Code, Codex or Gemini CLI.",
  "",
  "Usage: npx customermates-runner --token <runner token> --url <https://app.customermates.com>",
  "",
  "Options:",
  "  --token <token>            Runner token from Settings, Agents (or CUSTOMERMATES_RUNNER_TOKEN)",
  "  --url <url>                Address of your Customermates (or CUSTOMERMATES_URL)",
  "  --client <claude|codex|gemini>",
  "                             The CLI that runs the jobs, default: the first one found",
  "  --workdir <dir>            Run the CLI in this directory, default: an empty temporary one per job",
  "  --permission-mode <mode>   Claude Code permission mode, default: dontAsk",
  "  --allowed-tools <tools>    Extra Claude Code tools to allow, comma separated",
  "  -h, --help                 Show this text",
].join("\n");

const DEFAULT_PERMISSION_MODE = "dontAsk";
const DEFAULT_HEARTBEAT_MS = 60_000;

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
    const value = inline ?? argv[(index += 1)];
    if (!name || value === undefined || value === "")
      return { flags, help, error: `Missing value for --${name ?? ""}` };
    flags.set(name, value);
  }
  return { flags, help };
}

export function parseOptions(argv: readonly string[], env: Record<string, string | undefined>): ParsedOptions {
  const { flags, help, error } = readFlags(argv);
  if (error) return { ok: false, error };

  const known = new Set(["token", "url", "client", "workdir", "permission-mode", "allowed-tools", "heartbeat-seconds"]);
  const unknown = [...flags.keys()].find((name) => !known.has(name));
  if (unknown) return { ok: false, error: `Unknown option --${unknown}` };

  const token = flags.get("token") ?? env.CUSTOMERMATES_RUNNER_TOKEN ?? "";
  const url = (flags.get("url") ?? env.CUSTOMERMATES_URL ?? "").replace(/\/+$/u, "");
  const client = flags.get("client") ?? null;
  const heartbeatSeconds = Number(flags.get("heartbeat-seconds") ?? DEFAULT_HEARTBEAT_MS / 1000);

  if (client !== null && !(CLIENT_NAMES as readonly string[]).includes(client))
    return { ok: false, error: `--client must be one of ${CLIENT_NAMES.join(", ")}` };
  if (!Number.isFinite(heartbeatSeconds) || heartbeatSeconds < 1)
    return { ok: false, error: "--heartbeat-seconds must be a number of at least 1" };

  const options: RunnerOptions = {
    token,
    url,
    client: client as ClientName | null,
    workdir: flags.get("workdir") ?? null,
    permissionMode: flags.get("permission-mode") ?? DEFAULT_PERMISSION_MODE,
    allowedTools: (flags.get("allowed-tools") ?? "")
      .split(",")
      .map((tool) => tool.trim())
      .filter(Boolean),
    heartbeatMs: heartbeatSeconds * 1000,
    help,
  };
  if (help) return { ok: true, options };

  if (!token) return { ok: false, error: "A runner token is required: --token or CUSTOMERMATES_RUNNER_TOKEN" };
  if (!url) return { ok: false, error: "The address of your Customermates is required: --url or CUSTOMERMATES_URL" };
  if (!URL.canParse(url)) return { ok: false, error: `--url is not a valid address: ${url}` };
  return { ok: true, options };
}
