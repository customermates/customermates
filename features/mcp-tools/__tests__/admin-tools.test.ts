import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { createMockDiModule, MOCK_ENV_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();
const spies = vi.hoisted(() => ({
  adminUpdateUserDetails: vi.fn(),
  getTeamMember: vi.fn(),
  updateCompanySettings: vi.fn(),
  updateUserDetails: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve({ raw: (key: string) => key }),
}));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/core/di", () => ({
  ...createMockDiModule(() => mockUser),
  getAdminUpdateUserDetailsInteractor: () => ({ invoke: spies.adminUpdateUserDetails }),
  getGetTeamMemberInteractor: () => ({ invoke: spies.getTeamMember }),
  getInviteUsersByEmailInteractor: vi.fn(),
  getUpdateCompanySettingsInteractor: () => ({
    invoke: spies.updateCompanySettings,
  }),
  getUpdateUserDetailsInteractor: () => ({ invoke: spies.updateUserDetails }),
}));

import { ForbiddenError } from "@/core/errors/app-errors";

import { manageTeamTool, updateWorkspaceSettingsTool } from "../admin.mcp-tools";
import { executeMcpTool, mcpToolResultText } from "../mcp-tool";

const MEMBER_ID = "30000000-0000-4000-8000-000000000002";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("update_workspace_settings", () => {
  it("reports only the profile fields changed in country and avatar updates", async () => {
    spies.updateUserDetails.mockResolvedValue({
      ok: true,
      data: {
        firstName: "Ada",
        lastName: "Lovelace",
        country: "de",
        avatarUrl: "https://example.com/ada.png",
      },
    });
    const input = updateWorkspaceSettingsTool.inputSchema.parse({
      target: "profile",
      country: "de",
      avatarUrl: "https://example.com/ada.png",
    });

    const result = await updateWorkspaceSettingsTool.execute(input);

    expect(spies.updateUserDetails).toHaveBeenCalledWith({
      country: "de",
      avatarUrl: "https://example.com/ada.png",
    });
    expect(mcpToolResultText(result)).toContain("country: de");
    expect(mcpToolResultText(result)).toContain("https://example.com/ada.png");
    expect(mcpToolResultText(result)).not.toContain("firstName");
    expect(mcpToolResultText(result)).not.toContain("lastName");
  });

  it("reports only the profile name field that changed", async () => {
    spies.updateUserDetails.mockResolvedValue({
      ok: true,
      data: {
        firstName: "Grace",
        lastName: "Hopper",
        country: "us",
        avatarUrl: null,
      },
    });
    const input = updateWorkspaceSettingsTool.inputSchema.parse({
      target: "profile",
      firstName: "Grace",
    });

    const result = await updateWorkspaceSettingsTool.execute(input);

    expect(mcpToolResultText(result)).toContain("firstName: Grace");
    expect(mcpToolResultText(result)).not.toContain("lastName");
    expect(mcpToolResultText(result)).not.toContain("country");
    expect(mcpToolResultText(result)).not.toContain("avatarUrl");
  });

  it("points record type renaming to the generic configuration contract", () => {
    expect(updateWorkspaceSettingsTool.description).toContain("configure_record_model");
  });

  it("reports only a changed currency", async () => {
    spies.updateCompanySettings.mockResolvedValue({
      ok: true,
      data: { currency: "eur" },
    });
    const input = updateWorkspaceSettingsTool.inputSchema.parse({
      target: "company",
      currency: "eur",
    });

    const result = await updateWorkspaceSettingsTool.execute(input);

    expect(spies.updateCompanySettings).toHaveBeenCalledWith({
      currency: "eur",
    });
    expect(mcpToolResultText(result)).toContain("currency: eur");
  });

  it("rejects an empty company update instead of reporting a no-op as success", async () => {
    const input = updateWorkspaceSettingsTool.inputSchema.parse({
      target: "company",
    });

    const result = await updateWorkspaceSettingsTool.execute(input);

    expect(mcpToolResultText(result)).toContain("Validation error:");
    expect(spies.updateCompanySettings).not.toHaveBeenCalled();
  });

  it("rejects an empty profile update instead of publishing a no-op as success", async () => {
    const input = updateWorkspaceSettingsTool.inputSchema.parse({
      target: "profile",
    });

    const result = await updateWorkspaceSettingsTool.execute(input);

    expect(mcpToolResultText(result)).toContain("Validation error:");
    expect(spies.updateUserDetails).not.toHaveBeenCalled();
  });
});

describe("manage_team update_member", () => {
  it("reports a caller who may not manage members as an authorization failure, not a missing member", async () => {
    spies.getTeamMember.mockRejectedValue(new ForbiddenError("Access denied. Required permissions: update on users"));

    const outcome = await executeMcpTool(manageTeamTool, [
      manageTeamTool.inputSchema.parse({ action: "update_member", userId: MEMBER_ID, status: "active" }),
    ]);

    expect(outcome.ok).toBe(false);
    expect(outcome).toMatchObject({ failure: { kind: "authorization" } });
    expect(spies.getTeamMember).toHaveBeenCalledWith({ id: MEMBER_ID });
    expect(spies.adminUpdateUserDetails).not.toHaveBeenCalled();
  });

  it("still reports a member the caller may manage but cannot find as not found", async () => {
    spies.getTeamMember.mockResolvedValue({ ok: true, data: { user: null } });

    const outcome = await executeMcpTool(manageTeamTool, [
      manageTeamTool.inputSchema.parse({ action: "update_member", userId: MEMBER_ID, status: "active" }),
    ]);

    expect(outcome).toMatchObject({ ok: false, failure: { kind: "not_found" } });
    expect(spies.adminUpdateUserDetails).not.toHaveBeenCalled();
  });
});

describe("admin tool descriptions", () => {
  it("state the role permissions the interactors check instead of admin rights", () => {
    const texts = [
      updateWorkspaceSettingsTool.description,
      updateWorkspaceSettingsTool.inputSchema.shape.target.description ?? "",
      manageTeamTool.description,
    ];

    for (const text of texts) expect(text).not.toContain("admin rights");
    expect(updateWorkspaceSettingsTool.description).toContain("update permission on the company");
    expect(manageTeamTool.description).toContain("invite requires create permission on users");
    expect(manageTeamTool.description).toContain("update_member requires update permission");
  });
});
