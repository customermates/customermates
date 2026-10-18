import { CustomErrorCode } from "@/core/validation/validation.types";

import { errorDigest } from "./error-digest";

export const WORKSPACE_CHANGED_DIGEST = "CUSTOMERMATES_WORKSPACE_CHANGED";

export function isWorkspaceChangedError(error: unknown): boolean {
  return errorDigest(error) === WORKSPACE_CHANGED_DIGEST;
}

const WORKSPACE_CHANGED_CODES: readonly unknown[] = [CustomErrorCode.workspaceChanged, CustomErrorCode.userInactive];

export function isWorkspaceChangedCode(code: unknown): boolean {
  return WORKSPACE_CHANGED_CODES.includes(code);
}

export function markWorkspaceChanged<T extends object>(tree: T): T & { digest: string } {
  return Object.assign(tree, { digest: WORKSPACE_CHANGED_DIGEST });
}

type FailureShape = {
  code?: unknown;
  error?: { issues?: unknown } | null;
  failure?: { issues?: unknown } | null;
  issues?: unknown;
} | null;

export function isWorkspaceChangedFailure(body: unknown): boolean {
  const failure = body as FailureShape;
  if (isWorkspaceChangedCode(failure?.code) || isWorkspaceChangedError(failure?.error)) return true;

  const issues = failure?.issues ?? failure?.failure?.issues ?? failure?.error?.issues;
  return (
    Array.isArray(issues) &&
    issues.some((issue) => isWorkspaceChangedCode((issue as { customCode?: unknown } | null)?.customCode))
  );
}
