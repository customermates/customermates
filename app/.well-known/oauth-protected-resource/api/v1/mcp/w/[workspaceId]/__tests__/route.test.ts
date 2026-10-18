import { beforeEach, describe, expect, it, vi } from "vitest";

const metadata = vi.hoisted(() => ({
  handler: vi.fn((request: Request) =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          resource: "http://localhost:4000/api/v1/mcp",
          authorization_servers: [new URL(request.url).origin],
          jwks_uri: "http://localhost:4000/api/auth/mcp/jwks",
          scopes_supported: ["openid", "profile", "email", "offline_access"],
          bearer_methods_supported: ["header"],
          resource_signing_alg_values_supported: ["RS256"],
        }),
        { status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } },
      ),
    ),
  ),
}));

vi.mock("better-auth/plugins", () => ({ oAuthProtectedResourceMetadata: () => metadata.handler }));
vi.mock("@/core/auth/better-auth", () => ({ auth: {} }));
vi.mock("@/env", () => ({ env: { BASE_URL: "http://localhost:4000" } }));

import { GET } from "../route";

const WORKSPACE = "6f1c2b9e-4d3a-4b8c-9e7f-0a1b2c3d4e5f";

function discover(workspaceId: string) {
  const request = new Request(
    `http://localhost:4000/.well-known/oauth-protected-resource/api/v1/mcp/w/${workspaceId}`,
  );
  return GET(request, { params: Promise.resolve({ workspaceId }) });
}

describe("protected resource metadata of a workspace's MCP URL", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("names the workspace's MCP URL as the resource and keeps everything else of the bare endpoint", async () => {
    const response = await discover(WORKSPACE);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(await response.json()).toEqual({
      resource: `http://localhost:4000/api/v1/mcp/w/${WORKSPACE}`,
      authorization_servers: ["http://localhost:4000"],
      jwks_uri: "http://localhost:4000/api/auth/mcp/jwks",
      scopes_supported: ["openid", "profile", "email", "offline_access"],
      bearer_methods_supported: ["header"],
      resource_signing_alg_values_supported: ["RS256"],
    });
  });

  it.each(["not-a-workspace", WORKSPACE.toUpperCase()])("answers 404 for %s", async (workspaceId) => {
    const response = await discover(workspaceId);

    expect(response.status).toBe(404);
    expect(metadata.handler).not.toHaveBeenCalled();
  });
});
