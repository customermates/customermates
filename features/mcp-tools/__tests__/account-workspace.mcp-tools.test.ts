import { beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";

const calls = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn() }));

vi.mock("@/core/di", () => ({
  getListAccountWorkspacesInteractor: () => ({ invoke: calls.list }),
  getCreateWorkspaceInteractor: () => ({ invokeForAgent: calls.create }),
}));

import { createZodError } from "@/core/validation/validation.utils";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { mcpToolResultText } from "@/features/mcp-tools/mcp-tool";
import { mcpToolInputSchema } from "@/features/mcp-tools/mcp-workspace-argument";
import { ALL_MCP_TOOLS, mcpAlwaysOnToolsForAppMode } from "@/features/mcp-tools/tool-registry";

import { createWorkspaceTool, listWorkspacesTool } from "../account-workspace.mcp-tools";

describe("account workspace MCP tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("are account tools without the per-call workspace argument, offered whatever toolset is chosen", () => {
    for (const tool of [listWorkspacesTool, createWorkspaceTool]) {
      expect(tool.scope).toBe("account");
      expect(Object.keys((mcpToolInputSchema(tool) as z.ZodObject).shape)).not.toContain("workspace");
    }
    expect(ALL_MCP_TOOLS).toEqual(expect.arrayContaining([listWorkspacesTool, createWorkspaceTool]));
    expect(mcpAlwaysOnToolsForAppMode("cloud")).toEqual(
      expect.arrayContaining([listWorkspacesTool, createWorkspaceTool]),
    );
    expect(mcpAlwaysOnToolsForAppMode("self-hosted")).toContain(listWorkspacesTool);
    expect(mcpAlwaysOnToolsForAppMode("self-hosted")).not.toContain(createWorkspaceTool);
  });

  it("returns the account's workspaces with their plan facts", async () => {
    const data = {
      canCreateWorkspace: true,
      workspaces: [
        {
          name: "Acme",
          slug: "acme",
          companyId: "company-a",
          role: "Admin",
          isAdmin: true,
          setUp: true,
          records: 3,
          usable: true,
          unavailableReason: null,
          unavailableExplanation: null,
          plan: {
            plan: "pro",
            onFreePlan: false,
            trialDaysLeft: 6,
            lostOnFree: [],
            keepsItRunning: null,
            choosePlanUrl: "https://app.example/w/acme/settings/billing",
          },
        },
      ],
    };
    calls.list.mockResolvedValue({ ok: true, data });

    const result = await listWorkspacesTool.execute();

    expect(result).toMatchObject({ structuredContent: data });
    expect(listWorkspacesTool.outputSchema.safeParse(data).success).toBe(true);
    expect(mcpToolResultText(result)).toContain("choosePlanUrl");
  });

  it("creates a workspace with name, team size and language and returns its slug", async () => {
    calls.create.mockResolvedValue({ ok: true, data: { companyId: "company-n", slug: "new-co", trial: true } });
    const input = createWorkspaceTool.inputSchema.parse({ name: " New Co ", teamSize: "small", displayLanguage: "de" });

    const result = await createWorkspaceTool.execute(input);

    expect(calls.create).toHaveBeenCalledWith({ name: "New Co", teamSize: "small", displayLanguage: "de" });
    expect(result).toMatchObject({ structuredContent: { slug: "new-co", trial: true } });
  });

  it("refuses an unknown team size before anything is created", () => {
    expect(createWorkspaceTool.inputSchema.safeParse({ name: "X", teamSize: "huge" }).success).toBe(false);
  });

  it("returns the typed refusal of the creation as a tool failure", async () => {
    calls.create.mockResolvedValue({
      ok: false,
      error: createZodError("You can create up to 3 workspaces in 24 hours.", [], {
        error: CustomErrorCode.workspaceDailyLimitReached,
        kind: "rate_limit",
      }),
    });

    const result = await createWorkspaceTool.execute(
      createWorkspaceTool.inputSchema.parse({ name: "X", teamSize: "solo" }),
    );

    expect(result).toMatchObject({
      failure: { issues: [expect.objectContaining({ customCode: CustomErrorCode.workspaceDailyLimitReached })] },
    });
  });
});
