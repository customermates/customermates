import { describe, expect, it } from "vitest";

import {
  isOutboundOrSupportAction,
  isOutboundSupportOrDraftAction,
  isReadOnlyMixedToolAction,
} from "../tool-safety";

describe("benchmark outbound-action safety policy", () => {
  it.each([
    "send_email",
    "send_chat_message",
    "request_support",
    "connect_messaging_account",
  ])("classifies %s as outbound", (name) => {
    expect(isOutboundOrSupportAction({ name })).toBe(true);
  });

  it("blocks only the write action of the mixed Sales Navigator tool", () => {
    expect(isOutboundOrSupportAction({ name: "linkedin_manage_sales_lists", input: { action: "save" } })).toBe(true);
    expect(isOutboundOrSupportAction({ name: "linkedin_manage_sales_lists", input: { action: "list" } })).toBe(false);
    expect(isOutboundOrSupportAction({ name: "linkedin_manage_sales_lists", input: { action: "browse" } })).toBe(false);
    expect(isReadOnlyMixedToolAction({ name: "linkedin_manage_sales_lists", input: { action: "list" } })).toBe(true);
    expect(isReadOnlyMixedToolAction({ name: "linkedin_manage_sales_lists", input: { action: "browse" } })).toBe(true);
    expect(isReadOnlyMixedToolAction({ name: "linkedin_manage_sales_lists", input: { action: "save" } })).toBe(false);
  });

  it("blocks only the mutating actions of the mixed social-relations tool", () => {
    expect(isOutboundOrSupportAction({ name: "manage_social_relations", input: { action: "list" } })).toBe(false);
    expect(isReadOnlyMixedToolAction({ name: "manage_social_relations", input: { action: "list" } })).toBe(true);
    for (const action of ["invite", "accept", "cancel"]) {
      expect(isOutboundOrSupportAction({ name: "manage_social_relations", input: { action } })).toBe(true);
      expect(isReadOnlyMixedToolAction({ name: "manage_social_relations", input: { action } })).toBe(false);
    }
  });

  it("keeps internal drafts out of the global outbound gate", () => {
    const tool = { name: "save_message_draft" };
    expect(isOutboundOrSupportAction(tool)).toBe(false);
    expect(isOutboundSupportOrDraftAction(tool)).toBe(true);
  });

  it("allows unrelated read tools", () => {
    expect(isOutboundOrSupportAction({ name: "list_records", input: { entity: "contact" } })).toBe(false);
  });

  it("does not match near-collision read tool names", () => {
    expect(isOutboundOrSupportAction({ name: "request_support_status" })).toBe(false);
    expect(isOutboundSupportOrDraftAction({ name: "save_message_draft_preview" })).toBe(false);
  });
});
