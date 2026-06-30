import type { McpTool } from "@/app/api/v1/mcp/mcp-route-utils";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ALWAYS_APPROVE_TOOL_NAMES, buildAgentToolsFrom } from "@/features/agent-chat/tool-gating";
import { getPreAuthorizedToolNames } from "@/features/agent-chat/pre-authorized-tools";

import { scrubSecrets } from "../scrub";

function makeTool(name: string, annotations: Record<string, boolean>): McpTool {
  return {
    name,
    description: name,
    annotations,
    inputSchema: z.object({ code: z.string() }),
    execute: () => "",
  } as unknown as McpTool;
}

const runCode = makeTool("run_code", { readOnlyHint: false, destructiveHint: true, openWorldHint: true });
const deleteTool = makeTool("delete_entities", { readOnlyHint: false, destructiveHint: true });

describe("run_code gating", () => {
  it("forces approval for run_code even when the user pre-authorized it", () => {
    const tools = buildAgentToolsFrom([runCode, deleteTool], {
      preAuthorizedToolNames: ["run_code", "delete_entities"],
    });

    expect(tools.run_code?.needsApproval).toBe(true); // never downgraded
    expect(tools.delete_entities?.needsApproval).toBe(false); // normal pre-auth still works
    expect(ALWAYS_APPROVE_TOOL_NAMES.has("run_code")).toBe(true);
  });

  it("excludes run_code from the effective pre-authorized set", () => {
    const names = getPreAuthorizedToolNames({
      preAuthorizedAgentTools: { toolNames: ["run_code", "delete_entities"] },
    });

    expect(names).toEqual(["delete_entities"]);
  });
});

describe("scrubSecrets", () => {
  it("redacts common secret shapes from output", () => {
    const out = scrubSecrets(
      "key sk-ant-abcd1234efgh5678 db postgres://user:pw@host:5432/db jwt eyJhbGciOi.eyJzdWIiOi.sigPART",
    );
    expect(out).not.toContain("sk-ant-abcd1234efgh5678");
    expect(out).not.toContain("postgres://user:pw@host");
    expect(out).toContain("[redacted]");
  });
});
