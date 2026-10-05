import { describe, expect, it } from "vitest";

import {
  approveMcpAuthorizationCodeValue,
  authorizationCodeFromTokenRequest,
  isApprovedMcpAuthorizationCodeValue,
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
});
