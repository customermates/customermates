import { ForbiddenError } from "./app-errors";
import { WORKSPACE_CHANGED_DIGEST } from "./workspace-changed";

const WORKSPACE_CHANGED_BRAND = Symbol.for("customermates.workspaceChanged");

export const WORKSPACE_CHANGED_MESSAGE =
  "This workspace is not available to you. It may have been deleted, renamed or your access was removed.";

export class WorkspaceChangedError extends ForbiddenError {
  readonly digest = WORKSPACE_CHANGED_DIGEST;

  constructor() {
    super(WORKSPACE_CHANGED_MESSAGE);
    (this as Record<symbol, unknown>)[WORKSPACE_CHANGED_BRAND] = true;
  }

  static [Symbol.hasInstance](value: unknown): value is WorkspaceChangedError {
    return (
      typeof value === "object" &&
      value !== null &&
      (value as Record<symbol, unknown>)[WORKSPACE_CHANGED_BRAND] === true
    );
  }
}
