import { describe, expect, it } from "vitest";

import { ALL_VIEW_KEY, SURFACE } from "@/core/data-view/data-view-keys";
import { AGENT_UI_TOOL_NAMES } from "@/ee/agent-chat/agent-ui-command";
import { AGENT_HOSTED_TOOL_ANNOTATIONS } from "@/ee/agent-chat/agent-tools";
import { LOAD_TOOLSET_TOOL_NAME } from "@/ee/agent-chat/agent-toolset-routing";
import { isReadOnlyAgentToolCall } from "@/ee/agent-chat/gated-tools";
import { AGENT_WEB_SEARCH_TOOL_NAME } from "@/ee/agent-chat/agent-web-search";
import { ManageDataViewsSchema } from "@/features/data-view/manage-data-views.schema";
import { ALL_MCP_TOOLS } from "@/features/mcp-tools/tool-registry";

import { analysisReads, isPageSizeRefusal, isReadCall, readsCustomFieldValues, withAnalysisReads, type ObservedTool } from "../fixtures";

describe("benchmark read-call predicate", () => {
  it("counts read-only tools and read-only actions as reads", () => {
    expect(isReadCall({ name: "query_crm_records", input: { typeId: "00000000-0000-4000-8000-0000000000d1" } })).toBe(true);
    expect(isReadCall({ name: "fetch", input: { id: "x" } })).toBe(true);
    expect(isReadCall({ name: "manage_webhooks", input: { action: "list" } })).toBe(true);
    expect(isReadCall({ name: "analyze_records", input: { reads: [], code: "() => 1" } })).toBe(true);
  });

  it("counts exactly the surfaces, config and list actions of the saved-view tool as reads", () => {
    const actions = ManageDataViewsSchema.options.map((option) => option.shape.action.value);
    const call = (action: string) => ({ name: "manage_data_views", input: { action, surfaceKey: SURFACE.contacts, viewKey: ALL_VIEW_KEY } });
    expect(actions.filter((action) => isReadCall(call(action)))).toEqual(["surfaces", "config", "list"]);
    expect(actions.filter((action) => !isReadCall(call(action)))).toEqual(["create", "update", "reset", "select", "delete"]);
    expect(isReadCall({ name: "manage_data_views", input: { surfaceKey: SURFACE.contacts } })).toBe(false);
    expect(isReadCall({ name: "manage_data_views", input: { action: "rename", surfaceKey: SURFACE.contacts } })).toBe(false);
  });

  it("counts every interface call and load_toolset as a read, whatever it opens or targets", () => {
    expect(AGENT_UI_TOOL_NAMES).toEqual(["list_ui_targets", "navigate", "highlight_element", "start_tour"]);
    const calls = [
      { name: "list_ui_targets", input: { query: "contacts saved views" } },
      { name: "navigate", input: { targetId: "nav-search" } },
      { name: "navigate", input: { entity: "deal", recordId: "00000000-0000-4000-8000-000000000001" } },
      { name: "highlight_element", input: { targetId: "dashboard-add-widget" } },
      { name: "start_tour", input: { steps: [{ targetId: "nav-search", note: "Search here" }, { targetId: "dashboard-add-widget", note: "Add here" }] } },
      { name: "load_toolset", input: { toolset: "views" } },
    ];
    expect(calls.filter((tool) => !isReadCall(tool))).toEqual([]);
  });

  it("counts only the read actions of the mixed social tools as reads", () => {
    expect(["list", "invite", "accept", "cancel"].filter((action) => isReadCall({ name: "manage_social_relations", input: { action } }))).toEqual(["list"]);
    expect(["list", "browse", "save"].filter((action) => isReadCall({ name: "linkedin_manage_sales_lists", input: { action } }))).toEqual(["list", "browse"]);
  });

  it("classifies every tool and action exactly as the runtime does, apart from the interface panel tools it never executes", () => {
    const actions = ["list", "get", "search", "runs", "surfaces", "config", "browse", "list_deliveries", "create", "update", "delete", "invite", "save", "select", "rename"];
    const names = [
      ...ALL_MCP_TOOLS.map((tool) => tool.name),
      ...Object.keys(AGENT_HOSTED_TOOL_ANNOTATIONS),
      AGENT_WEB_SEARCH_TOOL_NAME,
      LOAD_TOOLSET_TOOL_NAME,
      "list_ui_targets",
      "a_tool_this_build_does_not_define",
    ];
    const annotations = (name: string) => AGENT_HOSTED_TOOL_ANNOTATIONS[name] ?? ALL_MCP_TOOLS.find((tool) => tool.name === name)?.annotations;
    const mismatches = names.flatMap((name) =>
      [undefined, {}, ...actions.map((action) => ({ action }))].flatMap((input) =>
        isReadCall({ name, input }) === isReadOnlyAgentToolCall(name, { annotations: annotations(name) }, input) ? [] : [`${name} ${JSON.stringify(input)}`],
      ),
    );
    expect(mismatches).toEqual([]);
    expect(isReadCall({ name: AGENT_WEB_SEARCH_TOOL_NAME, input: { query: "news" } })).toBe(true);
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
      input: { reads: [{ tool: "query_crm_records", input: '{"typeId":"00000000-0000-4000-8000-0000000000d1"}' }, { tool: "get_activities", input: "{}" }], code: "(data) => data" },
      outcome: "error" as const,
    };
    const write = { name: "update_deals", input: { deals: [] }, outcome: "ok" as const };
    expect(analysisReads(analysis)).toEqual([
      { name: "query_crm_records", input: { typeId: "00000000-0000-4000-8000-0000000000d1" }, outcome: "error", viaAnalysis: true },
      { name: "get_activities", input: {}, outcome: "error", viaAnalysis: true },
    ]);
    expect(withAnalysisReads([analysis, write]).map((tool) => tool.name)).toEqual(["analyze_records", "query_crm_records", "get_activities", "update_deals"]);
    expect(withAnalysisReads([analysis, write]).filter((tool) => !isReadCall(tool))).toEqual([write]);
  });

  it("marks only the reads it derives from analyze_records, never a call the model made itself", () => {
    const analysis = { name: "analyze_records", input: { reads: [{ tool: "query_crm_records", input: { typeId: "00000000-0000-4000-8000-0000000000d1" } }], code: "(data) => data" }, outcome: "ok" as const };
    const direct = { name: "query_crm_records", input: { typeId: "00000000-0000-4000-8000-0000000000d1" }, outcome: "ok" as const };
    expect(withAnalysisReads([analysis, direct]).map((tool) => [tool.name, "viaAnalysis" in tool])).toEqual([
      ["analyze_records", false],
      ["query_crm_records", true],
      ["query_crm_records", false],
    ]);
  });

  it("reads an analyze_records input given as an object the same as one given as a JSON string", () => {
    const asObject = { name: "analyze_records", input: { reads: [{ tool: "query_crm_records", input: { typeId: "00000000-0000-4000-8000-0000000000d1" } }, { tool: "get_activities" }], code: "(data) => data" }, outcome: "ok" as const };
    const asString = { ...asObject, input: { ...asObject.input, reads: [{ tool: "query_crm_records", input: '{"typeId":"00000000-0000-4000-8000-0000000000d1"}' }, { tool: "get_activities" }] } };
    expect(analysisReads(asObject)).toEqual([
      { name: "query_crm_records", input: { typeId: "00000000-0000-4000-8000-0000000000d1" }, outcome: "ok", viaAnalysis: true },
      { name: "get_activities", input: {}, outcome: "ok", viaAnalysis: true },
    ]);
    expect(analysisReads(asString)).toEqual(analysisReads(asObject));
  });

  it("adds nothing for a write named inside analyze_records or for any other tool", () => {
    const smuggled = { name: "analyze_records", input: { reads: [{ tool: "update_deals", input: '{"deals":[]}' }], code: "(data) => data" }, outcome: "error" as const };
    expect(analysisReads(smuggled)).toEqual([]);
    expect(analysisReads({ name: "list_records", input: { reads: [{ tool: "list_records", input: "{}" }] } })).toEqual([]);
  });

  it("takes a list read as reading custom-field values only when it succeeded ungrouped with rows that carry them", () => {
    const analyze = (input: object, outcome?: "ok" | "error") => analysisReads({ name: "analyze_records", input: { reads: [{ tool: "list_records", input }], code: "(data) => data" }, outcome });
    const reads = (entity: "task" | "deal", tools: ObservedTool[]) => tools.map((tool) => readsCustomFieldValues(tool, entity));

    expect(reads("task", [
      ...analyze({ entity: "task" }, "ok"),
      ...analyze({ entity: "task", include: ["customFields"] }, "ok"),
      { name: "list_records", input: { entity: "task", include: ["customFields"] }, outcome: "ok" },
      { name: "list_records", input: { entity: "task", include: ["links", "customFields"], pageSize: 5 }, outcome: "ok" },
    ])).toEqual([true, true, true, true]);
    expect(reads("task", [
      ...analyze({ entity: "task" }, "error"),
      ...analyze({ entity: "task" }),
      ...analyze({ entity: "task", groupBy: { field: "userIds" } }, "ok"),
      ...analyze({ entity: "task", include: [] }, "ok"),
      ...analyze({ entity: "task", include: ["owners", "links", "dates"] }, "ok"),
      { name: "list_records", input: { entity: "task" }, outcome: "ok" },
      { name: "list_records", input: { entity: "task", include: ["customFields"] }, outcome: "error" },
      { name: "list_records", input: { entity: "task", include: ["customFields"] } },
      { name: "list_records", input: { entity: "task", include: ["customFields"], groupBy: { field: "userIds" } }, outcome: "ok" },
      { name: "get_records", input: { entity: "task", include: ["customFields"] }, outcome: "ok" },
      ...analyze({ entity: "deal" }, "ok"),
    ])).toEqual(Array(11).fill(false));
    expect(reads("deal", [
      ...analyze({ entity: "deal" }, "ok"),
      ...analyze({ entity: "deal", include: ["customFields"] }, "ok"),
      { name: "list_records", input: { entity: "deal", include: ["customFields"] }, outcome: "ok" },
    ])).toEqual([true, true, true]);
    expect(reads("deal", [
      ...analyze({ entity: "deal" }, "error"),
      ...analyze({ entity: "deal" }),
      ...analyze({ entity: "deal", groupBy: { field: "userIds" } }, "ok"),
      { name: "list_records", input: { entity: "deal" }, outcome: "ok" },
    ])).toEqual([false, false, false, false]);
  });

  it("counts a failed call as a page-size refusal only when it asked for a size that is not a whole number from 1 to 100", () => {
    const call = (pageSize: unknown, outcome?: "ok" | "error") => ({ name: "list_records", input: { entity: "deal", pageSize }, outcome });
    expect([call(150, "error"), call(0, "error"), call(12.5, "error"), call(150)].map(isPageSizeRefusal)).toEqual([true, true, true, true]);
    expect([call(50, "error"), call(50), call(1, "error"), call(100, "error"), call(150, "ok"), call(undefined, "error")].map(isPageSizeRefusal)).toEqual([false, false, false, false, false, false]);
  });
});
