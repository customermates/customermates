import { describe, expect, it } from "vitest";

import {
  AGENT_PANEL_TOOL_NAMES,
  AGENT_UI_TOOL_NAMES,
  agentUiCommandHookToken,
  isAgentPanelTool,
  toAgentUiCommandInput,
} from "../agent-ui-command";

describe("agent interface commands", () => {
  it("classifies every interface tool as either panel-dependent or server-side", () => {
    const serverSide = AGENT_UI_TOOL_NAMES.filter((name) => !isAgentPanelTool(name));
    expect(serverSide).toEqual(["list_ui_targets"]);
    expect([...AGENT_PANEL_TOOL_NAMES].every((name) => AGENT_UI_TOOL_NAMES.includes(name))).toBe(true);
  });

  it("keeps list_ui_targets off the panel, because it answers without a browser", () => {
    expect(isAgentPanelTool("list_ui_targets")).toBe(false);
    expect(toAgentUiCommandInput("list_ui_targets", { query: "deals" })).toBeNull();
  });

  it("sends only the target id for the tools that act on one control", () => {
    for (const name of ["navigate", "highlight_element", "click_ui_target"]) {
      expect(toAgentUiCommandInput(name, { targetId: "nav-deals", extra: "dropped" })).toEqual({
        targetId: "nav-deals",
      });
    }
  });

  it("sends the composed steps for a tour", () => {
    expect(toAgentUiCommandInput("start_tour", { steps: [{ targetId: "nav-deals", note: "here" }] })).toEqual({
      steps: [{ targetId: "nav-deals", note: "here" }],
    });
  });

  it("passes a record request through whole, because the panel needs every field", () => {
    expect(toAgentUiCommandInput("open_record", { entity: "contact", recordId: "new", view: "drawer" })).toEqual({
      entity: "contact",
      recordId: "new",
      view: "drawer",
    });
  });

  it("refuses to build a command for a tool it does not know", () => {
    expect(toAgentUiCommandInput("delete_records", { ids: ["x"] })).toBeNull();
  });

  it("survives a malformed input rather than throwing at the model", () => {
    expect(toAgentUiCommandInput("navigate", undefined)).toEqual({ targetId: undefined });
    expect(toAgentUiCommandInput("navigate", "not-an-object")).toEqual({ targetId: undefined });
  });

  it("keys the resume hook by conversation, so one active run owns the token", () => {
    expect(agentUiCommandHookToken("conv-1")).toBe("agent-ui-command:conv-1");
    expect(agentUiCommandHookToken("conv-1")).not.toBe(agentUiCommandHookToken("conv-2"));
  });
});
