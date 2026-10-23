import { WORKSPACE_LANDING_PATH, absoluteWorkspaceUrl } from "@/core/navigation/workspace-paths";
import { buildLocalePath } from "@/i18n/locale-registry";

export function workspaceReturnUrl(
  baseUrl: string,
  slug: string | null | undefined,
  path: string,
  locale: string | null = null,
): string {
  if (slug) return absoluteWorkspaceUrl(baseUrl, locale, slug, path);
  const entry = locale ? buildLocalePath(locale, WORKSPACE_LANDING_PATH) : WORKSPACE_LANDING_PATH;
  return `${baseUrl.replace(/\/+$/u, "")}${entry}`;
}
