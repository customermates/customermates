import { describe, expect, it } from "vitest";

import { MCP_TOOL_GROUPS } from "@/features/mcp-tools/tool-registry";

import {
  AGENT_CORE_TOOLSETS,
  AGENT_ON_DEMAND_TOOLSETS,
  AGENT_TOOLSET_SUMMARY,
  activeAgentToolNames,
  toolsetIndexSentence,
  toolsetsForRequest,
  toolsetsFromActivities,
  toolsetsUsedInMessages,
} from "../agent-toolset-routing";
import { coreToolNames, onDemandToolsetOfTool, toolNamesOfToolset } from "../agent-toolsets";

const TOOLS = [
  { name: "list_records", toolset: null },
  { name: "search_docs", toolset: null },
  { name: "load_toolset", toolset: null },
  { name: "get_messaging_threads", toolset: "messaging" },
  { name: "send_email", toolset: "messaging" },
  { name: "manage_webhooks", toolset: "webhooks" },
  { name: "manage_routines", toolset: "routines" },
  { name: "manage_team", toolset: "admin" },
  { name: "get_social_posts", toolset: "social" },
];

describe("toolset partition", () => {
  it("covers every registry group exactly once between core and on-demand sets", () => {
    const partitioned = [...AGENT_CORE_TOOLSETS, ...AGENT_ON_DEMAND_TOOLSETS].toSorted();
    expect(partitioned).toEqual(Object.keys(MCP_TOOL_GROUPS).toSorted());
    expect(new Set(partitioned).size).toBe(partitioned.length);
  });

  it("maps every on-demand tool to its set and every core tool to none", () => {
    for (const toolset of AGENT_ON_DEMAND_TOOLSETS)
      for (const name of toolNamesOfToolset(toolset)) expect(onDemandToolsetOfTool(name)).toBe(toolset);
    for (const name of coreToolNames()) expect(onDemandToolsetOfTool(name)).toBeNull();
    expect(coreToolNames().size).toBe(25);
    expect(coreToolNames().has("get_activities")).toBe(true);
    expect(coreToolNames().has("manage_data_views")).toBe(true);
  });
});

describe("toolsetsForRequest", () => {
  it("routes by user vocabulary in English and German", () => {
    expect([...toolsetsForRequest({ text: "Reply to the email from ACME", pageRoute: null })]).toEqual(["messaging"]);
    expect([...toolsetsForRequest({ text: "Erstelle eine Routine, die jeden Morgen läuft", pageRoute: null })]).toEqual(
      ["routines"],
    );
    expect([...toolsetsForRequest({ text: "Add a KPI chart to my dashboard", pageRoute: null })]).toEqual(["widgets"]);
    expect([...toolsetsForRequest({ text: "Lade Anna als Teammitglied ein", pageRoute: null })]).toEqual(["admin"]);
  });

  it("routes by the current page and strips the locale prefix", () => {
    expect([...toolsetsForRequest({ text: "What is this?", pageRoute: "/de/company/webhooks" })]).toEqual([
      "webhooks",
      "admin",
    ]);
    expect([...toolsetsForRequest({ text: "Summarize this", pageRoute: "/en/inbox" })]).toEqual(["messaging"]);
  });

  it("keeps a plain records question on the core set", () => {
    expect(toolsetsForRequest({ text: "How many open deals do we have?", pageRoute: "/en/deals" }).size).toBe(0);
  });
});

describe("toolsetsFromActivities", () => {
  it("re-enables the sets a conversation already used", () => {
    const toolsets = toolsetsFromActivities([
      { kind: "messages.read" },
      { kind: "workspace.terminology" },
      { kind: "records.read" },
      { kind: "generic", consequence: { action: "salesList.save" } },
    ]);
    expect([...toolsets].toSorted()).toEqual(["admin", "messaging", "social"]);
  });
});

describe("activeAgentToolNames", () => {
  it("starts from the core set plus the requested sets", () => {
    expect(activeAgentToolNames({ tools: TOOLS, initialToolsets: [], messages: [] })).toEqual([
      "list_records",
      "search_docs",
      "load_toolset",
    ]);
    expect(activeAgentToolNames({ tools: TOOLS, initialToolsets: ["webhooks"], messages: [] })).toContain(
      "manage_webhooks",
    );
  });

  it("adds a set once load_toolset was called or one of its tools was used earlier in the turn", () => {
    const messages = [
      {
        role: "assistant",
        content: [{ type: "tool-call", toolName: "load_toolset", input: { toolset: "messaging" } }],
      },
      { role: "assistant", content: [{ type: "tool-call", toolName: "manage_routines", input: { action: "list" } }] },
    ];
    const active = activeAgentToolNames({ tools: TOOLS, initialToolsets: [], messages });
    expect(active).toContain("send_email");
    expect(active).toContain("manage_routines");
    expect(active).not.toContain("manage_team");
    expect(active).not.toContain("get_social_posts");
  });

  it("drops the loader from the list once every set is loaded", () => {
    const active = activeAgentToolNames({
      tools: TOOLS,
      initialToolsets: [...AGENT_ON_DEMAND_TOOLSETS],
      messages: [],
    });
    expect(active).not.toContain("load_toolset");
    expect(activeAgentToolNames({ tools: TOOLS, initialToolsets: ["messaging"], messages: [] })).toContain(
      "load_toolset",
    );
  });

  it("ignores malformed tool calls and unknown sets", () => {
    const messages = [
      {
        role: "assistant",
        content: [{ type: "tool-call", toolName: "load_toolset", input: { toolset: "spaceships" } }],
      },
      { role: "assistant", content: "plain text" },
      { role: "user", content: [{ type: "text", text: "hi" }] },
    ];
    expect(toolsetsUsedInMessages(messages, () => null).size).toBe(0);
  });
});

describe("toolsetIndexSentence", () => {
  it("names every on-demand set and the loader", () => {
    const sentence = toolsetIndexSentence();
    for (const toolset of AGENT_ON_DEMAND_TOOLSETS) expect(sentence).toContain(toolset);
    expect(sentence).toContain("load_toolset");
  });

  it("separates the sets already loaded from the ones still loadable", () => {
    const sentence = toolsetIndexSentence(["messaging"]);
    expect(sentence).toContain("Already loaded for this turn: messaging.");
    expect(sentence).toContain("not loaded yet");
    expect(sentence).toContain("never for a set that is already loaded");
    expect(sentence).not.toContain(`messaging (${AGENT_TOOLSET_SUMMARY.messaging})`);
  });

  it("stops offering the loader once every set is loaded", () => {
    const sentence = toolsetIndexSentence([...AGENT_ON_DEMAND_TOOLSETS]);
    expect(sentence).toContain("nothing left to load");
    expect(sentence).not.toContain("load_toolset");
  });
});
