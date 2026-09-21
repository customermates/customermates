import { describe, expect, it } from "vitest";

import {
  GET_STARTED_PROMPT,
  MCP_CLIENT_CONFIRMATION_INSTRUCTION,
  MCP_SERVER_INSTRUCTIONS,
  MCP_UNTRUSTED_CONTENT_INSTRUCTION,
  TOOL_APPROVAL_INSTRUCTION,
} from "@/features/mcp-tools/server-instructions";
import { requiresApproval } from "@/ee/agent-chat/gated-tools";
import { internalToolIdentity } from "@/ee/agent-chat/tool-identity";
import { ALL_MCP_TOOLS } from "@/features/mcp-tools/tool-registry";

const EXTERNAL_TEXTS = { MCP_SERVER_INSTRUCTIONS, GET_STARTED_PROMPT };

describe("what an external MCP client is told", () => {
  it.each(Object.entries(EXTERNAL_TEXTS))("never promises %s a gate the server does not have", (_name, text) => {
    expect(text).not.toContain(TOOL_APPROVAL_INSTRUCTION);
    expect(text).not.toMatch(/nothing happens until that confirmation is granted/);
  });

  it.each(Object.entries(EXTERNAL_TEXTS))("tells %s to confirm with its own user", (_name, text) => {
    expect(text).toContain(MCP_CLIENT_CONFIRMATION_INSTRUCTION);
  });

  it("names every tool the hosted product stops for an approval", () => {
    const declaredActions = (tool: (typeof ALL_MCP_TOOLS)[number]): (string | undefined)[] => {
      const shape = (tool.inputSchema as { shape?: Record<string, { options?: unknown }> }).shape;
      const options = shape?.action?.options;
      return Array.isArray(options) ? options.filter((o): o is string => typeof o === "string") : [undefined];
    };
    const gatedNames = new Set<string>();
    for (const tool of ALL_MCP_TOOLS)
      for (const action of declaredActions(tool))
        if (requiresApproval(internalToolIdentity(tool.name), tool, action ? { action } : undefined))
          gatedNames.add(tool.name);
    expect(gatedNames.size).toBeGreaterThan(0);
    for (const name of gatedNames) expect(MCP_CLIENT_CONFIRMATION_INSTRUCTION).toContain(name);
  });

  it("carries an untrusted-content rule", () => {
    expect(MCP_SERVER_INSTRUCTIONS).toContain(MCP_UNTRUSTED_CONTENT_INSTRUCTION);
  });

  it("keeps the hosted approval instruction for the hosted prompt only", () => {
    expect(TOOL_APPROVAL_INSTRUCTION).toMatch(/nothing happens until that confirmation is granted/);
  });
});
