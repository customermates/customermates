import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createMockUser } from "@/tests/helpers/mock-user";
import {
  createMockDiModule,
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
} from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(createMockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("@/ee/wiki-crawl/wiki-crawl-synthesis-tools", () => ({
  WIKI_READ_SOURCE_TOOL_NAME: "read_website_source",
  readWebsiteSourceTool: () => ({
    name: "read_website_source",
    description: "Read stored sources",
    annotations: { readOnlyHint: true },
    inputSchema: z.object({}),
    execute: () =>
      Promise.resolve({
        text: "x".repeat(44_000),
        structuredContent: {
          items: [{ title: "About us", url: "https://example.com/about", text: "Private body", id: "private-id" }],
        },
      }),
  }),
  createWikiFromCrawlTool: () => ({
    name: "manage_wiki_pages",
    description: "Create pages",
    annotations: { readOnlyHint: true },
    inputSchema: z.object({}),
    execute: () => Promise.resolve({ text: "y".repeat(22_000) }),
  }),
}));

import { getAgentAiTools, type AgentToolDeps } from "../agent-tools";

describe("stored website evidence tool budget", () => {
  it("delivers the bounded source batch intact while ordinary tool output stays capped", async () => {
    const deps: AgentToolDeps = {
      runUiCommand: vi.fn(),
      requestApproval: vi.fn(),
      resolveApprovalContext: vi.fn().mockImplementation((_name, input) => Promise.resolve({ ok: true, input })),
      createSupportTicket: vi.fn(),
      runExactlyOnce: vi.fn().mockImplementation((_id, _name, run) => run()),
      runInCallerContext: (run) => run(),
      resultMaxChars: 6_000,
    };
    const tools = getAgentAiTools(deps, {
      wikiHomepageSetup: true,
      wikiCrawlId: "crawl",
    });
    const options = { toolCallId: "read-1", messages: [], context: undefined };
    const read = (await tools.read_website_source.execute?.({}, options)) as {
      result: string;
      activityContext?: { labels: string[] };
    };
    expect(read.activityContext).toEqual({ labels: ["About us"] });
    expect(read.result).toBe("x".repeat(44_000));
    expect(deps.runExactlyOnce).toHaveBeenCalledWith("read-1", "read_website_source", expect.any(Function));
    const create = (await tools.manage_wiki_pages.execute?.({}, { ...options, toolCallId: "create-1" })) as {
      result: string;
    };
    expect(create.result.length).toBeLessThanOrEqual(6_000);
  });
});
