import { decode } from "@toon-format/toon";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError } from "@/core/errors/app-errors";
import { createMockUser } from "@/tests/helpers/mock-user";
import { createMockDiModule, MOCK_ENV_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();
const calls = vi.hoisted(() => ({
  get: vi.fn(),
  create: vi.fn(),
  fetch: vi.fn(),
  catalog: vi.fn(),
  roles: vi.fn(),
  accounts: vi.fn(),
}));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/core/di", () => ({
  ...createMockDiModule(() => mockUser),
  getGetWikiPageInteractor: () => ({ invoke: calls.get }),
  getCreateWikiPagesInteractor: () => ({ invoke: calls.create }),
  getGetWikiCatalogInteractor: () => ({ invoke: calls.catalog }),
  getGetUserDetailsInteractor: () => ({ invoke: () => Promise.resolve({ ok: true, data: { id: "user" } }) }),
  getGetCompanySettingsInteractor: () => ({
    invoke: () => Promise.resolve({ ok: true, data: { id: "company", terminology: { labels: {} } } }),
  }),
  getGetRolesApiInteractor: () => ({ invoke: calls.roles }),
  getGetMyConnectedAccountsApiInteractor: () => ({ invoke: calls.accounts }),
}));
vi.mock("@/features/mcp-tools/tool-registry", async () => {
  const { z } = await import("zod");
  const { manageWikiPagesTool } = await import("@/features/mcp-tools/wiki.mcp-tools");
  const { getWorkspaceContextTool } = await import("@/features/mcp-tools/workspace.mcp-tools");
  return {
    ALL_MCP_TOOLS: [
      manageWikiPagesTool,
      getWorkspaceContextTool,
      {
        name: "fetch",
        description: "Read one complete source document.",
        inputSchema: z.object({ id: z.string() }),
        annotations: { readOnlyHint: true, destructiveHint: false },
        execute: calls.fetch,
      },
    ],
    MCP_TOOL_GROUPS: {},
  };
});
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve({ raw: (key: string) => key }),
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), setTag: vi.fn(), setUser: vi.fn() }));

import {
  describeAgentAiTools,
  getAgentAiToolDefinitions,
  getAgentAiTools,
  normalizeAgentAiToolInput,
  type AgentToolDeps,
} from "@/ee/agent-chat/agent-tools";

const PAGE_ID = "00000000-0000-4000-8000-000000000001";
const page = {
  id: PAGE_ID,
  title: "Voice",
  markdown: "",
  createdAt: new Date("2026-09-01T12:00:00Z"),
  updatedAt: new Date("2026-09-13T12:00:00Z"),
};
const catalog = {
  items: [{ ...page, markdown: undefined, excerpt: "Current catalog guidance", url: `/wiki?page=${PAGE_ID}` }],
  agentsMd: null,
  total: 1,
  page: 1,
  nextPage: null,
  truncated: false,
};

function dependencies(): AgentToolDeps {
  return {
    runUiCommand: vi.fn().mockResolvedValue({ ok: true, result: "UI" }),
    requestApproval: vi.fn().mockResolvedValue("approve"),
    resolveApprovalContext: vi.fn().mockImplementation((_toolName, input) => Promise.resolve({ ok: true, input })),
    createSupportTicket: vi.fn().mockResolvedValue({ ok: true, result: "Support" }),
    runExactlyOnce: vi.fn().mockImplementation((_id, _name, run) => run()),
    runInCallerContext: vi.fn().mockImplementation((run) => run()),
    resultMaxChars: 6_000,
  };
}

type ToolOutcome = { ok: boolean; result: string };
type WikiChunk = { url: string; markdownChunk: string; nextOffset: number | null; offset: number; totalChars: number };

async function execute(agentTool: unknown, input: unknown): Promise<ToolOutcome> {
  return (
    agentTool as { execute: (input: unknown, options: { toolCallId: string; messages: [] }) => Promise<ToolOutcome> }
  ).execute(input, { toolCallId: "wiki-test-call", messages: [] });
}

