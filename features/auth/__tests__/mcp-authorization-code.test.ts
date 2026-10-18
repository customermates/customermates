import { describe, expect, it } from "vitest";

import {
  approveMcpAuthorizationCodeValue,
  authorizationCodeFromTokenRequest,
  consentCodeFromAuthorizeRedirect,
  isApprovedMcpAuthorizationCodeValue,
  mcpResourceWorkspaceOf,
  resourceFromTokenRequest,
  withMcpResourceWorkspace,
} from "@/features/auth/mcp-authorization-code";

describe("MCP authorization code approval", () => {
  it("accepts only a value that passed the consent decision", () => {
    const pending = { userId: "user", requireConsent: true };

    expect(isApprovedMcpAuthorizationCodeValue(JSON.stringify(approveMcpAuthorizationCodeValue(pending)))).toBe(true);
    expect(isApprovedMcpAuthorizationCodeValue(JSON.stringify(pending))).toBe(false);
    expect(isApprovedMcpAuthorizationCodeValue(JSON.stringify({ ...pending, requireConsent: false }))).toBe(false);
    expect(
      isApprovedMcpAuthorizationCodeValue(
        JSON.stringify({ ...approveMcpAuthorizationCodeValue(pending), requireConsent: true }),
      ),
    ).toBe(false);
    expect(isApprovedMcpAuthorizationCodeValue("not json")).toBe(false);
    expect(isApprovedMcpAuthorizationCodeValue(null)).toBe(false);
    expect(isApprovedMcpAuthorizationCodeValue(undefined)).toBe(false);
  });

  it("reads the code only from authorization-code grants", () => {
    const form = new FormData();
    form.set("grant_type", "authorization_code");
    form.set("code", "form-code");

    expect(authorizationCodeFromTokenRequest({ grant_type: "authorization_code", code: "json-code" })).toBe(
      "json-code",
    );
    expect(authorizationCodeFromTokenRequest(form)).toBe("form-code");
    expect(authorizationCodeFromTokenRequest({ grant_type: "authorization_code" })).toBe("");
    expect(authorizationCodeFromTokenRequest({ grant_type: "refresh_token", refresh_token: "r" })).toBeNull();
    expect(authorizationCodeFromTokenRequest(undefined)).toBeNull();
    expect(authorizationCodeFromTokenRequest("grant_type=authorization_code")).toBeNull();
  });

  it("carries the workspace of a per-workspace resource through the approval", () => {
    const pending = { userId: "user", requireConsent: true };
    const bound = withMcpResourceWorkspace(pending, "workspace-b");

    expect(mcpResourceWorkspaceOf(bound)).toBe("workspace-b");
    expect(mcpResourceWorkspaceOf(approveMcpAuthorizationCodeValue(bound))).toBe("workspace-b");
    expect(isApprovedMcpAuthorizationCodeValue(JSON.stringify(approveMcpAuthorizationCodeValue(bound)))).toBe(true);
    expect(mcpResourceWorkspaceOf(pending)).toBeNull();
    expect(mcpResourceWorkspaceOf({ customermatesResourceWorkspaceId: "" })).toBeNull();
    expect(mcpResourceWorkspaceOf({ customermatesResourceWorkspaceId: 42 })).toBeNull();
  });

  it("reads the consent code only from a redirect to the consent page", () => {
    const base = "https://crm.example.com";

    expect(consentCodeFromAuthorizeRedirect("/auth/mcp-consent?consent_code=abc&client_id=c&scope=openid", base)).toBe(
      "abc",
    );
    expect(consentCodeFromAuthorizeRedirect(`${base}/auth/mcp-consent?consent_code=abc`, base)).toBe("abc");
    expect(consentCodeFromAuthorizeRedirect("/auth/signin?consent_code=abc", base)).toBeNull();
    expect(consentCodeFromAuthorizeRedirect("https://client.example/callback?code=abc", base)).toBeNull();
    expect(consentCodeFromAuthorizeRedirect("/auth/mcp-consent", base)).toBeNull();
    expect(consentCodeFromAuthorizeRedirect(null, base)).toBeNull();
    expect(consentCodeFromAuthorizeRedirect(undefined, base)).toBeNull();
  });

  it("reads the resource indicator of a token request from form and JSON bodies", () => {
    const form = new FormData();
    form.set("grant_type", "refresh_token");
    form.set("resource", "https://crm.example.com/api/v1/mcp/w/abc");

    expect(resourceFromTokenRequest(form)).toBe("https://crm.example.com/api/v1/mcp/w/abc");
    expect(resourceFromTokenRequest({ grant_type: "authorization_code", resource: "r" })).toBe("r");
    expect(resourceFromTokenRequest({ grant_type: "authorization_code" })).toBeUndefined();
    expect(resourceFromTokenRequest(undefined)).toBeUndefined();
  });
});
