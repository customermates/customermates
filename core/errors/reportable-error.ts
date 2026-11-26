import { isExpectedError } from "./app-errors";
import { isClientTransportError } from "./client-transport-error";
import { isDeploymentSkewError } from "./deployment-skew";
import { errorDigest } from "./error-digest";
import { isWorkspaceChangedError } from "./workspace-changed";

const NEXT_CONTROL_FLOW_DIGEST = /^(NEXT_HTTP_ERROR_FALLBACK;|NEXT_REDIRECT|NEXT_NOT_FOUND)/;

// React #419: a streamed Suspense boundary the server never finished, so the browser renders it itself.
// A server error there carries a digest and is reported by the server; without one the render was aborted
// or the stream cut off (Next.js gives aborts no digest and logs nothing), which the client recovers from.
const UNFINISHED_SUSPENSE_BOUNDARY =
  /^(Minified React error #419;|The server could not finish this Suspense boundary, likely due to an error during server rendering\.)/;

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
  if (message && UNFINISHED_SUSPENSE_BOUNDARY.test(message) && !errorDigest(error)) return false;
  const stack = error instanceof Error ? error.stack : undefined;
  return !stack?.includes("ext:core/");
}
