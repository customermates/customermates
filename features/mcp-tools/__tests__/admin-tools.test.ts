import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { createMockDiModule, MOCK_ENV_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();
const spies = vi.hoisted(() => ({
  updateCompanySettings: vi.fn(),
  updateUserDetails: vi.fn(),
}));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/core/di", () => ({
  ...createMockDiModule(() => mockUser),
  getAdminUpdateUserDetailsInteractor: vi.fn(),
  getGetUserByIdInteractor: vi.fn(),
  getInviteUsersByEmailInteractor: vi.fn(),
  getUpdateCompanySettingsInteractor: () => ({
    invoke: spies.updateCompanySettings,
  }),
  getUpdateUserDetailsInteractor: () => ({ invoke: spies.updateUserDetails }),
}));

import { updateWorkspaceSettingsTool } from "../admin.mcp-tools";
import { mcpToolResultText } from "../mcp-tool";

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

  it("exposes the existing company terminology operation for onboarding", async () => {
    const terminology = [
      { entityType: "contact" as const, presetKey: "client" },
      { entityType: "deal" as const, presetKey: "project" },
    ];
    spies.updateCompanySettings.mockResolvedValue({
      ok: true,
      data: { terminology },
    });
    const input = updateWorkspaceSettingsTool.inputSchema.parse({
      target: "company",
      terminology,
    });

    const result = await updateWorkspaceSettingsTool.execute(input);

    expect(spies.updateCompanySettings).toHaveBeenCalledWith({ terminology });
    expect(mcpToolResultText(result)).toContain("Company settings updated");
    expect(mcpToolResultText(result)).toContain("client");
    expect(mcpToolResultText(result)).toContain("project");
    expect(mcpToolResultText(result)).not.toContain("currency");
  });

  it("reports only a changed currency when terminology was omitted", async () => {
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
    expect(mcpToolResultText(result)).not.toContain("terminology");
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

  it("rejects terminology presets outside the canonical catalog", () => {
    expect(() =>
      updateWorkspaceSettingsTool.inputSchema.parse({
        target: "company",
        terminology: [{ entityType: "deal", presetKey: "banana" }],
      }),
    ).toThrow();
  });
});
