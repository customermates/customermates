import type { ErrorEvent } from "@sentry/nextjs";

export const ERROR_NOTIFICATION_FAILURE_PREFIX = "[application-error-notification]";

export type ErrorReport = {
  kind: "application-error";
  id: string;
  buildId: string;
  timestamp: number;
  level: "error" | "warning" | "info";
  source: "browser" | "server";
  name: string;
  message: string;
  path?: string;
  digest?: string;
  workflowName?: string;
  tenant?: { userId?: string; companyId?: string };
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

export function errorReport(event: ErrorEvent, source: ErrorReport["source"]): ErrorReport | null {
  const exceptions = event.exception?.values ?? [];
  if (exceptions.some((exception) => exception.value?.startsWith(ERROR_NOTIFICATION_FAILURE_PREFIX))) return null;
  const exception = exceptions.at(-1);
  const id = safeIdentifier(event.event_id);
  const buildId = safeIdentifier(process.env.NEXT_PUBLIC_ERROR_REPORTING_BUILD_ID);
  if (!id || !buildId) return null;

  const frames = (exception?.stacktrace?.frames ?? []).slice(-30).flatMap((frame) => {
    const file = frame.filename ?? frame.abs_path;
    if (!file) return [];
    return [
      {
        file: scrubErrorText(file, 1000),
        function: frame.function ? scrubErrorText(frame.function, 200) : undefined,
        line: frame.lineno,
        column: frame.colno,
      },
    ];
  });
  const workflow = event.contexts?.workflow;
  const userId = safeIdentifier(event.user?.id);
  const companyId = safeIdentifier(event.tags?.companyId);

  return {
    kind: "application-error",
    id,
    buildId,
    timestamp:
      event.timestamp && Number.isFinite(event.timestamp) && event.timestamp > 0 && event.timestamp < 8.64e12
        ? event.timestamp
        : Date.now() / 1000,
    level: event.level === "warning" ? "warning" : event.level === "info" ? "info" : "error",
    source,
    name: scrubErrorText(exception?.type ?? "Error", 100),
    message: scrubErrorText(exception?.value ?? event.message ?? "Unexpected application error"),
    path: safeErrorPath(event.request?.url ?? event.contexts?.nextjs?.request_path),
    digest: safeIdentifier(event.tags?.digest),
    workflowName: typeof workflow?.workflowName === "string" ? scrubErrorText(workflow.workflowName, 100) : undefined,
    tenant: source === "server" && (userId || companyId) ? { userId, companyId } : undefined,
    frames,
  };
}
