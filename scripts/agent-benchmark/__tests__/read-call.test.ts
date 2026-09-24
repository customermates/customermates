import { describe, expect, it } from "vitest";

import { analysisReads, isReadCall, withAnalysisReads } from "../fixtures";

describe("benchmark read-call predicate", () => {
  it("counts read-only tools, read-only actions and interface tools as reads", () => {
    expect(isReadCall({ name: "list_records", input: { entity: "deal" } })).toBe(true);
    expect(isReadCall({ name: "fetch", input: { id: "x" } })).toBe(true);
    expect(isReadCall({ name: "manage_webhooks", input: { action: "list" } })).toBe(true);
    expect(isReadCall({ name: "load_toolset", input: {} })).toBe(true);
    expect(isReadCall({ name: "navigate", input: { entity: "deal" } })).toBe(true);
    expect(isReadCall({ name: "list_ui_targets", input: {} })).toBe(true);
    expect(isReadCall({ name: "analyze_records", input: { reads: [], code: "() => 1" } })).toBe(true);
  });

  it("fails closed on writes, write actions, missing actions and unknown tools", () => {
    expect(isReadCall({ name: "update_deals", input: { deals: [] } })).toBe(false);
    expect(isReadCall({ name: "manage_webhooks", input: { action: "create" } })).toBe(false);
    expect(isReadCall({ name: "manage_webhooks", input: {} })).toBe(false);
    expect(isReadCall({ name: "manage_record_links", input: { action: "add" } })).toBe(false);
    expect(isReadCall({ name: "a_tool_this_build_does_not_define", input: {} })).toBe(false);
  });

  it("adds one read per analyze_records read after its call, with the call's outcome", () => {
    const analysis = {
      name: "analyze_records",
      input: { reads: [{ tool: "list_records", input: '{"entity":"deal"}' }, { tool: "get_activities", input: "{}" }], code: "(data) => data" },
      outcome: "error" as const,
    };
    const write = { name: "update_deals", input: { deals: [] }, outcome: "ok" as const };
    expect(analysisReads(analysis)).toEqual([
      { name: "list_records", input: { entity: "deal" }, outcome: "error", viaAnalysis: true },
      { name: "get_activities", input: {}, outcome: "error", viaAnalysis: true },
    ]);
    expect(withAnalysisReads([analysis, write]).map((tool) => tool.name)).toEqual(["analyze_records", "list_records", "get_activities", "update_deals"]);
    expect(withAnalysisReads([analysis, write]).filter((tool) => !isReadCall(tool))).toEqual([write]);
  });

  it("marks only the reads it derives from analyze_records, never a call the model made itself", () => {
    const analysis = { name: "analyze_records", input: { reads: [{ tool: "list_records", input: { entity: "task" } }], code: "(data) => data" }, outcome: "ok" as const };
    const direct = { name: "list_records", input: { entity: "task" }, outcome: "ok" as const };
    expect(withAnalysisReads([analysis, direct]).map((tool) => [tool.name, "viaAnalysis" in tool])).toEqual([
      ["analyze_records", false],
      ["list_records", true],
      ["list_records", false],
    ]);
  });

  it("reads an analyze_records input given as an object the same as one given as a JSON string", () => {
    const asObject = { name: "analyze_records", input: { reads: [{ tool: "list_records", input: { entity: "deal" } }, { tool: "get_activities" }], code: "(data) => data" }, outcome: "ok" as const };
    const asString = { ...asObject, input: { ...asObject.input, reads: [{ tool: "list_records", input: '{"entity":"deal"}' }, { tool: "get_activities" }] } };
    expect(analysisReads(asObject)).toEqual([
      { name: "list_records", input: { entity: "deal" }, outcome: "ok", viaAnalysis: true },
      { name: "get_activities", input: {}, outcome: "ok", viaAnalysis: true },
    ]);
    expect(analysisReads(asString)).toEqual(analysisReads(asObject));
  });

  it("adds nothing for a write named inside analyze_records or for any other tool", () => {
    const smuggled = { name: "analyze_records", input: { reads: [{ tool: "update_deals", input: '{"deals":[]}' }], code: "(data) => data" }, outcome: "error" as const };
    expect(analysisReads(smuggled)).toEqual([]);
    expect(analysisReads({ name: "list_records", input: { reads: [{ tool: "list_records", input: "{}" }] } })).toEqual([]);
  });
});
