import { getUserService, getWorkspaceSlugResolver } from "@/core/di";
import { resolveActiveTenantUser } from "@/core/decorators/resolve-tenant-user";
import { absoluteWorkspaceUrl } from "@/core/navigation/workspace-paths";
import { env } from "@/env";

export async function mcpWorkspaceSlug(): Promise<string> {
  const user = await resolveActiveTenantUser(() => getUserService().getActiveTenantUserOrThrow());
  return getWorkspaceSlugResolver().requireSlugOf(user);
}

export function mcpWorkspaceUrl(slug: string, path: string): string {
  return absoluteWorkspaceUrl(env.BASE_URL, null, slug, path);
}

export function mcpRecordUrl(slug: string, typeId: string, recordId: string): string {
  return mcpWorkspaceUrl(slug, `/records/${typeId}/${recordId}`);
}
