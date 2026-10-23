export type CaptureSolutionsMode = "capture" | "check" | "placeholders";

export type CaptureSolutionsOptions = {
  allowDirty: boolean;
  allowPlaceholders: boolean;
  baseUrl: string;
  mode: CaptureSolutionsMode;
  navOnly: boolean;
  only: string[];
  resetDatabase: boolean;
};

export const DEFAULT_CAPTURE_BASE_URL = "http://127.0.0.1:3000";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export function isLoopbackBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && LOOPBACK_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

function valueAfter(args: readonly string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`${flag} needs a value`);
  return value;
}

export function parseCaptureSolutionsArgs(args: readonly string[]): CaptureSolutionsOptions {
  const options: CaptureSolutionsOptions = {
    allowDirty: false,
    allowPlaceholders: false,
    baseUrl: DEFAULT_CAPTURE_BASE_URL,
    mode: "capture",
    navOnly: false,
    only: [],
    resetDatabase: false,
  };

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--check") options.mode = "check";
    else if (arg === "--placeholders") options.mode = "placeholders";
    else if (arg === "--allow-placeholders") options.allowPlaceholders = true;
    else if (arg === "--allow-dirty") options.allowDirty = true;
    else if (arg === "--reset-db") options.resetDatabase = true;
    else if (arg === "--nav-only") options.navOnly = true;
    else if (arg === "--base-url") options.baseUrl = valueAfter(args, index++, arg).replace(/\/+$/u, "");
    else if (arg === "--only") options.only = valueAfter(args, index++, arg).split(",").filter(Boolean);
    else throw new Error(`Unknown argument ${arg}`);
  }

  if (!isLoopbackBaseUrl(options.baseUrl))
    throw new Error(`--base-url must point at a local demo instance, got ${options.baseUrl}`);

  return options;
}

export function captureNavigationUrl(baseUrl: string, route: string): string {
  const url = new URL(route, `${baseUrl}/`);
  url.searchParams.set("agentChat", "closed");
  return url.toString();
}
