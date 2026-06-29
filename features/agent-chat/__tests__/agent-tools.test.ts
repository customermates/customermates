import type { McpTool } from "@/app/api/v1/mcp/mcp-route-utils";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { buildAgentToolsFrom, toolNeedsApproval } from "../tool-gating";

function makeTool(name: string, annotations: Record<string, boolean>): McpTool {
  return {
    name,
    description: name,
    annotations,
    inputSchema: z.object({}),
    execute: () => "ok",
  };
}

const readTool = makeTool("filter_entity", { readOnlyHint: true, openWorldHint: false });
const safeWriteTool = makeTool("update_entity_notes", {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
});
const deleteTool = makeTool("delete_entities", { readOnlyHint: false, destructiveHint: true });
const sendTool = makeTool("send_email", { readOnlyHint: false, destructiveHint: false, openWorldHint: true });

describe("agent tool gating", () => {
  it("flags only destructive or side-effecting tools as needing approval", () => {
    expect(toolNeedsApproval(readTool)).toBe(false);
    expect(toolNeedsApproval(safeWriteTool)).toBe(false);
    expect(toolNeedsApproval(deleteTool)).toBe(true); // destructiveHint
    expect(toolNeedsApproval(sendTool)).toBe(true); // openWorldHint
  });

  it("gates non-pre-authorized destructive/side-effecting tools and auto-runs safe ones", () => {
    const tools = buildAgentToolsFrom([readTool, safeWriteTool, deleteTool, sendTool], {
      preAuthorizedToolNames: [],
    });

    expect(tools.filter_entity?.needsApproval).toBe(false);
    expect(tools.update_entity_notes?.needsApproval).toBe(false);
    expect(tools.delete_entities?.needsApproval).toBe(true);
    expect(tools.send_email?.needsApproval).toBe(true);
  });

  it("skips approval for pre-authorized tools", () => {
    const tools = buildAgentToolsFrom([deleteTool, sendTool], {
      preAuthorizedToolNames: ["send_email"],
    });

    expect(tools.delete_entities?.needsApproval).toBe(true);
    expect(tools.send_email?.needsApproval).toBe(false);
  });

  it("exposes every tool to the agent regardless of gating", () => {
    const tools = buildAgentToolsFrom([readTool, safeWriteTool, deleteTool, sendTool], {
      preAuthorizedToolNames: [],
    });

    expect(Object.keys(tools).sort()).toEqual([
      "delete_entities",
      "filter_entity",
      "send_email",
      "update_entity_notes",
    ]);
  });
});