describe("managed Wiki retrieval tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calls.get.mockResolvedValue({ ok: true, data: page });
    calls.create.mockResolvedValue({ ok: true, data: [{ ...page, markdown: "Created page" }] });
    calls.fetch.mockResolvedValue({ text: "Complete external document" });
    calls.catalog.mockResolvedValue({ ok: true, data: catalog });
    calls.roles.mockResolvedValue({ ok: true, data: { items: [] } });
    calls.accounts.mockResolvedValue({ ok: true, data: [] });
  });

  it.each(["chat", "routine"] as const)(
    "reads a Wiki fetch in bounded chunks on %s without invoking external full fetch",
    async (surface) => {
      const markdown = "A clear voice 🌍.\n".repeat(1_000);
      calls.get.mockResolvedValue({ ok: true, data: { ...page, markdown } });
      const deps = dependencies();
      const tools = getAgentAiTools(deps, { surface, webSearchEnabled: false });
      const first = await execute(tools.fetch, { id: `wiki:${PAGE_ID}` });
      expect(first.ok).toBe(true);
      expect(first.result.length).toBeLessThanOrEqual(6_000);
      expect(first.result).not.toContain("[truncated:");
      const chunk = decode(first.result) as WikiChunk;
      expect(chunk.url).toBe(`/wiki?page=${PAGE_ID}`);
      expect(chunk.offset).toBe(0);
      expect(chunk.totalChars).toBe(markdown.length);
      expect(chunk.nextOffset).toBeGreaterThan(0);
      let reconstructed = chunk.markdownChunk;
      let nextOffset = chunk.nextOffset;
      let reads = 1;
      while (nextOffset !== null && reads < 20) {
        const next = await execute(tools.manage_wiki_pages, { action: "get", id: PAGE_ID, offset: nextOffset });
        expect(next.ok).toBe(true);
        expect(next.result.length).toBeLessThanOrEqual(6_000);
        expect(next.result).not.toContain("[truncated:");
        const current = decode(next.result) as WikiChunk;
        expect(current.offset).toBe(nextOffset);
        reconstructed += current.markdownChunk;
        nextOffset = current.nextOffset;
        reads++;
      }
      expect(nextOffset).toBeNull();
      expect(reconstructed).toBe(markdown);
      expect(calls.fetch).not.toHaveBeenCalled();
      expect(deps.requestApproval).not.toHaveBeenCalled();
      expect(deps.runInCallerContext).toHaveBeenCalledTimes(reads);
    },
  );

  it("preserves non-Wiki fetch behavior", async () => {
    const tools = getAgentAiTools(dependencies(), { webSearchEnabled: false });
    expect(await execute(tools.fetch, { id: "doc:en:wiki" })).toEqual({
      ok: true,
      result: "Complete external document",
    });
    expect(calls.fetch).toHaveBeenCalledWith({ id: "doc:en:wiki" });
    expect(calls.get).not.toHaveBeenCalled();
  });

  it("returns a denied read without leaking Markdown through the agent wrapper", async () => {
    calls.get.mockRejectedValue(new ForbiddenError("Wiki Read denied"));
    const tools = getAgentAiTools(dependencies(), { webSearchEnabled: false });
    const result = await execute(tools.fetch, { id: `wiki:${PAGE_ID}` });
    expect(result.ok).toBe(false);
    expect(result.result).not.toContain("Current catalog guidance");
    expect(calls.fetch).not.toHaveBeenCalled();
  });

  it("exposes catalog continuation through the shared workspace tool and omits it after Read is revoked", async () => {
    const tools = getAgentAiTools(dependencies(), { webSearchEnabled: false });
    const result = await execute(tools.get_workspace_context, { wikiPage: 2 });
    expect(result.ok).toBe(true);
    expect(decode(result.result)).toMatchObject({
      wiki: { total: 1, items: [{ excerpt: "Current catalog guidance" }] },
    });
    expect(calls.catalog).toHaveBeenCalledWith({ page: 2 });
    calls.catalog.mockRejectedValue(new ForbiddenError("Wiki Read revoked"));
    const denied = await execute(tools.get_workspace_context, {});
    expect(denied.ok).toBe(true);
    expect(decode(denied.result)).not.toHaveProperty("wiki");
    expect(denied.result).not.toContain("Current catalog guidance");
  });

  it("keeps core workspace data and explicit AGENTS.md continuation in one hosted result", async () => {
    const markdownChunk = "A".repeat(4_000);
    calls.catalog.mockResolvedValue({
      ok: true,
      data: {
        items: Array.from({ length: 10 }, (_, index) => ({
          ...page,
          id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
          title: `Page ${index} ${"T".repeat(110)}`,
          excerpt: "E".repeat(200),
          url: `/wiki?page=${index}`,
        })),
        agentsMd: {
          ...page,
          title: "AGENTS.md",
          url: `/wiki?page=${PAGE_ID}`,
          markdownChunk,
          offset: 0,
          nextOffset: 4_000,
          totalChars: 8_000,
        },
        total: 20,
        page: 1,
        nextPage: 2,
        truncated: true,
      },
    });
    calls.roles.mockResolvedValue({ ok: true, data: { items: [{ id: "role-1", name: "Support" }] } });
    calls.accounts.mockResolvedValue({
      ok: true,
      data: [{ id: "account-1", provider: "email", status: "connected" }],
    });

    const result = await execute(getAgentAiTools(dependencies()).get_workspace_context, {});

    expect(result.ok).toBe(true);
    expect(result.result.length).toBeLessThanOrEqual(6_000);
    expect(result.result).not.toContain("[truncated:");
    const decoded = decode(result.result) as {
      roles: Array<{ id: string }>;
      connectedAccounts: Array<{ id: string }>;
      wiki: { agentsMd: WikiChunk & { shortened: boolean }; items: unknown[] };
    };
    expect(decoded.roles).toEqual([expect.objectContaining({ id: "role-1" })]);
    expect(decoded.connectedAccounts).toEqual([expect.objectContaining({ id: "account-1" })]);
    expect(decoded.wiki.agentsMd.markdownChunk.length).toBeGreaterThan(0);
    expect(decoded.wiki.agentsMd.markdownChunk.length).toBeLessThan(markdownChunk.length);
    expect(decoded.wiki.agentsMd.nextOffset).toBe(decoded.wiki.agentsMd.markdownChunk.length);
    expect(decoded.wiki.agentsMd.shortened).toBe(true);
    expect(decoded.wiki.items).toHaveLength(10);
  });

  it("shrinks escape-heavy AGENTS.md on a code-point boundary without truncating the hosted payload", async () => {
    const markdownChunk = `${'"\\n'.repeat(1_999)}🌍`;
    calls.catalog.mockResolvedValue({
      ok: true,
      data: {
        items: Array.from({ length: 10 }, (_, index) => ({
          ...page,
          id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
          title: `Page ${index} ${"T".repeat(110)}`,
          excerpt: "E".repeat(200),
          url: `/wiki?page=${index}`,
        })),
        agentsMd: {
          ...page,
          title: "AGENTS.md",
          url: `/wiki?page=${PAGE_ID}`,
          markdownChunk,
          offset: 0,
          nextOffset: markdownChunk.length,
          totalChars: markdownChunk.length * 2,
        },
        total: 20,
        page: 1,
        nextPage: 2,
        truncated: true,
      },
    });

    const result = await execute(getAgentAiTools(dependencies()).get_workspace_context, {});

    expect(result.ok).toBe(true);
    expect(result.result.length).toBeLessThanOrEqual(6_000);
    expect(result.result).not.toContain("[truncated:");
    expect(result.result).not.toContain("�");
    const decoded = decode(result.result) as { wiki: { agentsMd: WikiChunk & { shortened: boolean } } };
    expect(decoded.wiki.agentsMd.markdownChunk.length).toBeGreaterThan(0);
    expect(decoded.wiki.agentsMd.markdownChunk.endsWith("\ud83c")).toBe(false);
    expect(decoded.wiki.agentsMd.nextOffset).toBe(decoded.wiki.agentsMd.markdownChunk.length);
    expect(decoded.wiki.agentsMd.nextOffset).toBeLessThan(markdownChunk.length);
    expect(decoded.wiki.agentsMd.shortened).toBe(true);
  });
});

