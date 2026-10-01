import type { CaptureContext } from "./capture-context";

export const ERROR_NOTIFICATION_FAILURE_PREFIX = "[application-error-notification]";

export type ErrorReport = {
  kind: "application-error";
  id: string;
  buildId: string;
  release?: string;
  timestamp: number;
  level: "error" | "warning" | "info";
  source: "browser" | "server";
  name: string;
  message: string;
  path?: string;
  digest?: string;
  workflowName?: string;
  tenant?: { userId?: string; companyId?: string };
  tags?: Record<string, string>;
  causes?: { name: string; message: string; frames: ErrorReport["frames"] }[];
  frames: { file: string; function?: string; line?: number; column?: number }[];
};

const identifier = /^[a-zA-Z0-9_-]{1,128}$/;

export function safeIdentifier(value: unknown): string | undefined {
  return typeof value === "string" && identifier.test(value) ? value : undefined;
}

function redactSecretPath(path: string): string {
  const segments = path.split("/").map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  });
  for (let index = 0; index < segments.length - 1; index++)
    if (segments[index].toLowerCase() === "invitation") segments[index + 1] = "[redacted]";
  return segments.join("/");
}

export function scrubErrorText(value: unknown, maxLength = 2000): string {
  return String(value ?? "")
    .slice(0, maxLength)
    .replace(/https?:\/\/[^\s)\]}]+/gi, (url) => {
      try {
        const parsed = new URL(url);
        return `${parsed.origin}${redactSecretPath(parsed.pathname)}`;
      } catch {
        return "[redacted URL]";
      }
    })
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[redacted email]")
    .replace(/\b(Bearer\s+|(?:password|token|secret|api[_-]?key)\s*[=:]\s*)[^\s,;]+/gi, "$1[redacted]");
}

export function safeErrorPath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    return scrubErrorText(redactSecretPath(new URL(value, "https://errors.invalid").pathname), 500);
  } catch {
    return undefined;
  }
}

export function errorFrames(stack: unknown): ErrorReport["frames"] {
  if (typeof stack !== "string") return [];
  return stack
    .slice(0, 40_000)
    .split("\n")
    .flatMap((line) => {
      const frame = line.match(/^\s*(?:at\s+(?:(.*?)\s+\()?|(.*?)@)(.+?):(\d+):(\d+)\)?\s*$/);
      if (!frame) return [];
      return [
        {
          file: scrubErrorText(frame[3], 1000),
          function: frame[1] || frame[2] ? scrubErrorText(frame[1] || frame[2], 200) : undefined,
          line: Number(frame[4]),
          column: Number(frame[5]),
        },
      ];
    })
    .slice(0, 30)
    .reverse();
}

function exceptionDetails(error: unknown) {
  const value =
    error && typeof error === "object" ? (error as { name?: unknown; message?: unknown; stack?: unknown }) : {};
  return {
    name: scrubErrorText(typeof value.name === "string" ? value.name : "Error", 100),
    message: scrubErrorText(
      typeof value.message === "string"
        ? value.message
        : typeof error === "object"
          ? "Unexpected application error"
          : error,
    ),
    frames: errorFrames(value.stack),
  };
}

export function errorReport(
  error: unknown,
  source: ErrorReport["source"],
  context: CaptureContext = {},
): ErrorReport | null {
  const exception = exceptionDetails(error);
  if (exception.message.startsWith(ERROR_NOTIFICATION_FAILURE_PREFIX)) return null;
  const buildId = safeIdentifier(process.env.NEXT_PUBLIC_ERROR_REPORTING_BUILD_ID);
  if (!buildId) return null;
  const workflow = context.contexts?.workflow;
  const userId = safeIdentifier(context.user?.id);
  const companyId = safeIdentifier(context.tags?.companyId);
  const tags: Record<string, string> = {};
  for (const [key, value] of Object.entries(context.tags ?? {}).slice(0, 20))
    if (value !== undefined && /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(key)) tags[key] = scrubErrorText(value, 200);

  const causes: NonNullable<ErrorReport["causes"]> = [];
  const seen = new Set([error]);
  let cause = error;
  for (let index = 0; index < 3; index++) {
    cause = cause && typeof cause === "object" ? (cause as { cause?: unknown }).cause : undefined;
    if (!cause || seen.has(cause)) break;
    seen.add(cause);
    const detail = exceptionDetails(cause);
    if (detail.message.startsWith(ERROR_NOTIFICATION_FAILURE_PREFIX)) return null;
    causes.push({ ...detail, frames: detail.frames.slice(-3) });
  }

  return {
    kind: "application-error",
    id:
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join(""),
    buildId,
    release: /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(process.env.NEXT_PUBLIC_ERROR_REPORTING_RELEASE ?? "")
      ? process.env.NEXT_PUBLIC_ERROR_REPORTING_RELEASE
      : undefined,
    timestamp: Date.now() / 1000,
    level: context.level ?? "error",
    source,
    name: exception.name,
    message: exception.message,
    path: safeErrorPath(context.path),
    digest: safeIdentifier(context.digest ?? context.tags?.digest),
    workflowName: typeof workflow?.workflowName === "string" ? scrubErrorText(workflow.workflowName, 100) : undefined,
    tenant: source === "server" && (userId || companyId) ? { userId, companyId } : undefined,
    frames: (context.frames ?? exception.frames).slice(-20).map((frame) => ({
      ...frame,
      file: scrubErrorText(frame.file, 800),
      function: frame.function ? scrubErrorText(frame.function, 100) : undefined,
    })),
    tags: Object.keys(tags).length ? tags : undefined,
    causes: causes.length ? causes : undefined,
  };
}
