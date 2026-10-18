import { describe, expect, it } from "vitest";

import {
  MCP_ENDPOINT_PATH,
  isMcpWorkspaceId,
  mcpProtectedResourceMetadataUrl,
  mcpWorkspaceIdFromResource,
  mcpWorkspacePath,
  mcpWorkspaceUrl,
} from "@/features/auth/mcp-resource";

const BASE_URL = "https://crm.example.com";
const WORKSPACE = "6f1c2b9e-4d3a-4b8c-9e7f-0a1b2c3d4e5f";

describe("per-workspace MCP resource", () => {
  it("builds the workspace URL and its protected resource metadata URL next to the bare endpoint", () => {
    expect(MCP_ENDPOINT_PATH).toBe("/api/v1/mcp");
    expect(mcpWorkspacePath(WORKSPACE)).toBe(`/api/v1/mcp/w/${WORKSPACE}`);
    expect(mcpWorkspaceUrl(BASE_URL, WORKSPACE)).toBe(`${BASE_URL}/api/v1/mcp/w/${WORKSPACE}`);
    expect(mcpProtectedResourceMetadataUrl(BASE_URL)).toBe(`${BASE_URL}/.well-known/oauth-protected-resource`);
    expect(mcpProtectedResourceMetadataUrl(BASE_URL, WORKSPACE)).toBe(
      `${BASE_URL}/.well-known/oauth-protected-resource/api/v1/mcp/w/${WORKSPACE}`,
    );
  });

  it("accepts only lowercase UUIDs as workspace ids", () => {
    expect(isMcpWorkspaceId(WORKSPACE)).toBe(true);
    expect(isMcpWorkspaceId(WORKSPACE.toUpperCase())).toBe(false);
    expect(isMcpWorkspaceId("not-a-workspace")).toBe(false);
    expect(isMcpWorkspaceId(`${WORKSPACE}x`)).toBe(false);
    expect(isMcpWorkspaceId("")).toBe(false);
    expect(isMcpWorkspaceId(undefined)).toBe(false);
  });

  it("reads the workspace from a resource indicator of this instance only", () => {
    expect(mcpWorkspaceIdFromResource(`${BASE_URL}/api/v1/mcp/w/${WORKSPACE}`, BASE_URL)).toBe(WORKSPACE);
    expect(mcpWorkspaceIdFromResource(`${BASE_URL}/api/v1/mcp/w/${WORKSPACE}/`, BASE_URL)).toBe(WORKSPACE);
    expect(mcpWorkspaceIdFromResource(`${BASE_URL}/api/v1/mcp/w/${WORKSPACE}?toolsets=records`, BASE_URL)).toBe(
      WORKSPACE,
    );
    expect(mcpWorkspaceIdFromResource(`${BASE_URL}/api/v1/mcp`, BASE_URL)).toBeNull();
    expect(mcpWorkspaceIdFromResource(`${BASE_URL}/api/v1/mcp/w/not-a-workspace`, BASE_URL)).toBeNull();
    expect(mcpWorkspaceIdFromResource(`${BASE_URL}/api/v1/mcp/w/${WORKSPACE}/extra`, BASE_URL)).toBeNull();
    expect(mcpWorkspaceIdFromResource(`https://attacker.example/api/v1/mcp/w/${WORKSPACE}`, BASE_URL)).toBeNull();
    expect(mcpWorkspaceIdFromResource(`http://crm.example.com/api/v1/mcp/w/${WORKSPACE}`, BASE_URL)).toBeNull();
    expect(mcpWorkspaceIdFromResource(`/api/v1/mcp/w/${WORKSPACE}`, BASE_URL)).toBeNull();
    expect(mcpWorkspaceIdFromResource([`${BASE_URL}/api/v1/mcp/w/${WORKSPACE}`], BASE_URL)).toBeNull();
    expect(mcpWorkspaceIdFromResource(undefined, BASE_URL)).toBeNull();
  });
});
