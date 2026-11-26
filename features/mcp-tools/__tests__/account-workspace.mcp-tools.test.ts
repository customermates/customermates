import { beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";

const calls = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), setup: vi.fn(), advance: vi.fn() }));

vi.mock("@/core/di", () => ({
  getListAccountWorkspacesInteractor: () => ({ invoke: calls.list }),
  getCreateWorkspaceInteractor: () => ({ invokeForAgent: calls.create }),
  getStartAgentWorkspaceSetupInteractor: () => ({ invoke: calls.setup }),
  getAdvanceAgentWorkspaceSetupInteractor: () => ({ invoke: calls.advance }),
}));

import { createZodError } from "@/core/validation/validation.utils";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { mcpToolResultText } from "@/features/mcp-tools/mcp-tool";
import { mcpToolInputSchema } from "@/features/mcp-tools/mcp-workspace-argument";
import { ALL_MCP_TOOLS, mcpAlwaysOnToolsForAppMode } from "@/features/mcp-tools/tool-registry";

import { createWorkspaceTool, getWorkspaceSetupStatusTool, listWorkspacesTool } from "../account-workspace.mcp-tools";

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
    expect(mcpAlwaysOnToolsForAppMode("self-hosted")).not.toContain(getWorkspaceSetupStatusTool);
    expect(Object.keys((mcpToolInputSchema(getWorkspaceSetupStatusTool) as z.ZodObject).shape)).toEqual(["workspace"]);
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
    expect(result).toMatchObject({ structuredContent: { slug: "new-co", trial: true, setup: null } });
    expect(calls.setup).not.toHaveBeenCalled();
  });

  it("starts the Mate setup of the new workspace from a description and the answers the agent knows", async () => {
    calls.create.mockResolvedValue({ ok: true, data: { companyId: "company-n", slug: "new-co", trial: true } });
    calls.setup.mockResolvedValue({ ok: true, data: { setupId: "setup-1", status: "planning" } });
    const input = createWorkspaceTool.inputSchema.parse({
      name: "Alpine Studio",
      teamSize: "solo",
      displayLanguage: "de",
      description: "We design websites for small hotels.",
      workWith: "clients",
      pricing: "fixedPrice",
      exampleRecords: false,
    });

    const result = await createWorkspaceTool.execute(input);

    expect(calls.setup).toHaveBeenCalledWith({
      companyId: "company-n",
      description: "We design websites for small hotels.",
      teamSize: "solo",
      locale: "de",
      workWith: "clients",
      pricing: "fixedPrice",
      exampleRecords: false,
    });
    expect(result).toMatchObject({
      structuredContent: { slug: "new-co", setup: { status: "planning", setupId: "setup-1", reason: null } },
    });
    expect(createWorkspaceTool.outputSchema.safeParse((result as { structuredContent: unknown }).structuredContent).success).toBe(true);
  });

  it("keeps the new workspace and names the reason when the setup cannot start", async () => {
    calls.create.mockResolvedValue({ ok: true, data: { companyId: "company-n", slug: "new-co", trial: false } });
    calls.setup.mockResolvedValue({
      ok: false,
      error: createZodError("Mate is not included in this plan.", [], { error: CustomErrorCode.permissionDenied }),
    });

    const result = await createWorkspaceTool.execute(
      createWorkspaceTool.inputSchema.parse({ name: "Second", teamSize: "solo", description: "A bakery." }),
    );

    expect(result).toMatchObject({
      structuredContent: { slug: "new-co", setup: { status: "notStarted", setupId: null } },
    });
    expect(JSON.stringify(result)).toContain("Mate is not included in this plan.");
  });

  it("starts no setup when the workspace itself could not be created", async () => {
    calls.create.mockResolvedValue({
      ok: false,
      error: createZodError("Email not verified.", [], { error: CustomErrorCode.emailNotVerified }),
    });

    const result = await createWorkspaceTool.execute(
      createWorkspaceTool.inputSchema.parse({ name: "X", teamSize: "solo", description: "A bakery." }),
    );

    expect(result).toMatchObject({ failure: { issues: [expect.objectContaining({ customCode: "emailNotVerified" })] } });
    expect(calls.setup).not.toHaveBeenCalled();
  });

  it("reports the setup progress in a compact form", async () => {
    calls.advance.mockResolvedValue({
      ok: true,
      data: {
        available: true,
        setup: {
          status: "building",
          plan: { status: "completed", error: null },
          currentPhase: "views",
          phases: [
            { key: "dataModel", status: "completed", error: null, attempts: 1, startedAt: null, finishedAt: null },
            { key: "views", status: "running", error: null, attempts: 1, startedAt: null, finishedAt: null },
          ],
          knowledgeBase: { pagesPlanned: 4, pagesWritten: 1 },
          finishedAt: null,
        },
      },
    });

    const result = await getWorkspaceSetupStatusTool.execute();

    expect(result).toMatchObject({
      structuredContent: {
        available: true,
        reason: null,
        status: "building",
        currentPhase: "views",
        phases: [
          { phase: "dataModel", status: "completed", error: null },
          { phase: "views", status: "running", error: null },
        ],
      },
    });

    calls.advance.mockResolvedValue({ ok: true, data: { available: false, reason: "configured", setup: null } });
    expect(await getWorkspaceSetupStatusTool.execute()).toMatchObject({
      structuredContent: { available: false, reason: "configured", status: null, phases: [] },
    });
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
