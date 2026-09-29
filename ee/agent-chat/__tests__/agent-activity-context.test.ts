import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";

import en from "@/i18n/locales/en.json";
import { AgentActivityContextSchema, agentToolOutputContext } from "../agent-activity-context";
import { AgentActivityDescriptorSchema, agentActivityCopy, describeAgentTool } from "../agent-activity";
import { AgentDurableStreamReader } from "../agent-durable-stream";
import { AgentTurnTranscript, type AgentTranscriptEvent } from "../agent-turn-transcript";
import { internalToolIdentity } from "../tool-identity";

const translate = createTranslator({ locale: "en", messages: en });
const t = (key: string, values?: Record<string, string | number>) =>
  (translate as unknown as (key: string, values?: Record<string, string | number>) => string)(key, values);
const activity = (tool: string, input: unknown) => describeAgentTool(internalToolIdentity(tool), input);

describe("contextual activity labels", () => {
  it("names each Knowledge Base batch in every state and keeps the original mutation count", () => {
    const descriptor = activity("manage_wiki_pages", {
      action: "create",
      pages: ["Company", "Voice and tone", "Products", "Customers", "Operating Guide"].map((title) => ({
        title,
        markdown: "Private source body",
      })),
    });
    const copy = agentActivityCopy(descriptor, t);
    expect(copy.running).toBe("Creating 5 Knowledge Base pages · Company, Voice and tone, Products (+2)");
    for (const state of [copy.done, copy.error, copy.cancelled, copy.approval])
      expect(state).toContain("Company, Voice and tone, Products (+2)");
    expect(JSON.stringify(descriptor)).not.toContain("Private source body");
    expect(AgentActivityDescriptorSchema.parse(JSON.parse(JSON.stringify(descriptor)))).toEqual(descriptor);
  });

  it.each([
    ["create_contacts", { contacts: [{ firstName: "Ada", lastName: "Lovelace" }] }, "Ada Lovelace"],
    ["update_deals", { deals: [{ id: "private-id", name: "CRM rollout" }] }, "CRM rollout"],
    ["manage_wiki_pages", { action: "update", title: "Voice and tone" }, "Voice and tone"],
    ["manage_wiki_pages", { action: "search", query: "sales questions" }, "sales questions"],
    ["manage_routines", { action: "create", name: "Daily follow-up" }, "Daily follow-up"],
    ["manage_widgets", { action: "create", name: "Open pipeline" }, "Open pipeline"],
    ["manage_data_views", { action: "create", name: "My customers" }, "My customers"],
    ["manage_custom_columns", { action: "upsert", label: "Customer tier" }, "Customer tier"],
    ["search_records", { searchTerm: "Acme" }, "Acme"],
    ["web_search", { query: "Acme products" }, "Acme products"],
    ["search_docs", { query: "import contacts" }, "import contacts"],
    [
      "import_website",
      {
        homepage: "https://user:secret@example.com/help?token=private#section",
      },
      "example.com/help",
    ],
  ])("uses known display fields for %s", (tool, input, name) => {
    expect(activity(tool, input).context).toEqual({ labels: [name] });
  });

  it("keeps unavailable names generic and never guesses from identifiers or unrelated payloads", () => {
    for (const tool of ["update_contacts", "manage_wiki_pages", "get_records", "unknown_tool"]) {
      expect(
        activity(tool, {
          action: "delete",
          id: "private-id",
          body: "private body",
        }).context,
      ).toBeUndefined();
    }
    expect(
      describeAgentTool(
        { source: "external-mcp", serverId: "server", name: "create_contacts" },
        {
          contacts: [{ firstName: "Hidden" }],
        },
      ).context,
    ).toBeUndefined();
    expect(agentToolOutputContext("unknown_tool", { title: "Hidden" })).toBeUndefined();
  });

  it("bounds and sanitizes labels without copying credentials, URL queries, bodies or IDs", () => {
    const descriptor = activity("manage_wiki_pages", {
      action: "create",
      pages: [
        {
          title: "  Voice\n and\t tone \u202e",
          id: "private-id",
          markdown: "private-body",
        },
        {
          title: "https://name:private-password@example.com/help?code=private-code#private-fragment",
        },
        { title: "password=private-secret " + "a".repeat(200) },
      ],
    });
    expect(descriptor.context?.labels[0]).toBe("Voice and tone");
    expect(descriptor.context?.labels[1]).toBe("example.com/help");
    expect(descriptor.context?.labels[2]).toHaveLength(80);
    expect(JSON.stringify(descriptor)).not.toMatch(/private-|\u202e/);
    expect(
      AgentActivityContextSchema.safeParse({
        labels: ["Title"],
        body: "Hidden",
      }).success,
    ).toBe(false);
    expect(AgentActivityContextSchema.safeParse({ labels: ["a", "b", "c", "d"] }).success).toBe(false);
    expect(AgentActivityContextSchema.safeParse({ labels: [" "] }).success).toBe(false);
  });

  it("distinguishes listing sources and reviewing them, with title or clean URL fallbacks", () => {
    expect(activity("read_website_source", { action: "list" }).kind).toBe("web.sources");
    expect(activity("read_website_source", { action: "next" }).kind).toBe("web.review");
    expect(
      agentToolOutputContext("read_website_source", {
        items: [
          {
            title: "About us",
            url: "https://example.com/about",
            text: "private body",
            id: "private-id",
          },
          { title: " ", url: "https://example.com/products?token=private" },
        ],
      }),
    ).toEqual({ labels: ["About us", "example.com/products"] });
  });

  it("reads only display names from the actual mixed-record result wrappers", () => {
    expect(
      agentToolOutputContext("get_records", {
        items: [
          { contact: { firstName: "Ada", lastName: "Lovelace", id: "private-id" }, notes: "Private notes" },
          { organization: { name: "Acme" }, notesStatus: "notRequested" },
          { deal: { name: "CRM rollout" } },
          { service: { name: "Consulting" } },
          { task: { name: "Follow up" } },
          { error: "Private failure", contact: { firstName: "Not found" } },
        ],
      }),
    ).toEqual({ labels: ["Ada Lovelace", "Acme", "CRM rollout"], additionalCount: 2 });
  });

  it("persists the same successful source context that the durable stream emits", () => {
    const events: AgentTranscriptEvent[] = [];
    const transcript = new AgentTurnTranscript((event) => events.push(event));
    transcript.beginToolCall({
      toolCallId: "read",
      toolName: "read_website_source",
      activity: activity("read_website_source", { action: "next" }),
    });
    const output = {
      ok: true,
      result: "private body",
      activityContext: { labels: ["About us", "Our services"] },
    };
    transcript.completeToolCall({
      toolCallId: "read",
      toolName: "read_website_source",
      status: "done",
      failed: false,
      output,
    });
    const streamed = new AgentDurableStreamReader().read({
      type: "tool-result",
      toolCallId: "read",
      toolName: "read_website_source",
      output,
    });
    expect(streamed).toEqual(events.at(-1));
    expect(transcript.replyParts[0]).toMatchObject({
      activity: { context: output.activityContext },
      status: "done",
    });
    expect(JSON.stringify([events, transcript.replyParts])).not.toContain("private body");
  });

  it("retains a search query instead of replacing it with results and ignores failed result context", () => {
    const transcript = new AgentTurnTranscript(() => {});
    transcript.beginToolCall({
      toolCallId: "search",
      toolName: "manage_wiki_pages",
      activity: activity("manage_wiki_pages", {
        action: "search",
        query: "Voice",
      }),
    });
    transcript.completeToolCall({
      toolCallId: "search",
      toolName: "manage_wiki_pages",
      status: "done",
      failed: false,
      output: { ok: true, activityContext: { labels: ["Voice and tone"] } },
    });
    expect(transcript.replyParts[0]).toMatchObject({
      activity: { context: { labels: ["Voice"] } },
    });
    const reader = new AgentDurableStreamReader();
    for (const output of [
      { ok: false, activityContext: { labels: ["False success"] } },
      { ok: true, activityContext: { labels: ["a", "b", "c", "d"] } },
    ]) {
      expect(
        reader.read({
          type: "tool-result",
          toolCallId: "read",
          toolName: "read_website_source",
          output,
        })?.payload.context,
      ).toBeUndefined();
    }
  });
});
