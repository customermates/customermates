import { describe, expect, it } from "vitest";

import { ALL_MCP_TOOLS } from "@/features/mcp-tools/tool-registry";

function manageDataViewsTool() {
  const tool = ALL_MCP_TOOLS.find(({ name }) => name === "manage_data_views");
  if (!tool) throw new Error("manage_data_views is not registered");
  return tool;
}

const VIEW_ID = "30000000-0000-4000-8000-000000000001";

describe("manage_data_views delete over MCP", () => {
  it("requires the exact view name so an agent cannot delete a view by id alone", () => {
    const parsed = manageDataViewsTool().inputSchema.safeParse({
      action: "delete",
      surfaceKey: "dashboard",
      viewKey: VIEW_ID,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues.some((issue) => issue.path.join(".") === "name")).toBe(true);
  });

  it("accepts a delete that names the view", () => {
    const parsed = manageDataViewsTool().inputSchema.safeParse({
      action: "delete",
      surfaceKey: "dashboard",
      viewKey: VIEW_ID,
      name: "Existing",
    });
    expect(parsed.success).toBe(true);
  });
});
