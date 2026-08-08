import { describe, expect, it } from "vitest";

import {
  isRememberableAgentTool,
  REMEMBERABLE_AGENT_TOOL_NAMES,
  sanitizePreAuthorizedAgentTools,
} from "../agent-approval";

const EXPECTED_REMEMBERABLE_TOOLS = [
  "create_contacts",
  "update_contacts",
  "create_organizations",
  "update_organizations",
  "create_deals",
  "update_deals",
  "create_services",
  "update_services",
  "create_tasks",
  "update_tasks",
];

describe("agent approval policy", () => {
  it("uses an explicit, reviewable allowlist for ordinary CRM creates and updates", () => {
    expect(REMEMBERABLE_AGENT_TOOL_NAMES).toEqual(EXPECTED_REMEMBERABLE_TOOLS);
    for (const toolName of EXPECTED_REMEMBERABLE_TOOLS) expect(isRememberableAgentTool(toolName)).toBe(true);
  });

  it.each([
    "delete_records",
    "update_record_notes",
    "manage_record_links",
    "send_email",
    "send_chat_message",
    "save_message_draft",
    "discard_message_draft",
    "update_messaging_thread",
    "manage_custom_columns",
    "manage_widgets",
    "update_workspace_settings",
    "manage_team",
    "manage_webhooks",
    "connect_messaging_account",
    "request_support",
    "open_workspace_setup",
    "unknown_future_tool",
  ])("fails closed for non-rememberable action %s", (toolName) => {
    expect(isRememberableAgentTool(toolName)).toBe(false);
  });

  it("drops sensitive, unknown, and duplicate legacy preferences without inventing names", () => {
    expect(
      sanitizePreAuthorizedAgentTools([
        "delete_records",
        "create_contacts",
        "request_support",
        "create_contacts",
        "future_sensitive_action",
        "update_deals",
      ]),
    ).toEqual(["create_contacts", "update_deals"]);
  });
});
