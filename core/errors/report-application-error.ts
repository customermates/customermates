import { isClientTransportError } from "./client-transport-error";
import { captureError } from "./sentry-client";

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
  if (!isDemoEnvironment() && !isClientTransportError(error)) captureError(error);

  activeHandler?.(error);
}

export function runUserAction(action: () => unknown): void {
  try {
    void Promise.resolve(action()).catch(reportApplicationError);
  } catch (error) {
    reportApplicationError(error);
  }
}
