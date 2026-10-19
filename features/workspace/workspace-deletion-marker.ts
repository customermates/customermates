export const WORKSPACE_DELETION_MARKER_MS = 10 * 60 * 1000;

export function isWorkspaceDeleting(deletingAt: Date | null | undefined, now = new Date()): boolean {
  return deletingAt != null && now.getTime() - deletingAt.getTime() < WORKSPACE_DELETION_MARKER_MS;
}

export function workspaceDeletionMarkerCutoff(now = new Date()): Date {
  return new Date(now.getTime() - WORKSPACE_DELETION_MARKER_MS);
}
