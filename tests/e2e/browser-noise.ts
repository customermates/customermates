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

const ABORTED_PAGE_FETCH = new Set(["Load request cancelled", "NS_BINDING_ABORTED"]);
const ABORTED_FETCH_REPORT = /^(?:TypeError: Load failed|JSHandle@object)$/;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** WebKit and Firefox cancel the page's own fetches and chunk scripts, such as a route refresh, when a document navigation starts. */
export function isAbortedPageLoad(request: Pick<Request, "url" | "failure" | "resourceType">): boolean {
  if (!ABORTED_PAGE_FETCH.has(request.failure()?.errorText ?? "")) return false;
  if (!["fetch", "xhr", "script"].includes(request.resourceType())) return false;
  return LOOPBACK_HOSTS.has(new URL(request.url()).hostname);
}

/** React logs such a cancelled load from the framework chunk, as WebKit's TypeError or Firefox's bare error object. */
export function isAbortedFetchReport(diagnostic: { kind: string; text: string; source: string }): boolean {
  if (diagnostic.kind !== "console" || !ABORTED_FETCH_REPORT.test(diagnostic.text)) return false;
  try {
    return CHUNK_PATH.test(new URL(diagnostic.source).pathname);
  } catch {
    return false;
  }
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
