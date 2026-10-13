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
