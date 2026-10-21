import type { ConsoleMessage, Request } from "@playwright/test";

const WEBKIT_IGNORED_VIEWPORT_KEY = 'Viewport argument key "interactive-widget" not recognized and ignored.';
const WEBKIT_CANCELLED_PAGE_FETCH =
  /^(?:Fetch API cannot load https?:)?\/{1,2}(?:127\.0\.0\.1|localhost):\d+\/(?:de|en|es|fr|it)(?:\/[^\s?]*)?(?:\?\S*)? due to access control checks\.$/;

const WEBKIT_CANCELLED_LOAD = "Load request cancelled";
const CHUNK_PATH = /^\/_next\/static\/chunks\/[\w-]+\.js$/;
const CHUNK_LOAD_ERROR = /^ChunkLoadError: Failed to load chunk (\/_next\/static\/chunks\/[\w-]+\.js) from module \d+$/;

export function webkitCancelledChunk(request: Pick<Request, "url" | "failure">): string | undefined {
  if (request.failure()?.errorText !== WEBKIT_CANCELLED_LOAD) return undefined;
  const { pathname } = new URL(request.url());
  return CHUNK_PATH.test(pathname) ? pathname : undefined;
}

const ABORTED_PAGE_LOAD = new Set(["Load request cancelled", "NS_BINDING_ABORTED"]);
const ABORTED_LOAD_REPORT = /^(?:TypeError: Load failed|JSHandle@object)$/;
const ABORTED_RSC_REPORT = /^Failed to fetch RSC payload for (\S+)\. Falling back to browser navigation\. TypeError: Load failed$/;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** WebKit and Firefox cancel the page's own fetches and chunk scripts, a route refresh too, on a navigation. */
export function isAbortedPageLoad(request: Pick<Request, "url" | "failure" | "resourceType">): boolean {
  if (!ABORTED_PAGE_LOAD.has(request.failure()?.errorText ?? "")) return false;
  if (!["fetch", "xhr", "script"].includes(request.resourceType())) return false;
  return LOOPBACK_HOSTS.has(new URL(request.url()).hostname);
}

/** React logs such a cancelled load from the framework chunk, as WebKit's TypeError or Firefox's bare error object. */
export function isAbortedLoadReport(
  diagnostic: { kind: string; text: string; source: string },
  cancelledRscUrls?: ReadonlySet<string>,
): boolean {
  if (diagnostic.kind !== "console") return false;
  try {
    const source = new URL(diagnostic.source);
    if (!CHUNK_PATH.test(source.pathname)) return false;
    if (ABORTED_LOAD_REPORT.test(diagnostic.text)) return true;
    const reportedUrl = ABORTED_RSC_REPORT.exec(diagnostic.text)?.[1];
    const reported = reportedUrl ? loopbackPageUrl(reportedUrl) : null;
    if (!reported || source.origin !== reported.origin) return false;
    return [...(cancelledRscUrls ?? [])].some((url) => loopbackPageUrl(url)?.href === reported.href);
  } catch {
    return false;
  }
}

function loopbackPageUrl(input: string) {
  const url = new URL(input);
  if (!["http:", "https:"].includes(url.protocol) || !LOOPBACK_HOSTS.has(url.hostname)) return null;
  url.searchParams.delete("_rsc");
  return url;
}

export function chunkLoadErrorChunk(message: string): string | undefined {
  return CHUNK_LOAD_ERROR.exec(message)?.[1];
}

export function isAppConsoleError(message: Pick<ConsoleMessage, "type" | "text">): boolean {
  return message.type() === "error" && message.text() !== WEBKIT_IGNORED_VIEWPORT_KEY;
}

export function isBenignPageError(message: string): boolean {
  return (
    message === "ResizeObserver loop completed with undelivered notifications." ||
    WEBKIT_CANCELLED_PAGE_FETCH.test(message)
  );
}
