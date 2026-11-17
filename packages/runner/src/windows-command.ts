import { existsSync } from "node:fs";
import { win32 } from "node:path";

export type CommandPlan = { command: string; args: string[]; verbatim: boolean };

type Environment = Record<string, string | undefined>;

const META_CHARACTERS = /([()\][%!^"`<>&|;, *?])/g;
const DEFAULT_EXTENSIONS = ".COM;.EXE;.BAT;.CMD";
const SCRIPT = /\.(cmd|bat)$/iu;
const HAS_EXTENSION = /\.[^\\/.]+$/u;

function variable(env: Environment, name: string): string | undefined {
  const key = Object.keys(env).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  return key ? env[key] : undefined;
}

export function resolveWindowsCommand(
  binary: string,
  env: Environment,
  exists: (path: string) => boolean = existsSync,
): string {
  const extensions = (variable(env, "PATHEXT") ?? DEFAULT_EXTENSIONS).split(";").filter(Boolean);
  const names = HAS_EXTENSION.test(binary) ? [binary] : extensions.map((extension) => `${binary}${extension}`);
  const hasDirectory = win32.isAbsolute(binary) || /[\\/]/u.test(binary);
  const directories = hasDirectory ? [""] : (variable(env, "PATH") ?? "").split(win32.delimiter).filter(Boolean);
  for (const directory of directories) {
    for (const name of names) {
      const candidate = directory ? win32.join(directory, name) : name;
      if (exists(candidate)) return candidate;
    }
  }
  return binary;
}

function escapeCommand(command: string): string {
  return command.replace(META_CHARACTERS, "^$1");
}

function escapeArgument(argument: string): string {
  const quoted = `"${argument.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/u, "$1$1")}"`;
  return quoted.replace(META_CHARACTERS, "^$1").replace(META_CHARACTERS, "^$1");
}

export function windowsCommandPlan(
  binary: string,
  args: readonly string[],
  env: Environment,
  exists: (path: string) => boolean = existsSync,
): CommandPlan {
  const resolved = resolveWindowsCommand(binary, env, exists);
  if (!SCRIPT.test(resolved)) return { command: resolved, args: [...args], verbatim: false };
  const line = [escapeCommand(resolved), ...args.map(escapeArgument)].join(" ");
  return {
    command: variable(env, "ComSpec") ?? "cmd.exe",
    args: ["/d", "/s", "/c", `"${line}"`],
    verbatim: true,
  };
}

export function commandPlan(
  binary: string,
  args: readonly string[],
  env: Environment,
  platform: NodeJS.Platform = process.platform,
): CommandPlan {
  return platform === "win32"
    ? windowsCommandPlan(binary, args, env)
    : { command: binary, args: [...args], verbatim: false };
}
