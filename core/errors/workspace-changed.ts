import { CustomErrorCode } from "@/core/validation/validation.types";

import { errorDigest } from "./error-digest";

export const WORKSPACE_CHANGED_DIGEST = "CUSTOMERMATES_WORKSPACE_CHANGED";

export function isWorkspaceChangedError(error: unknown): boolean {
  return errorDigest(error) === WORKSPACE_CHANGED_DIGEST;
}

export function isWorkspaceChangedFailure(body: unknown): boolean {
  const issues = (body as { error?: { issues?: unknown } } | null)?.error?.issues;
  return (
    Array.isArray(issues) &&
    issues.some((issue) => (issue as { customCode?: unknown } | null)?.customCode === CustomErrorCode.workspaceChanged)
  );
}
