import { isWorkspaceChangedError, isWorkspaceChangedFailure } from "./workspace-changed";

let workspaceChangedHandler: (() => void) | null = null;
let workspaceChanged = false;

export function registerWorkspaceChangedHandler(handler: () => void): () => void {
  workspaceChangedHandler = handler;
  return () => {
    if (workspaceChangedHandler === handler) workspaceChangedHandler = null;
  };
}

export function notifyWorkspaceChanged(): void {
  workspaceChanged = true;
  if (workspaceChangedHandler) workspaceChangedHandler();
  else window.location.reload();
}

export function hasWorkspaceChanged(): boolean {
  return workspaceChanged;
}

export function notifyIfWorkspaceChanged(failure: unknown): boolean {
  if (!isWorkspaceChangedError(failure) && !isWorkspaceChangedFailure(failure)) return false;
  notifyWorkspaceChanged();
  return true;
}
