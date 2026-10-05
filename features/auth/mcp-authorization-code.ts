export const MCP_TOKEN_PATH = "/mcp/token";
export const MCP_LIBRARY_CONSENT_PATH = "/oauth2/consent";

const APPROVAL_FIELD = "customermatesConsentApproved";

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

export function authorizationCodeFromTokenRequest(body: unknown): string | null {
  const fields = body instanceof FormData ? Object.fromEntries(body.entries()) : body;
  if (!fields || typeof fields !== "object") return null;

  const { grant_type: grantType, code } = fields as Record<string, unknown>;
  if (grantType !== "authorization_code") return null;

  return typeof code === "string" ? code : "";
}
