import * as Sentry from "@sentry/nextjs";

import { isClientTransportError } from "./client-transport-error";

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
  if (!isDemoEnvironment() && !isClientTransportError(error)) Sentry.captureException(error);

  activeHandler?.(error);
}

export function runClientAction(action: () => unknown): void {
  void Promise.resolve().then(action).catch(reportApplicationError);
}
