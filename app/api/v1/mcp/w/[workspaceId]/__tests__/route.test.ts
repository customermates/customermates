import { beforeEach, describe, expect, it, vi } from "vitest";

const route = vi.hoisted(() => ({ mcpRoute: vi.fn(() => Promise.resolve(new Response("served"))) }));

vi.mock("../../../mcp-route", () => route);

import { DELETE, GET, POST } from "../route";

const WORKSPACE = "6f1c2b9e-4d3a-4b8c-9e7f-0a1b2c3d4e5f";

function call(handler: typeof POST, workspaceId: string) {
  const request = new Request(`http://localhost:4000/api/v1/mcp/w/${workspaceId}`, { method: "POST", body: "{}" });
  return { request, response: handler(request, { params: Promise.resolve({ workspaceId }) }) };
}

describe("per-workspace MCP endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["POST", POST],
    ["GET", GET],
    ["DELETE", DELETE],
  ])("hands %s to the shared MCP route locked to the workspace of the URL", async (_method, handler) => {
    const { request, response } = call(handler, WORKSPACE);

    expect(await (await response).text()).toBe("served");
    expect(route.mcpRoute).toHaveBeenCalledWith(request, WORKSPACE);
  });

  it.each(["not-a-workspace", WORKSPACE.toUpperCase(), `${WORKSPACE}0`, "00000000-0000-0000-0000-000000000000x"])(
    "answers 404 for %s without touching the MCP route",
    async (workspaceId) => {
      const response = await call(POST, workspaceId).response;

      expect(response.status).toBe(404);
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
      expect(await response.json()).toEqual({ error: "not_found", message: "No MCP endpoint exists at this address." });
      expect(route.mcpRoute).not.toHaveBeenCalled();
    },
  );
});
