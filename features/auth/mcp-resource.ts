import { z } from "zod";

export const MCP_ENDPOINT_PATH = "/api/v1/mcp";

const MCP_WORKSPACE_PATH_PREFIX = `${MCP_ENDPOINT_PATH}/w/`;
const PROTECTED_RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource";

const workspaceIdSchema = z.uuid();

export function isMcpWorkspaceId(value: unknown): value is string {
  return typeof value === "string" && value === value.toLowerCase() && workspaceIdSchema.safeParse(value).success;
}

export function mcpWorkspacePath(companyId: string): string {
  return `${MCP_WORKSPACE_PATH_PREFIX}${companyId}`;
}

export function mcpWorkspaceUrl(baseUrl: string, companyId: string): string {
  return `${baseUrl}${mcpWorkspacePath(companyId)}`;
}

export function mcpProtectedResourceMetadataUrl(baseUrl: string, companyId?: string): string {
  return `${baseUrl}${PROTECTED_RESOURCE_METADATA_PATH}${companyId ? mcpWorkspacePath(companyId) : ""}`;
}

export function mcpWorkspaceIdFromResource(resource: unknown, baseUrl: string): string | null {
  if (typeof resource !== "string" || !URL.canParse(resource)) return null;

  const url = new URL(resource);
  if (url.origin !== new URL(baseUrl).origin || !url.pathname.startsWith(MCP_WORKSPACE_PATH_PREFIX)) return null;

  const companyId = url.pathname.slice(MCP_WORKSPACE_PATH_PREFIX.length).replace(/\/$/, "");
  return isMcpWorkspaceId(companyId) ? companyId : null;
}
