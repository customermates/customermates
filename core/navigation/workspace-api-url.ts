import { workspaceApiPath, workspaceSlugFromPathname } from "./workspace-paths";

export function currentWorkspaceSlug(): string | null {
  return typeof window === "undefined" ? null : workspaceSlugFromPathname(window.location.pathname);
}

export function workspaceApiUrl(apiPath: string, slug: string | null = currentWorkspaceSlug()): string {
  return slug ? workspaceApiPath(slug, apiPath) : apiPath;
}
