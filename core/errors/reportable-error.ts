import { isExpectedError } from "./app-errors";
import { isClientTransportError } from "./client-transport-error";
import { isDeploymentSkewError } from "./deployment-skew";
import { errorDigest } from "./error-digest";
import { isWorkspaceChangedError } from "./workspace-changed";

const NEXT_CONTROL_FLOW_DIGEST = /^(NEXT_HTTP_ERROR_FALLBACK;|NEXT_REDIRECT|NEXT_NOT_FOUND)/;

export function isReportableError(error: unknown): boolean {
  if (
    isExpectedError(error) ||
    isWorkspaceChangedError(error) ||
    isClientTransportError(error) ||
    isDeploymentSkewError(error) ||
    NEXT_CONTROL_FLOW_DIGEST.test(errorDigest(error) ?? "")
  )
    return false;
  const message = typeof error === "string" ? error : error instanceof Error ? error.message : undefined;
  if (message?.startsWith("ResizeObserver loop")) return false;
  const stack = error instanceof Error ? error.stack : undefined;
  return !stack?.includes("ext:core/");
}
