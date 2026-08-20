import { describe, it, expect, vi } from "vitest";
import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
  getLocale: () => Promise.resolve("en"),
}));

import { ALL_MCP_TOOLS, MCP_TOOL_GROUPS, MCP_ALWAYS_ON_TOOLS } from "@/features/mcp-tools/tool-registry";
import { describeAgentTool } from "../agent-activity";
import {
  AGENT_APPROVAL_POLICY_TOOL_NAMES,
  approvalFreeActionsForTool,
  isReadOnlyTool,
  requiresApproval,
} from "../gated-tools";

const readOnlyNames = () => ALL_MCP_TOOLS.filter((tool) => isReadOnlyTool(tool)).map((tool) => tool.name);
const approvalFreeWriteNames = () =>
  ALL_MCP_TOOLS.filter((tool) => !isReadOnlyTool(tool) && !requiresApproval(tool, { action: "list" })).map(
    (tool) => tool.name,
  );
const approvalRequiredNames = () =>
  ALL_MCP_TOOLS.filter((tool) => requiresApproval(tool, { action: "list" })).map((tool) => tool.name);

const toolByName = (name: string) => {
  const tool = ALL_MCP_TOOLS.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Unknown tool ${name}`);
  return tool;
};

describe("gated-tools", () => {
  it("partitions the full surface: read-only, approval-free write, or approval-required", () => {
    expect(readOnlyNames().length + approvalFreeWriteNames().length + approvalRequiredNames().length).toBe(
      ALL_MCP_TOOLS.length,
    );
    const readOnly = new Set(readOnlyNames());
    const approvalFree = new Set(approvalFreeWriteNames());
    for (const name of approvalRequiredNames()) {
      expect(readOnly.has(name)).toBe(false);
      expect(approvalFree.has(name)).toBe(false);
    }
  });

  it("fails closed: a tool without annotations is not read-only", () => {
    for (const tool of ALL_MCP_TOOLS.filter((tool) => !tool.annotations)) expect(isReadOnlyTool(tool)).toBe(false);
  });

  it("fails closed: only explicit readOnlyHint:true escapes the write path", () => {
    for (const tool of ALL_MCP_TOOLS) expect(isReadOnlyTool(tool)).toBe(tool.annotations?.readOnlyHint === true);
  });

  it("fails closed: a tool outside the policy map always requires approval", () => {
    expect(requiresApproval({ name: "some_future_tool" }, {})).toBe(true);
    expect(requiresApproval({ name: "some_future_tool" }, { action: "list" })).toBe(true);
  });

  it("fails closed: a multiplexed call with a missing or unknown action requires approval", () => {
    for (const name of ["manage_custom_columns", "manage_widgets", "manage_webhooks"]) {
      const tool = toolByName(name);
      expect(requiresApproval(tool, {})).toBe(true);
      expect(requiresApproval(tool, { action: "purge_everything" })).toBe(true);
      expect(requiresApproval(tool, { action: 7 })).toBe(true);
      expect(requiresApproval(tool, undefined)).toBe(true);
    }
  });

  it("requires approval for exactly the destructive and outbound tools", () => {
    for (const name of ["delete_records", "discard_message_draft", "send_email", "send_chat_message"])
      expect(requiresApproval(toolByName(name), {})).toBe(true);
    for (const name of ["manage_custom_columns", "manage_widgets", "manage_webhooks"])
      expect(requiresApproval(toolByName(name), { action: "delete" })).toBe(true);
  });

  it("lets ordinary CRM work run without approval", () => {
    const freeCalls: [string, unknown][] = [
      ["create_contacts", {}],
      ["update_contacts", {}],
      ["create_deals", {}],
      ["update_deals", {}],
      ["update_record_notes", {}],
      ["manage_record_links", { action: "add" }],
      ["manage_record_links", { action: "remove" }],
      ["save_message_draft", {}],
      ["update_messaging_thread", {}],
      ["update_workspace_settings", {}],
      ["manage_team", {}],
      ["connect_messaging_account", {}],
      ["manage_custom_columns", { action: "upsert" }],
      ["manage_widgets", { action: "create" }],
      ["manage_webhooks", { action: "resend_delivery" }],
    ];
    for (const [name, input] of freeCalls) expect(requiresApproval(toolByName(name), input)).toBe(false);
  });

  it("never lets a destructiveHint tool run unconditionally approval-free", () => {
    for (const tool of ALL_MCP_TOOLS.filter((tool) => tool.annotations?.destructiveHint === true))
      expect(requiresApproval(tool, {})).toBe(true);
  });

  it("keeps every policy key pointing at a real tool", () => {
    const names = new Set(ALL_MCP_TOOLS.map((tool) => tool.name));
    for (const name of AGENT_APPROVAL_POLICY_TOOL_NAMES) expect(names.has(name)).toBe(true);
  });

  it("keeps the risk label aligned with the approval predicate for every catalog tool", () => {
    const inputs = [
      undefined,
      {},
      { action: "list" },
      { action: "delete" },
      { action: "upsert" },
      { action: "create" },
    ];
    for (const tool of ALL_MCP_TOOLS) {
      if (isReadOnlyTool(tool)) continue;
      for (const input of inputs) {
        const risk = describeAgentTool(tool.name, input).risk;
        if (risk === "read") continue;
        expect(`${tool.name} ${JSON.stringify(input)} ${risk === "sensitive"}`).toBe(
          `${tool.name} ${JSON.stringify(input)} ${requiresApproval(tool, input)}`,
        );
      }
    }
  });

  it("keeps known read tools ungated", () => {
    const readOnly = new Set(readOnlyNames());

    for (const name of ["list_records", "search_records", "get_records", "get_workspace_context"])
      expect(readOnly.has(name)).toBe(true);
  });

  it("snapshots the surface so new tools and actions force a conscious approval decision", () => {
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
    expect(readOnlyNames().sort()).toMatchSnapshot();
    expect(approvalFreeWriteNames().sort()).toMatchSnapshot();
    expect(approvalRequiredNames().sort()).toMatchSnapshot();
    expect(
      Object.fromEntries(
        AGENT_APPROVAL_POLICY_TOOL_NAMES.map((name) => [name, approvalFreeActionsForTool(name)]).filter(
          ([, actions]) => actions,
        ),
      ),
    ).toMatchSnapshot();
  });
});
