import type { ConsoleMessage } from "@playwright/test";

const WEBKIT_IGNORED_VIEWPORT_KEY = 'Viewport argument key "interactive-widget" not recognized and ignored.';
const WEBKIT_CANCELLED_ROUTE_PREFETCH =
  /^(?:Fetch API cannot load https?:)?\/{1,2}(?:127\.0\.0\.1|localhost):\d+\/[^\s?]*\?(?:\S*&)?_rsc=[\w-]+ due to access control checks\.$/;

export function isAppConsoleError(message: Pick<ConsoleMessage, "type" | "text">): boolean {
  return message.type() === "error" && message.text() !== WEBKIT_IGNORED_VIEWPORT_KEY;
}

export function isBenignPageError(message: string): boolean {
  return (
    message === "ResizeObserver loop completed with undelivered notifications." ||
    WEBKIT_CANCELLED_ROUTE_PREFETCH.test(message)
  );
}
