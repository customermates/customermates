import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  catalog: vi.fn(),
  get: vi.fn(),
  records: vi.fn(),
  search: vi.fn(),
}));
const sentry = vi.hoisted(() => ({ captureException: vi.fn() }));

vi.mock("@/env", () => ({ env: { BASE_URL: "http://localhost:4105" } }));
vi.mock("@sentry/nextjs", () => sentry);
vi.mock("@/core/di", () => ({
  getGetWikiCatalogInteractor: () => ({ invoke: calls.catalog }),
  getGetWikiPageInteractor: () => ({ invoke: calls.get }),
  getSearchWikiPagesInteractor: () => ({ invoke: calls.search }),
  getGetContactByIdInteractor: vi.fn(),
  getGetDealByIdInteractor: vi.fn(),
  getGetOrganizationByIdInteractor: vi.fn(),
  getGetServiceByIdInteractor: vi.fn(),
  getGetTaskByIdInteractor: vi.fn(),
}));
vi.mock("@/features/search/entity-list-executors", () => ({
  entityListExecutors: {
    contact: calls.records,
    organization: calls.records,
    deal: calls.records,
    service: calls.records,
    task: calls.records,
  },
  entityNameExtractors: {},
}));
vi.mock("@/features/mcp-tools/docs.mcp-tools", () => ({
  getDocsPageRaw: vi.fn(),
  listDocsSlugs: () => [],
  searchDocsRaw: () => ({ results: [] }),
}));

import { createMcpRoute } from "../mcp-route-utils";
import { fetchTool, searchTool } from "@/features/mcp-tools/deep-research.mcp-tools";
import { registerWikiMcpResources } from "@/features/mcp-tools/wiki.mcp-resources";

const PAGE_ID = "10000000-0000-4000-8000-000000000001";
const LINKED_ID = "10000000-0000-4000-8000-000000000002";
const CREATED_AT = new Date("2026-09-20T09:00:00.000Z");
const UPDATED_AT = new Date("2026-09-20T10:00:00.000Z");
const page = {
  id: PAGE_ID,
  title: "Company voice",
  markdown: `Use plain language. Read [Support](/wiki?page=${LINKED_ID}).`,
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
};
const linkedPage = {
  ...page,
  id: LINKED_ID,
  title: "Support",
  markdown: "Escalate uncertain answers.",
};
const catalog = {
  items: [
    {
      id: PAGE_ID,
      title: page.title,
      excerpt: "Use plain language.",
      url: `http://localhost:4105/wiki?page=${PAGE_ID}`,
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    },
  ],
  relevantPages: [],
  total: 1,
  page: 1,
  nextPage: null,
  truncated: false,
};

function requestBody(method: string, id?: number, params?: Record<string, unknown>) {
  return {
    jsonrpc: "2.0",
    ...(id === undefined ? {} : { id }),
    method,
    ...(method === "initialize"
      ? {
          params: {
            protocolVersion: "2025-03-26",
            capabilities: { resources: {} },
            clientInfo: { name: "wiki-transport-test", version: "1" },
          },
        }
      : params
        ? { params }
        : {}),
  };
}

