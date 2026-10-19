import type { TypedActionResult } from "./action-result";

import { isWorkspaceChangedFailure } from "@/core/errors/workspace-changed";
import { WorkspaceChangedError } from "@/core/errors/workspace-changed-error";
import { notifyIfWorkspaceChanged } from "@/core/errors/workspace-changed-notice";

export async function actionData<T>(pending: Promise<TypedActionResult<T>>): Promise<T> {
  const result = await pending;
  if (result.ok) return result.data;
  if (isWorkspaceChangedFailure(result)) throw new WorkspaceChangedError();
  throw Object.assign(new Error(result.failure.issues[0]?.message ?? "Action failed"), { failure: result.failure });
}

export async function actionDataOrNull<T>(pending: Promise<TypedActionResult<T>>): Promise<T | null> {
  const result = await pending;
  if (result.ok) return result.data;
  notifyIfWorkspaceChanged(result);
  return null;
}
