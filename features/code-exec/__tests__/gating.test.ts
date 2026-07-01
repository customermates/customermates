import type { McpTool } from "@/app/api/v1/mcp/mcp-route-utils";

import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

// Importing the real runCodeTool pulls in run-code.service -> @/core/di. Stub di (as the
// sibling sandbox tests do) so the unit env doesn't spin up the real better-auth context;
// the gating assertions never touch the tool's execute path.
vi.mock("@/core/di", () => ({
  getUserService: () => ({ getActiveUserOrThrow: vi.fn() }),
}));

import { ALWAYS_APPROVE_TOOL_NAMES, buildAgentToolsFrom } from "@/features/agent-chat/tool-gating";
import { getPreAuthorizedToolNames } from "@/features/agent-chat/pre-authorized-tools";
import { runCodeTool } from "@/features/mcp-tools/code-exec.mcp-tools";

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

const deleteTool = makeTool("delete_entities", { readOnlyHint: false, destructiveHint: true });

describe("run_code gating", () => {
  it("forces approval for run_code even when the user pre-authorized it", () => {
    // Use the REAL tool definition so a change to its annotations (or a rename that
    // drops the always-approve signal) fails this test instead of silently downgrading.
    const tools = buildAgentToolsFrom([runCodeTool as unknown as McpTool, deleteTool], {
      preAuthorizedToolNames: ["run_code", "delete_entities"],
    });

    expect(tools.run_code?.needsApproval).toBe(true); // never downgraded
    expect(tools.delete_entities?.needsApproval).toBe(false); // normal pre-auth still works
    // The gate is driven by the tool's `alwaysApprove` annotation, and the name-keyed
    // mirror the UI/read-filter use must stay in lockstep with it.
    expect(runCodeTool.annotations.alwaysApprove).toBe(true);
    expect(ALWAYS_APPROVE_TOOL_NAMES.has(runCodeTool.name)).toBe(true);
  });

  it("gates an always-approve tool by annotation even under a different name", () => {
    const renamed = makeTool("execute_code", { destructiveHint: true, alwaysApprove: true });
    const tools = buildAgentToolsFrom([renamed], { preAuthorizedToolNames: ["execute_code"] });
    expect(tools.execute_code?.needsApproval).toBe(true);
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