async function rpc(
  handler: (request: Request) => Promise<Response>,
  body: Record<string, unknown>,
  sessionId?: string,
) {
  const response = await handler(
    new Request("http://localhost:4105/api/v1/mcp?toolsets=knowledge", {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "x-api-key": "test",
        ...(sessionId ? { "mcp-session-id": sessionId } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
  const text = await response.text();
  const data = text
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice(6)) as Record<string, unknown>)
    .at(-1);
  return { response, data, text };
}

async function initializedHandler() {
  const handler = createMcpRoute({ knowledge: [] }, [searchTool, fetchTool], "/api/v1/mcp", registerWikiMcpResources);
  const initialized = await rpc(handler, requestBody("initialize", 1));
  const sessionId = initialized.response.headers.get("mcp-session-id") ?? undefined;
  if (sessionId) await rpc(handler, requestBody("notifications/initialized"), sessionId);
  return { handler, initialized, sessionId };
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.catalog.mockResolvedValue({ ok: true, data: catalog });
  calls.get.mockImplementation(({ id }: { id: string }) =>
    Promise.resolve({
      ok: true,
      data: id === PAGE_ID ? page : id === LINKED_ID ? linkedPage : null,
    }),
  );
  calls.search.mockResolvedValue({
    ok: true,
    data: {
      items: [
        {
          id: PAGE_ID,
          title: page.title,
          snippet: "plain language",
          createdAt: CREATED_AT,
          updatedAt: UPDATED_AT,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 5,
    },
  });
  calls.records.mockResolvedValue({ ok: true, data: { items: [] } });
});

describe("Wiki MCP transport", () => {
  it("advertises the catalog and page resource templates with scoped server instructions", async () => {
    const { handler, initialized, sessionId } = await initializedHandler();
    const initialization = initialized.data?.result as {
      capabilities?: Record<string, unknown>;
      instructions?: string;
    };
    expect(initialization.capabilities).toHaveProperty("resources");
    expect(initialization.instructions).toContain("call search");
    expect(initialization.instructions).not.toContain("get_record_schema");
    expect(initialization.instructions).not.toContain("manage_wiki_pages creates");

    const listed = await rpc(handler, requestBody("resources/list", 2), sessionId);
    expect(listed.data?.result).toMatchObject({
      resources: [
        {
          uri: "customermates://wiki/catalog?page=1",
          name: "workspace-wiki-catalog",
          mimeType: "application/json",
        },
      ],
    });

    const templates = await rpc(handler, requestBody("resources/templates/list", 3), sessionId);
    expect(templates.data?.result).toMatchObject({
      resourceTemplates: expect.arrayContaining([
        expect.objectContaining({
          uriTemplate: "customermates://wiki/catalog{?page}",
        }),
        expect.objectContaining({
          uriTemplate: "http://localhost:4105/wiki{?page}",
        }),
      ]),
    });
  });

  it("reads the permission-checked catalog and externalizes internal page links", async () => {
    const { handler, sessionId } = await initializedHandler();
    const catalogRead = await rpc(
      handler,
      requestBody("resources/read", 2, {
        uri: "customermates://wiki/catalog?page=1",
      }),
      sessionId,
    );
    const catalogContent = (catalogRead.data?.result as { contents: Array<{ text: string }> }).contents[0];
    expect(JSON.parse(catalogContent?.text ?? "{}")).toMatchObject({
      items: [{ id: PAGE_ID, url: `http://localhost:4105/wiki?page=${PAGE_ID}` }],
      nextPage: null,
    });
    expect(calls.catalog).toHaveBeenCalledWith({ page: 1 });

    const pageRead = await rpc(
      handler,
      requestBody("resources/read", 3, {
        uri: `http://localhost:4105/wiki?page=${PAGE_ID}`,
      }),
      sessionId,
    );
    const pageContent = (pageRead.data?.result as { contents: Array<{ text: string }> }).contents[0];
    expect(pageContent?.text).toContain(`http://localhost:4105/wiki?page=${LINKED_ID}`);
    expect(calls.get).toHaveBeenCalledWith({ id: PAGE_ID });
  });

  it("supports the standard search → fetch → linked fetch journey over HTTP", async () => {
    const { handler, sessionId } = await initializedHandler();
    const listed = await rpc(handler, requestBody("tools/list", 2), sessionId);
    const tools = (listed.data?.result as { tools: Array<Record<string, unknown>> }).tools;
    expect(tools.find((tool) => tool.name === "search")).toMatchObject({
      annotations: { readOnlyHint: true },
      outputSchema: { type: "object", required: ["results"] },
    });
    expect(tools.find((tool) => tool.name === "fetch")).toMatchObject({
      annotations: { readOnlyHint: true },
      outputSchema: {
        type: "object",
        required: ["id", "title", "text", "url"],
      },
    });

    const searched = await rpc(
      handler,
      requestBody("tools/call", 3, {
        name: "search",
        arguments: { query: "company voice" },
      }),
      sessionId,
    );
    const searchResult = searched.data?.result as {
      structuredContent: { results: Array<{ id: string; url: string }> };
      content: Array<{ type: string; uri?: string }>;
    };
    expect(searchResult.structuredContent.results).toEqual([
      {
        id: `wiki:${PAGE_ID}`,
        title: page.title,
        url: `http://localhost:4105/wiki?page=${PAGE_ID}`,
      },
    ]);
    expect(searchResult.content).toContainEqual(
      expect.objectContaining({
        type: "resource_link",
        uri: `http://localhost:4105/wiki?page=${PAGE_ID}`,
      }),
    );

    const fetched = await rpc(
      handler,
      requestBody("tools/call", 4, {
        name: "fetch",
        arguments: { id: searchResult.structuredContent.results[0]?.url },
      }),
      sessionId,
    );
    const fetchResult = fetched.data?.result as {
      structuredContent: {
        text: string;
        metadata: { outgoingWikiLinks: string };
      };
    };
    expect(fetchResult.structuredContent.text).toContain(`http://localhost:4105/wiki?page=${LINKED_ID}`);
    const outgoing = JSON.parse(fetchResult.structuredContent.metadata.outgoingWikiLinks) as Array<{ url: string }>;
    expect(outgoing).toEqual([
      expect.objectContaining({
        url: `http://localhost:4105/wiki?page=${LINKED_ID}`,
      }),
    ]);

    const linked = await rpc(
      handler,
      requestBody("tools/call", 5, {
        name: "fetch",
        arguments: { id: outgoing[0]?.url },
      }),
      sessionId,
    );
    expect(
      (
        linked.data?.result as {
          structuredContent: { title: string; text: string };
        }
      ).structuredContent,
    ).toMatchObject({
      title: linkedPage.title,
      text: linkedPage.markdown,
    });
  });

  it.each([
    `http://other.example/wiki?page=${PAGE_ID}`,
    `http://localhost:4105/wiki?page=${PAGE_ID}&other=true`,
    `http://localhost:4105/wiki?page=${PAGE_ID}#fragment`,
    "http://localhost:4105/wiki?page=invalid",
  ])("rejects unsafe resource URI %s without reading a page", async (uri) => {
    const { handler, sessionId } = await initializedHandler();
    calls.get.mockClear();
    const result = await rpc(handler, requestBody("resources/read", 2, { uri }), sessionId);
    expect(result.data?.error).toBeDefined();
    expect(calls.get).not.toHaveBeenCalled();
  });

  it("redacts unexpected resource failures before they cross the transport", async () => {
    const { handler, sessionId } = await initializedHandler();
    calls.catalog.mockRejectedValue(new Error("database-password=must-not-leak"));

    const result = await rpc(
      handler,
      requestBody("resources/read", 2, {
        uri: "customermates://wiki/catalog?page=1",
      }),
      sessionId,
    );

    expect(result.data?.error).toBeDefined();
    expect(result.text).toContain("Workspace Wiki resource is unavailable");
    expect(result.text).not.toContain("database-password");
    expect(sentry.captureException).toHaveBeenCalledOnce();
    const captured = sentry.captureException.mock.calls[0]?.[0] as Error;
    expect(captured.message).toBe("The Workspace Wiki MCP resource could not be read.");
    expect(captured.stack).not.toContain("must-not-leak");
  });

  it("returns a generic missing-page error without reporting an expected stale link", async () => {
    const { handler, sessionId } = await initializedHandler();
    calls.get.mockResolvedValue({ ok: true, data: null });

    const result = await rpc(
      handler,
      requestBody("resources/read", 2, {
        uri: `http://localhost:4105/wiki?page=${PAGE_ID}`,
      }),
      sessionId,
    );

    expect(result.data?.error).toBeDefined();
    expect(result.text).toContain("Workspace Wiki resource is unavailable");
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it("returns a generic malformed-catalog error without reporting expected client input", async () => {
    const { handler, sessionId } = await initializedHandler();

    const result = await rpc(
      handler,
      requestBody("resources/read", 2, {
        uri: "customermates://wiki/catalog?page=abc",
      }),
      sessionId,
    );

    expect(result.data?.error).toBeDefined();
    expect(result.text).toContain("Workspace Wiki resource is unavailable");
    expect(calls.catalog).not.toHaveBeenCalled();
    expect(sentry.captureException).not.toHaveBeenCalled();
  });
});
