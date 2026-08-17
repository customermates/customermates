import { describe, it, expect, vi } from "vitest";
import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
  getLocale: () => Promise.resolve("en"),
}));

import { ALL_MCP_TOOLS, MCP_TOOL_GROUPS, MCP_ALWAYS_ON_TOOLS } from "@/features/mcp-tools/tool-registry";
import { isReadOnlyTool } from "../gated-tools";

const readOnlyNames = () => ALL_MCP_TOOLS.filter((tool) => isReadOnlyTool(tool)).map((tool) => tool.name);
const gatedNames = () => ALL_MCP_TOOLS.filter((tool) => !isReadOnlyTool(tool)).map((tool) => tool.name);

describe("gated-tools", () => {
  it("partitions the full surface: every tool is either gated or read-only, never both", () => {
    expect(gatedNames().length + readOnlyNames().length).toBe(ALL_MCP_TOOLS.length);
    const readOnly = new Set(readOnlyNames());
    for (const name of gatedNames()) expect(readOnly.has(name)).toBe(false);
  });

  it("fails closed: a tool without annotations is gated", () => {
    for (const tool of ALL_MCP_TOOLS.filter((tool) => !tool.annotations)) expect(isReadOnlyTool(tool)).toBe(false);
  });

  it("fails closed: only explicit readOnlyHint:true escapes gating", () => {
    for (const tool of ALL_MCP_TOOLS) expect(isReadOnlyTool(tool)).toBe(tool.annotations?.readOnlyHint === true);
  });

  it("gates every known write tool", () => {
    const gated = new Set(gatedNames());

    for (const name of ["delete_records", "send_email", "send_chat_message", "create_contacts", "manage_team"])
      expect(gated.has(name)).toBe(true);
  });

  it("keeps known read tools ungated", () => {
    const readOnly = new Set(readOnlyNames());

    for (const name of ["list_records", "search_records", "get_records", "get_workspace_context"])
      expect(readOnly.has(name)).toBe(true);
  });

  it("snapshots the surface so new tools force a conscious gating decision", () => {
    const groupSizes = Object.fromEntries(Object.entries(MCP_TOOL_GROUPS).map(([key, tools]) => [key, tools.length]));

    expect(groupSizes).toEqual({
      records: 17,
      workspace: 2,
      messaging: 9,
      social: 8,
      docs: 2,
      "custom-columns": 1,
      widgets: 1,
      webhooks: 1,
      admin: 2,
      support: 1,
    });
    expect(MCP_ALWAYS_ON_TOOLS).toHaveLength(2);
    expect(gatedNames().sort()).toMatchSnapshot();
    expect(readOnlyNames().sort()).toMatchSnapshot();
  });
});
