import { describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import {
  createMockDiModule,
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
} from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);
const createPages = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true, data: { items: [] } }));

vi.mock("@/core/di", () => ({
  ...createMockDiModule(() => createMockUser()),
  getCreateWikiPagesFromCrawlInteractor: () => ({ invoke: createPages }),
}));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import { isReadOnlyAgentToolCall, requiresApproval } from "@/ee/agent-chat/gated-tools";
import { internalToolIdentity } from "@/ee/agent-chat/tool-identity";
import { ManageWikiPagesOutputSchema, manageWikiPagesTool } from "@/features/mcp-tools/wiki.mcp-tools";

import { createWikiFromCrawlTool, WikiCrawlSynthesisCreateSchema } from "../wiki-crawl-synthesis-tools";

const synthesis = createWikiFromCrawlTool("en", "00000000-0000-4000-8000-000000000001");
const input = {
  action: "create" as const,
  pages: [
    {
      title: "Refunds",
      kind: "knowledge" as const,
      gaps: [],
      sections: [
        {
          heading: "Annual plans",
          content: "Refunds within 30 days.",
          evidence: [
            {
              sourceId: "00000000-0000-4000-8000-000000000002",
              quote: "Refunds within 30 days.",
            },
          ],
        },
      ],
      sourceIds: ["00000000-0000-4000-8000-000000000002"],
    },
  ],
};

describe("the website-synthesis manage_wiki_pages tool", () => {
  it("advertises and enforces one initial page before invoking the interactor", async () => {
    const initial = createWikiFromCrawlTool("en", "00000000-0000-4000-8000-000000000001", true);
    const twoPages = { ...input, pages: [input.pages[0], { ...input.pages[0], title: "Annual plans" }] };
    createPages.mockClear();

    expect(initial.inputSchema.safeParse(input).success).toBe(true);
    expect(initial.inputSchema.safeParse(twoPages).success).toBe(false);
    expect(initial.description).toContain("Create one Knowledge Base page per call");
    expect(await initial.execute(twoPages)).toMatchObject({ failure: { kind: "validation" } });
    expect(createPages).not.toHaveBeenCalled();

    await initial.execute(input);
    expect(createPages).toHaveBeenCalledExactlyOnceWith({
      pages: input.pages,
      crawlId: "00000000-0000-4000-8000-000000000001",
    });
  });

  it("preserves the default and extension five-page batch boundary", async () => {
    const extension = createWikiFromCrawlTool("en", "00000000-0000-4000-8000-000000000001", false);
    const fivePages = {
      ...input,
      pages: Array.from({ length: 5 }, (_, index) => ({ ...input.pages[0], title: `Page ${index + 1}` })),
    };
    createPages.mockClear();

    for (const tool of [synthesis, extension]) {
      expect(tool.inputSchema.safeParse(fivePages).success).toBe(true);
      expect(tool.inputSchema.safeParse({ ...fivePages, pages: [...fivePages.pages, input.pages[0]] }).success).toBe(
        false,
      );
      await tool.execute(fivePages);
      expect(await tool.execute({ ...fivePages, pages: [...fivePages.pages, input.pages[0]] })).toMatchObject({
        failure: { kind: "validation" },
      });
    }
    expect(createPages).toHaveBeenCalledTimes(2);
    expect(createPages).toHaveBeenLastCalledWith({
      pages: fivePages.pages,
      crawlId: "00000000-0000-4000-8000-000000000001",
    });
  });

  it("shares the Wiki tool's name and output, and accepts only its create action", () => {
    const actions = manageWikiPagesTool.inputSchema.shape.action.options;

    expect(synthesis.name).toBe(manageWikiPagesTool.name);
    expect(synthesis.outputSchema).toBe(ManageWikiPagesOutputSchema);
    expect(manageWikiPagesTool.outputSchema).toBe(ManageWikiPagesOutputSchema);
    expect(
      Object.keys(WikiCrawlSynthesisCreateSchema.shape).every((key) => key in manageWikiPagesTool.inputSchema.shape),
    ).toBe(true);
    expect(actions).toContain(WikiCrawlSynthesisCreateSchema.shape.action.value);
    expect(WikiCrawlSynthesisCreateSchema.safeParse(input).success).toBe(true);
    for (const action of actions.filter((candidate) => candidate !== "create"))
      expect(WikiCrawlSynthesisCreateSchema.safeParse({ ...input, action }).success, action).toBe(false);
  });

  it("resolves the Wiki tool's approval policy for its create, never as a read and never behind an approval", () => {
    const identity = internalToolIdentity(synthesis.name);

    expect(requiresApproval(identity, synthesis, input)).toBe(false);
    expect(requiresApproval(identity, synthesis, input)).toBe(requiresApproval(identity, manageWikiPagesTool, input));
    expect(isReadOnlyAgentToolCall(synthesis.name, synthesis, input)).toBe(false);
    expect(requiresApproval(identity, manageWikiPagesTool, { action: "delete" })).toBe(true);
    expect(synthesis.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, openWorldHint: false });
  });
});
