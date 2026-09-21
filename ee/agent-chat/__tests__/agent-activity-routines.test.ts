import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ROUTING_LOCALES } from "@/i18n/locale-registry";

import { AGENT_APPROVAL_COPY_KINDS, agentActivityCopy, describeAgentTool } from "../agent-activity";
import { ALL_MCP_TOOLS } from "@/features/mcp-tools/tool-registry";

import { requiresApproval } from "../gated-tools";
import { internalToolIdentity } from "../tool-identity";

const describeInternalTool = (name: string, input: unknown) => describeAgentTool(internalToolIdentity(name), input);

function translatorFor(locale: string) {
  const messages = JSON.parse(readFileSync(join(process.cwd(), "i18n", "locales", `${locale}.json`), "utf8")) as Record<
    string,
    unknown
  >;
  return (key: string) => {
    const value = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], messages);
    if (typeof value !== "string") throw new Error(`missing ${locale} message ${key}`);
    return value;
  };
}

describe("manage_routines activity", () => {
  it("names every action with its own kind, risk and consequence", () => {
    expect(describeInternalTool("manage_routines", { action: "list" })).toMatchObject({
      kind: "routines.read",
      risk: "read",
    });
    expect(describeInternalTool("manage_routines", { action: "runs" })).toMatchObject({
      kind: "routines.read",
      risk: "read",
    });
    expect(describeInternalTool("manage_routines", { action: "create", name: "Stale deals" })).toMatchObject({
      kind: "routines.create",
      risk: "write",
    });
    expect(describeInternalTool("manage_routines", { action: "update", id: "x" })).toMatchObject({
      kind: "routines.update",
      risk: "write",
    });
    expect(describeInternalTool("manage_routines", { action: "pause", id: "x" })).toMatchObject({
      kind: "routines.configure",
      risk: "write",
      consequence: { action: "routine.pause" },
    });
    expect(describeInternalTool("manage_routines", { action: "run_now", id: "x" })).toMatchObject({
      kind: "routines.configure",
      risk: "write",
      consequence: { action: "routine.run" },
    });
    expect(describeInternalTool("manage_routines", { action: "delete", id: "x" })).toMatchObject({
      kind: "routines.delete",
      risk: "sensitive",
      consequence: { action: "routine.delete" },
    });
    expect(
      JSON.stringify(describeInternalTool("manage_routines", { action: "delete", id: "secret-id" })),
    ).not.toContain("secret-id");
  });

  it("has localized copy in every content locale, with a distinct approval label for gated kinds", () => {
    for (const locale of ROUTING_LOCALES) {
      const t = translatorFor(locale);
      for (const action of ["list", "create", "update", "pause", "run_now", "delete"]) {
        const copy = agentActivityCopy(describeInternalTool("manage_routines", { action, id: "x" }), t);
        expect(copy.running.length, `${locale} ${action}`).toBeGreaterThan(0);
        expect(copy.done.length).toBeGreaterThan(0);
        expect(copy.error.length).toBeGreaterThan(0);
      }
      const deletion = agentActivityCopy(describeInternalTool("manage_routines", { action: "delete", id: "x" }), t);
      expect(deletion.approval).not.toBe(deletion.running);
      expect(deletion.detail).toBeTruthy();
      const send = agentActivityCopy(describeInternalTool("send_email", { to: ["a@b.c"], subject: "s" }), t);
      expect(send.approval).not.toBe(send.running);
      const read = agentActivityCopy(describeInternalTool("list_records", { entity: "deal" }), t);
      expect(read.approval).toBe(read.running);
    }
    expect(ROUTING_LOCALES.length).toBeGreaterThan(0);
  });

  it("carries approval copy for every kind that can still reach an approval card", () => {
    const declaredActions = (tool: (typeof ALL_MCP_TOOLS)[number]): string[] => {
      const shape = (tool.inputSchema as { shape?: Record<string, { options?: unknown }> }).shape;
      const options = shape?.action?.options;
      return Array.isArray(options) ? options.filter((option): option is string => typeof option === "string") : [];
    };
    const reachable = new Set<string>();
    for (const tool of ALL_MCP_TOOLS) {
      const inputs = [undefined, {}, ...declaredActions(tool).map((action) => ({ action }))];
      for (const input of inputs) {
        if (!requiresApproval(internalToolIdentity(tool.name), tool, input)) continue;
        reachable.add(describeInternalTool(tool.name, input).kind);
      }
    }
    expect(reachable.size).toBeGreaterThan(0);
    for (const kind of reachable) expect(AGENT_APPROVAL_COPY_KINDS).toContain(kind);
    expect(AGENT_APPROVAL_COPY_KINDS).not.toContain("records.read");
  });
});
