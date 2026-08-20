import { describe, expect, it } from "vitest";

import {
  isPendingAgentApprovalToolName,
  parsePendingAgentApprovalToolName,
  pendingAgentApprovalToolName,
} from "../agent-approval";

const EXPIRES_AT = new Date("2026-08-12T10:00:00.000Z");

describe("pending agent approval tokens", () => {
  it("round-trips a tool name and its expiry", () => {
    const token = pendingAgentApprovalToolName("create_contacts", EXPIRES_AT);

    expect(isPendingAgentApprovalToolName(token)).toBe(true);
    expect(parsePendingAgentApprovalToolName(token)).toEqual({
      expiresAt: EXPIRES_AT,
      toolName: "create_contacts",
    });
  });

  it.each([
    "create contacts",
    "create-contacts",
    "Create_Contacts",
    "create_contacts;drop",
    "__agent_pending__:1:create_contacts",
    "",
    "a".repeat(65),
  ])("refuses to mint a token for the unsafe tool name %j", (toolName) => {
    expect(() => pendingAgentApprovalToolName(toolName, EXPIRES_AT)).toThrow();
  });

  it.each([
    "create_contacts",
    "__agent_pending__:create_contacts",
    "__agent_pending__:1:CREATE",
    "__agent_pending__::create_contacts",
    "__agent_pending__:99999999999999999999:create_contacts",
  ])("parses %j as no pending approval rather than guessing", (value) => {
    expect(parsePendingAgentApprovalToolName(value)).toBeNull();
  });

  it("recognises the pending prefix without trusting the rest of the value", () => {
    expect(isPendingAgentApprovalToolName("__agent_pending__:nonsense")).toBe(true);
    expect(parsePendingAgentApprovalToolName("__agent_pending__:nonsense")).toBeNull();
    expect(isPendingAgentApprovalToolName("create_contacts")).toBe(false);
  });
});
