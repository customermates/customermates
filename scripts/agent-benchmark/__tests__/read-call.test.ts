import { describe, expect, it } from "vitest";

import { isReadCall } from "../fixtures";

describe("benchmark read-call predicate", () => {
  it("counts read-only tools, read-only actions and interface tools as reads", () => {
    expect(isReadCall({ name: "list_records", input: { entity: "deal" } })).toBe(true);
    expect(isReadCall({ name: "fetch", input: { id: "x" } })).toBe(true);
    expect(isReadCall({ name: "manage_webhooks", input: { action: "list" } })).toBe(true);
    expect(isReadCall({ name: "load_toolset", input: {} })).toBe(true);
    expect(isReadCall({ name: "navigate", input: { entity: "deal" } })).toBe(true);
    expect(isReadCall({ name: "list_ui_targets", input: {} })).toBe(true);
  });

  it("fails closed on writes, write actions, missing actions and unknown tools", () => {
    expect(isReadCall({ name: "update_deals", input: { deals: [] } })).toBe(false);
    expect(isReadCall({ name: "manage_webhooks", input: { action: "create" } })).toBe(false);
    expect(isReadCall({ name: "manage_webhooks", input: {} })).toBe(false);
    expect(isReadCall({ name: "manage_record_links", input: { action: "add" } })).toBe(false);
    expect(isReadCall({ name: "a_tool_this_build_does_not_define", input: {} })).toBe(false);
  });
});
