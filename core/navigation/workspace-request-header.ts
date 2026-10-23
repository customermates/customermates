import { WORKSPACE_HEADER, isWorkspaceSlugSegment } from "./workspace-paths";

export function requestedWorkspaceSlug(headers: Headers): string | null {
  const value = headers.get(WORKSPACE_HEADER);
  return isWorkspaceSlugSegment(value) ? value : null;
}