describe("homepage setup tool boundary", () => {
  it.each([false, true])(
    "exposes only bounded page reads and atomic create when web search is enabled=%s",
    (webSearchEnabled) => {
      const tools = getAgentAiTools(dependencies(), { wikiHomepageSetup: true, webSearchEnabled });
      expect(Object.keys(tools).toSorted()).toEqual(["manage_wiki_pages", "read_public_page"]);
      expect(tools.web_search).toBeUndefined();
      expect(tools.get_workspace_context).toBeUndefined();
      expect(tools.fetch).toBeUndefined();
    },
  );

  it("uses the identical provider-normalized definitions for admission and execution", () => {
    const options = { wikiHomepageSetup: true, webSearchEnabled: true };
    const actual = getAgentAiTools(dependencies(), options);
    for (const provider of ["azure", "vertex"])
      expect(getAgentAiToolDefinitions(provider, options)).toEqual(describeAgentAiTools(actual, provider));
  });

  it("validates one-to-five-page empty-only creation and denies all other actions before execution", async () => {
    const options = { wikiHomepageSetup: true, webSearchEnabled: true };
    for (let count = 1; count <= 5; count++) {
      const input = {
        action: "create",
        requireEmpty: true,
        pages: Array.from({ length: count }, (_, index) => ({
          title: index === 0 ? "AGENTS.md" : `Page ${index}`,
          markdown: "Verified",
        })),
      };
      expect(await normalizeAgentAiToolInput("manage_wiki_pages", input, 6_000, options)).toMatchObject({
        ok: true,
        input,
      });
    }
    for (const input of [
      { action: "get", id: PAGE_ID },
      { action: "delete", id: PAGE_ID, expectedUpdatedAt: page.updatedAt.toISOString() },
      { action: "create", requireEmpty: false, pages: [{ title: "Page", markdown: "Verified" }] },
      { action: "create", requireEmpty: true, pages: [{ title: "agents.md", markdown: "Verified" }] },
      { action: "create", requireEmpty: true, pages: [] },
      {
        action: "create",
        requireEmpty: true,
        pages: Array.from({ length: 6 }, (_, index) => ({
          title: index === 0 ? "AGENTS.md" : `Page ${index}`,
          markdown: "Verified",
        })),
      },
    ]) {
      expect(await normalizeAgentAiToolInput("manage_wiki_pages", input, 6_000, options)).toMatchObject({ ok: false });
      expect(await execute(getAgentAiTools(dependencies(), options).manage_wiki_pages, input)).toMatchObject({
        ok: false,
      });
    }
    expect(await normalizeAgentAiToolInput("web_search", { query: "example" }, 6_000, options)).toMatchObject({
      ok: false,
    });
    expect(calls.create).not.toHaveBeenCalled();
  });

  it("passes authorized setup creation through the normal interactor and exactly-once receipt", async () => {
    calls.create.mockResolvedValue({ ok: true, data: [{ ...page, markdown: "Verified" }] });
    const deps = dependencies();
    const tools = getAgentAiTools(deps, { wikiHomepageSetup: true });
    const input = { action: "create", requireEmpty: true, pages: [{ title: "AGENTS.md", markdown: "Verified" }] };
    expect(await execute(tools.manage_wiki_pages, input)).toMatchObject({ ok: true });
    expect(calls.create).toHaveBeenCalledWith({ requireEmpty: true, pages: input.pages });
    expect(deps.runExactlyOnce).toHaveBeenCalledWith("wiki-test-call", "manage_wiki_pages", expect.any(Function));
    expect(deps.requestApproval).not.toHaveBeenCalled();
    expect(deps.runInCallerContext).toHaveBeenCalledOnce();
  });
});
