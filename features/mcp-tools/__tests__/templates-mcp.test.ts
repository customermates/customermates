import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Capability } from "@/core/capabilities/capabilities";

const state = vi.hoisted(() => ({
  shipped: new Set<string>(),
  locale: "de",
  appMode: "cloud",
}));

vi.mock("@/env", () => ({
  env: {
    BASE_URL: "https://app.example.test",
    get APP_MODE() {
      return state.appMode;
    },
  },
}));
vi.mock("@/core/capabilities/capabilities", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  SHIPPED_CAPABILITIES: state.shipped,
}));
vi.mock("@/core/di", () => ({
  getUserService: () => ({
    getActiveTenantUserOrThrow: () => Promise.resolve({ displayLanguage: state.locale }),
  }),
}));

import { TEMPLATE_SLUGS } from "@/core/templates/template-slugs";
import { registerTemplateMcpFeatures } from "@/features/mcp-tools/templates.mcp-resources";
import { MCP_SETUP_FROM_TEMPLATE_PROMPT_INFO } from "@/features/mcp-tools/server-metadata";
import type { McpTool } from "@/features/mcp-tools/mcp-tool";

const ALL: Capability[] = ["forms", "rules", "calendarWrite", "notifications", "incomingWebhooks"];
const NAMED_TOOLS = [{ name: "get_workspace_context" }, { name: "discover_record_types" }] as unknown as McpTool[];

async function connect(tools: McpTool[] = NAMED_TOOLS) {
  const server = new McpServer({ name: "test", version: "1" });
  registerTemplateMcpFeatures(server, tools);
  const client = new Client({ name: "client", version: "1" });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return { client, close: () => Promise.all([client.close(), server.close()]) };
}

beforeEach(() => {
  state.shipped.clear();
  state.locale = "de";
  state.appMode = "cloud";
});

describe("template MCP prompt and resources", () => {
  let closers: Array<() => Promise<unknown>> = [];
  afterEach(async () => {
    await Promise.all(closers.map((close) => close()));
    closers = [];
  });

  async function open(tools?: McpTool[]) {
    const connection = await connect(tools);
    closers.push(connection.close);
    return connection.client;
  }

  it("offers nothing while no capability has shipped", async () => {
    const client = await open();
    expect((await client.listResources()).resources).toEqual([]);
    await expect(
      client.getPrompt({ name: MCP_SETUP_FROM_TEMPLATE_PROMPT_INFO.name, arguments: { template: "client-tracker" } }),
    ).rejects.toThrow(/not available/);
    await expect(client.readResource({ uri: "templates://client-tracker" })).rejects.toThrow(/not available/);
  });

  it("lists every offered template with its name in the workspace language", async () => {
    ALL.forEach((capability) => state.shipped.add(capability));
    const client = await open();
    const listed = (await client.listResources()).resources;
    expect(listed.map((resource) => resource.uri).sort()).toEqual(TEMPLATE_SLUGS.map((slug) => `templates://${slug}`).sort());
    expect(listed.find((resource) => resource.uri === "templates://client-tracker")?.title).toBe("Kundenverwaltung");
    const templates = (await client.listResourceTemplates()).resourceTemplates;
    expect(templates.map((template) => template.uriTemplate)).toContain("templates://{slug}");
  });

  it("reads the spec, the text, the compiled plan and the rules of one template", async () => {
    ALL.forEach((capability) => state.shipped.add(capability));
    const client = await open();
    const read = await client.readResource({ uri: "templates://client-tracker" });
    const content = JSON.parse(String(read.contents[0].text)) as {
      slug: string;
      locale: string;
      spec: { slug: string };
      text: { locale: string };
      plan: { version: number; recordModel: { lists: Array<{ key: string }> } };
      extras: { rules: Array<{ key: string }> };
    };
    expect(read.contents[0].mimeType).toBe("application/json");
    expect(content.slug).toBe("client-tracker");
    expect(content.locale).toBe("de");
    expect(content.spec.slug).toBe("client-tracker");
    expect(content.plan.recordModel.lists.map((list) => list.key)).toContain("clients");
    expect(content.extras.rules.length).toBeGreaterThan(0);
  });

  it("falls back to English for an unknown display language", async () => {
    ALL.forEach((capability) => state.shipped.add(capability));
    state.locale = "system";
    const client = await open();
    const read = await client.readResource({ uri: "templates://client-tracker" });
    expect(JSON.parse(String(read.contents[0].text)).locale).toBe("en");
  });

  it("serves the prompt of a template without asking for a new workspace", async () => {
    ALL.forEach((capability) => state.shipped.add(capability));
    const client = await open();
    const prompt = await client.getPrompt({
      name: MCP_SETUP_FROM_TEMPLATE_PROMPT_INFO.name,
      arguments: { template: "Client-Tracker" },
    });
    const text = String((prompt.messages[0].content as { text: string }).text);
    expect(prompt.messages[0].role).toBe("user");
    expect(text).toContain("# Kundenverwaltung");
    expect(text).toContain("get_workspace_context");
    expect(text).toContain("already connected");
    expect(text).not.toContain("/signup");
    expect(text).toContain("Create no sample");
    expect(text).toContain("Send nothing");
  });

  it("refuses an unknown template and one the deployment cannot run", async () => {
    state.shipped.add("forms");
    const client = await open();
    await expect(
      client.getPrompt({ name: MCP_SETUP_FROM_TEMPLATE_PROMPT_INFO.name, arguments: { template: "nope" } }),
    ).rejects.toThrow(/not available/);
    await expect(client.readResource({ uri: "templates://real-estate-pipeline" })).rejects.toThrow(/not available/);
  });

  it("does not offer a cloud-only template to a self-hosted deployment", async () => {
    ALL.forEach((capability) => state.shipped.add(capability));
    state.appMode = "self-hosted";
    const client = await open();
    const slugs = (await client.listResources()).resources.map((resource) => resource.uri);
    expect(slugs).not.toContain("templates://booking-page");
  });

  it("completes the template argument over the offered slugs", async () => {
    ALL.forEach((capability) => state.shipped.add(capability));
    const client = await open();
    const completed = await client.complete({
      ref: { type: "ref/prompt", name: MCP_SETUP_FROM_TEMPLATE_PROMPT_INFO.name },
      argument: { name: "template", value: "cl" },
    });
    expect(completed.completion.values).toContain("client-tracker");
    expect(completed.completion.values.every((value) => value.startsWith("cl"))).toBe(true);
    const resource = await client.complete({
      ref: { type: "ref/resource", uri: "templates://{slug}" },
      argument: { name: "slug", value: "sales" },
    });
    expect(resource.completion.values).toContain("sales-pipeline");
  });

  it("registers nothing when the workspace tools are not active", async () => {
    ALL.forEach((capability) => state.shipped.add(capability));
    const server = new McpServer({ name: "test", version: "1" });
    registerTemplateMcpFeatures(server, [{ name: "search" }] as unknown as McpTool[]);
    const client = new Client({ name: "client", version: "1" });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
    closers.push(() => Promise.all([client.close(), server.close()]));
    expect(client.getServerCapabilities()?.prompts).toBeUndefined();
    expect(client.getServerCapabilities()?.resources).toBeUndefined();
  });
});
