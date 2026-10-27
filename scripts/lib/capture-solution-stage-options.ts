import { DEFAULT_CAPTURE_BASE_URL, isLoopbackBaseUrl } from "./capture-solutions-options";

export type CaptureSolutionStageMode = "capture" | "check" | "list" | "routes";

export type CaptureSolutionStageOptions = {
  allowDirty: boolean;
  baseUrl: string;
  mode: CaptureSolutionStageMode;
  only: string[];
  requireAll: boolean;
  withMain: boolean;
};

function valueAfter(args: readonly string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`${flag} needs a value`);
  return value;
}

export function parseCaptureSolutionStageArgs(args: readonly string[]): CaptureSolutionStageOptions {
  const options: CaptureSolutionStageOptions = {
    allowDirty: false,
    baseUrl: DEFAULT_CAPTURE_BASE_URL,
    mode: "capture",
    only: [],
    requireAll: false,
    withMain: false,
  };

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--check") options.mode = "check";
    else if (arg === "--list") options.mode = "list";
    else if (arg === "--routes") options.mode = "routes";
    else if (arg === "--require-all") options.requireAll = true;
    else if (arg === "--allow-dirty") options.allowDirty = true;
    else if (arg === "--with-main") options.withMain = true;
    else if (arg === "--base-url") options.baseUrl = valueAfter(args, index++, arg).replace(/\/+$/u, "");
    else if (arg === "--only") options.only = valueAfter(args, index++, arg).split(",").filter(Boolean);
    else throw new Error(`Unknown argument ${arg}`);
  }

  if (!isLoopbackBaseUrl(options.baseUrl))
    throw new Error(`--base-url must point at a local demo instance, got ${options.baseUrl}`);

  return options;
}
