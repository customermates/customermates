export const MCP_AUTHORIZE_PATH = "/mcp/authorize";
export const MCP_TOKEN_PATH = "/mcp/token";
export const MCP_LIBRARY_CONSENT_PATH = "/oauth2/consent";
export const MCP_CONSENT_PAGE_PATH = "/auth/mcp-consent";

const APPROVAL_FIELD = "customermatesConsentApproved";
const RESOURCE_WORKSPACE_FIELD = "customermatesResourceWorkspaceId";

export function approveMcpAuthorizationCodeValue<T extends object>(value: T) {
  return { ...value, requireConsent: false, [APPROVAL_FIELD]: true };
}

export function isApprovedMcpAuthorizationCodeValue(raw: string | null | undefined): boolean {
  if (!raw) return false;

  try {
    const parsed = JSON.parse(raw);
    return parsed?.requireConsent === false && parsed?.[APPROVAL_FIELD] === true;
  } catch {
    return false;
  }
}

export function withMcpResourceWorkspace<T extends object>(value: T, companyId: string) {
  return { ...value, [RESOURCE_WORKSPACE_FIELD]: companyId };
}

export function mcpResourceWorkspaceOf(value: object): string | null {
  const companyId = (value as Record<string, unknown>)[RESOURCE_WORKSPACE_FIELD];
  return typeof companyId === "string" && companyId ? companyId : null;
}

export function consentCodeFromAuthorizeRedirect(location: string | null | undefined, baseUrl: string): string | null {
  if (!location || !URL.canParse(location, baseUrl)) return null;

  const url = new URL(location, baseUrl);
  return url.pathname === MCP_CONSENT_PAGE_PATH ? url.searchParams.get("consent_code") || null : null;
}

export function authorizationCodeFromTokenRequest(body: unknown): string | null {
  const fields = body instanceof FormData ? Object.fromEntries(body.entries()) : body;
  if (!fields || typeof fields !== "object") return null;

  const { grant_type: grantType, code } = fields as Record<string, unknown>;
  if (grantType !== "authorization_code") return null;

  return typeof code === "string" ? code : "";
}

export type McpTokenGrant =
  | { type: "authorization_code"; code: string }
  | { type: "refresh_token"; refreshToken: string };

export function tokenGrantFromRequest(body: unknown): McpTokenGrant | null {
  const fields = body instanceof FormData ? Object.fromEntries(body.entries()) : body;
  if (!fields || typeof fields !== "object") return null;

  const { grant_type: grantType, code, refresh_token: refreshToken } = fields as Record<string, unknown>;
  if (grantType === "authorization_code" && typeof code === "string" && code) return { type: grantType, code };
  if (grantType === "refresh_token" && typeof refreshToken === "string" && refreshToken)
    return { type: grantType, refreshToken };

  return null;
}

export function resourceFromTokenRequest(body: unknown): unknown {
  const fields = body instanceof FormData ? Object.fromEntries(body.entries()) : body;
  if (!fields || typeof fields !== "object") return undefined;

  return (fields as Record<string, unknown>).resource;
}

export function issuedAccessToken(returned: unknown): string | null {
  if (!returned || typeof returned !== "object" || returned instanceof Error) return null;

  const token = (returned as Record<string, unknown>).access_token;
  return typeof token === "string" && token ? token : null;
}

export function mcpAuthorizationCodeWorkspaceIdentifier(code: string): string {
  return `mcp-code-workspace:${code}`;
}
