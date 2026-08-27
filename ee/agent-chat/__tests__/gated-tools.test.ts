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
import { agentToolIdentityKey, internalToolIdentity, parseAgentToolIdentityKey } from "../tool-identity";

const approvalNeeded = (tool: { name: string; annotations?: Record<string, boolean> }, input: unknown) =>
  requiresApproval(internalToolIdentity(tool.name), tool, input);
const describeInternalTool = (name: string, input: unknown) => describeAgentTool(internalToolIdentity(name), input);

const readOnlyNames = () => ALL_MCP_TOOLS.filter((tool) => isReadOnlyTool(tool)).map((tool) => tool.name);
const approvalFreeWriteNames = () =>
  ALL_MCP_TOOLS.filter((tool) => !isReadOnlyTool(tool) && !approvalNeeded(tool, { action: "list" })).map(
    (tool) => tool.name,
  );
const approvalRequiredNames = () =>
  ALL_MCP_TOOLS.filter((tool) => approvalNeeded(tool, { action: "list" })).map((tool) => tool.name);

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
    expect(approvalNeeded({ name: "some_future_tool" }, {})).toBe(true);
    expect(approvalNeeded({ name: "some_future_tool" }, { action: "list" })).toBe(true);
  });

  it("fails closed: a multiplexed call with a missing or unknown action requires approval", () => {
    for (const name of [
      "manage_custom_columns",
      "manage_widgets",
      "manage_webhooks",
      "manage_team",
      "manage_social_relations",
      "linkedin_manage_sales_lists",
    ]) {
      const tool = toolByName(name);
      expect(approvalNeeded(tool, {})).toBe(true);
      expect(approvalNeeded(tool, { action: "purge_everything" })).toBe(true);
      expect(approvalNeeded(tool, { action: 7 })).toBe(true);
      expect(approvalNeeded(tool, undefined)).toBe(true);
    }
  });

  it("requires approval for exactly the destructive and outbound tools", () => {
    for (const name of ["delete_records", "discard_message_draft", "send_email", "send_chat_message"])
      expect(approvalNeeded(toolByName(name), {})).toBe(true);
    for (const name of ["manage_custom_columns", "manage_widgets", "manage_webhooks"])
      expect(approvalNeeded(toolByName(name), { action: "delete" })).toBe(true);
    for (const [name, action] of [
      ["manage_social_relations", "invite"],
      ["manage_social_relations", "accept"],
      ["manage_social_relations", "cancel"],
      ["linkedin_manage_sales_lists", "save"],
      ["manage_team", "invite"],
      ["manage_webhooks", "resend_delivery"],
    ] as const)
      expect(approvalNeeded(toolByName(name), { action })).toBe(true);
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
      ["manage_team", { action: "update_member" }],
      ["connect_messaging_account", {}],
      ["manage_custom_columns", { action: "upsert" }],
      ["manage_widgets", { action: "create" }],
      ["manage_social_relations", { action: "list" }],
      ["linkedin_manage_sales_lists", { action: "list" }],
      ["linkedin_manage_sales_lists", { action: "browse" }],
    ];
    for (const [name, input] of freeCalls) expect(approvalNeeded(toolByName(name), input)).toBe(false);
  });

  it("never lets a destructiveHint tool run unconditionally approval-free", () => {
    for (const tool of ALL_MCP_TOOLS.filter((tool) => tool.annotations?.destructiveHint === true))
      expect(approvalNeeded(tool, {})).toBe(true);
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
        const risk = describeInternalTool(tool.name, input).risk;
        if (risk === "read") continue;
        expect(`${tool.name} ${JSON.stringify(input)} ${risk === "sensitive"}`).toBe(
          `${tool.name} ${JSON.stringify(input)} ${approvalNeeded(tool, input)}`,
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
        AGENT_APPROVAL_POLICY_TOOL_NAMES.map((name) => [
          name,
          approvalFreeActionsForTool(internalToolIdentity(name)),
        ]).filter(([, actions]) => actions),
      ),
    ).toMatchSnapshot();
  });
});

describe("tool identity", () => {
  const COLLIDING_NAMES = ["search", "fetch", "send_email", "create_contacts", "delete_records"];

  it("exposes names that a public MCP server would plausibly also expose", () => {
    const internal = new Set(ALL_MCP_TOOLS.map((tool) => tool.name));

    for (const name of ["search", "fetch"]) expect(internal.has(name)).toBe(true);
  });

  it.each(COLLIDING_NAMES)("does not let an external server inherit the internal policy for %s", (name) => {
    const external = { source: "external-mcp" as const, serverId: "acme", name };
    const claimsReadOnly = { name, annotations: { readOnlyHint: true } };

    expect(requiresApproval(external, claimsReadOnly, { action: "list" })).toBe(true);
    expect(requiresApproval(external, claimsReadOnly, {})).toBe(true);
    expect(approvalFreeActionsForTool(external)).toBeNull();
  });

  it("ignores a read-only annotation from a source that did not earn trust", () => {
    const internalReadOnly = { name: "search", annotations: { readOnlyHint: true } };

    expect(requiresApproval(internalToolIdentity("search"), internalReadOnly, {})).toBe(false);
    for (const source of ["external-mcp", "gateway-tool", "provider-native", "sandbox"] as const)
      expect(requiresApproval({ source, serverId: null, name: "search" }, internalReadOnly, {})).toBe(true);
  });

  it("describes a tool from another source generically, never with the internal label", () => {
    const input = { to: "someone@example.com", subject: "hello" };
    const internal = describeAgentTool(internalToolIdentity("send_email"), input);
    const external = describeAgentTool({ source: "external-mcp", serverId: "acme", name: "send_email" }, input);

    expect(internal.kind).toBe("messages.send");
    expect(external.kind).toBe("generic");
    expect(external.resource).toBeUndefined();
  });

  it("never understates the risk of a tool it cannot vouch for", () => {
    for (const source of ["external-mcp", "gateway-tool", "provider-native", "sandbox"] as const)
      expect(describeAgentTool({ source, serverId: "acme", name: "get_records" }, {}).risk).toBe("sensitive");

    expect(describeAgentTool(internalToolIdentity("get_records"), {}).risk).toBe("read");
  });

  it("round-trips an identity through its key without collapsing distinct sources", () => {
    const identities = [
      internalToolIdentity("search"),
      { source: "external-mcp" as const, serverId: "acme", name: "search" },
      { source: "external-mcp" as const, serverId: "other", name: "search" },
      { source: "gateway-tool" as const, serverId: null, name: "search" },
    ];
    const keys = identities.map(agentToolIdentityKey);

    expect(new Set(keys).size).toBe(identities.length);
    for (const identity of identities)
      expect(parseAgentToolIdentityKey(agentToolIdentityKey(identity))).toEqual(identity);
    expect(parseAgentToolIdentityKey("not-a-source::acme::search")).toBeNull();
    expect(parseAgentToolIdentityKey("external-mcp::acme")).toBeNull();
  });
});
