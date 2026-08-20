import * as Sentry from "@sentry/nextjs";

type ApplicationErrorHandler = (error: unknown) => void;

let activeHandler: ApplicationErrorHandler | null = null;

export function isDemoEnvironment(): boolean {
  if (typeof window === "undefined") return false;

  return window.location.hostname.includes("demo");
}

export function registerApplicationErrorHandler(handler: ApplicationErrorHandler): () => void {
  activeHandler = handler;
  return () => {
    if (activeHandler === handler) activeHandler = null;
  };
}

export function reportApplicationError(error: unknown): void {
  if (!isDemoEnvironment()) Sentry.captureException(error);

  activeHandler?.(error);
}
