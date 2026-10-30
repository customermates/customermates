import type { CaptureContext } from "./capture-context";

import {
  WORKSPACE_HEADER,
  workspaceSlugFromPathname,
  workspaceSlugFromApiPathname,
} from "@/core/navigation/workspace-paths";

export async function requestErrorContext(headers: Headers, path?: string): Promise<CaptureContext> {
  if (headers.has("x-api-key") || /^Bearer\s/i.test(headers.get("authorization") ?? "")) return {};
  if (!/(?:^|;\s*)(?:__Secure-)?app\.session_token=/.test(headers.get("cookie") ?? "")) return {};
  try {
    const { auth } = await import("@/core/auth/better-auth");
    const session = await auth.api.getSession({
      headers,
      query: { disableRefresh: true },
    });
    if (!session) return {};
    const requestHeaders = new Headers(headers);
    if (path) {
      requestHeaders.delete(WORKSPACE_HEADER);
      const slug = workspaceSlugFromPathname(path) ?? workspaceSlugFromApiPathname(path);
      if (slug) requestHeaders.set(WORKSPACE_HEADER, slug);
    }
    const { getActiveWorkspaceService } = await import("@/core/di");
    const user = await getActiveWorkspaceService().resolveMembership(session, requestHeaders);
    if (!user || user.status !== "active") return {};
    return { user: { id: user.id }, tags: { companyId: user.companyId } };
  } catch {
    return {};
  }
}
