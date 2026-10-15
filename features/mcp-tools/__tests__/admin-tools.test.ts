import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { createMockDiModule, MOCK_ENV_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();
const spies = vi.hoisted(() => ({
  inviteUsers: vi.fn(),
  updateTeamMember: vi.fn(),
  updateUserDetails: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve({ raw: (key: string) => key }),
}));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/core/di", () => ({
  ...createMockDiModule(() => mockUser),
  getAdminUpdateUserDetailsInteractor: () => ({ invoke: spies.updateTeamMember }),
  getInviteUsersByEmailInteractor: () => ({ invoke: spies.inviteUsers }),
  getUpdateUserDetailsInteractor: () => ({ invoke: spies.updateUserDetails }),
}));

import { ForbiddenError } from "@/core/errors/app-errors";

import { manageTeamTool, updateMyProfileTool } from "../admin.mcp-tools";
import { executeMcpTool, mcpToolResultText } from "../mcp-tool";

const MEMBER_ID = "30000000-0000-4000-8000-000000000002";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("update_my_profile", () => {
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
    const input = updateMyProfileTool.inputSchema.parse({
      country: "de",
      avatarUrl: "https://example.com/ada.png",
    });

    const result = await updateMyProfileTool.execute(input);

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
    const input = updateMyProfileTool.inputSchema.parse({
      firstName: "Grace",
    });

    const result = await updateMyProfileTool.execute(input);

    expect(mcpToolResultText(result)).toContain("firstName: Grace");
    expect(mcpToolResultText(result)).not.toContain("lastName");
    expect(mcpToolResultText(result)).not.toContain("country");
    expect(mcpToolResultText(result)).not.toContain("avatarUrl");
  });

  it("passes theme, display language and formatting locale to the profile interactor the settings page uses", async () => {
    spies.updateUserDetails.mockResolvedValue({
      ok: true,
      data: {
        firstName: "Ada",
        lastName: "Lovelace",
        country: "de",
        avatarUrl: null,
        theme: "dark",
        displayLanguage: "de",
        formattingLocale: "en",
      },
    });
    const input = updateMyProfileTool.inputSchema.parse({
      theme: "dark",
      displayLanguage: "de",
      formattingLocale: "en",
    });

    const result = await updateMyProfileTool.execute(input);

    expect(spies.updateUserDetails).toHaveBeenCalledWith({
      theme: "dark",
      displayLanguage: "de",
      formattingLocale: "en",
    });
    expect(result).toMatchObject({
      structuredContent: { theme: "dark", displayLanguage: "de", formattingLocale: "en", message: "Profile updated" },
    });
    expect(mcpToolResultText(result)).not.toContain("firstName");
  });

  it("only edits the caller's profile and no longer points at record configuration", () => {
    expect(updateMyProfileTool.name).toBe("update_my_profile");
    expect(updateMyProfileTool.description).not.toContain("configure_record_model");
    expect(updateMyProfileTool.description).not.toContain("currency");
  });

  it("rejects the removed company target and workspace currency", () => {
    expect(
      updateMyProfileTool.inputSchema.safeParse({
        target: "company",
        currency: "eur",
      }).success,
    ).toBe(false);

    expect(
      updateMyProfileTool.inputSchema.safeParse({
        currency: "eur",
      }).success,
    ).toBe(false);
  });

  it("rejects an empty profile update instead of publishing a no-op as success", async () => {
    const input = updateMyProfileTool.inputSchema.parse({});

    const result = await updateMyProfileTool.execute(input);

    expect(mcpToolResultText(result)).toContain("Validation error:");
    expect(spies.updateUserDetails).not.toHaveBeenCalled();
  });
});

describe("manage_team invite", () => {
  it("reports sent invitations", async () => {
    spies.inviteUsers.mockResolvedValue({ ok: true, data: { sent: 2, failed: 0, failedEmails: [] } });

    const outcome = await executeMcpTool(manageTeamTool, [
      manageTeamTool.inputSchema.parse({ action: "invite", emails: ["a@example.com", "b@example.com"] }),
    ]);

    expect(outcome).toMatchObject({
      ok: true,
      structuredContent: { sent: 2, failed: 0, message: "Invitation emails sent" },
    });
  });

  it("tells the agent which share of the invitations the email service did not accept", async () => {
    spies.inviteUsers.mockResolvedValue({
      ok: true,
      data: { sent: 0, failed: 2, failedEmails: ["a@example.com", "b@example.com"] },
    });

    const outcome = await executeMcpTool(manageTeamTool, [
      manageTeamTool.inputSchema.parse({ action: "invite", emails: ["a@example.com", "b@example.com"] }),
    ]);

    expect(outcome).toMatchObject({
      ok: true,
      structuredContent: { sent: 0, failed: 2, failedEmails: ["a@example.com", "b@example.com"] },
    });
    expect(outcome.ok && outcome.structuredContent?.message).toContain(
      "2 of 2 invitation emails were not sent because the email service did not accept them",
    );
  });
});

describe("manage_team update_member", () => {
  it("passes only the requested change to the member interactor, which merges the current values", async () => {
    spies.updateTeamMember.mockResolvedValue({
      ok: true,
      data: { email: "member@example.test", roleId: "30000000-0000-4000-8000-000000000003", status: "inactive" },
    });

    const outcome = await executeMcpTool(manageTeamTool, [
      manageTeamTool.inputSchema.parse({ action: "update_member", userId: MEMBER_ID, status: "inactive" }),
    ]);

    expect(spies.updateTeamMember).toHaveBeenCalledWith({ userId: MEMBER_ID, status: "inactive" });
    expect(outcome).toMatchObject({ ok: true, structuredContent: { status: "inactive", message: "Member updated" } });
  });

  it.each([{ email: "member@example.test" }, { userId: MEMBER_ID, email: "member@example.test" }])(
    "accepts a member email and delegates matching both identifiers to the interactor",
    async (reference) => {
      spies.updateTeamMember.mockResolvedValue({
        ok: true,
        data: { email: "member@example.test", roleId: "30000000-0000-4000-8000-000000000003", status: "active" },
      });

      const outcome = await executeMcpTool(manageTeamTool, [
        manageTeamTool.inputSchema.parse({ action: "update_member", ...reference, status: "active" }),
      ]);

      expect(spies.updateTeamMember).toHaveBeenCalledWith({ ...reference, status: "active" });
      expect(outcome).toMatchObject({ ok: true, structuredContent: { email: "member@example.test" } });
    },
  );

  it("reports a caller who may not manage members as an authorization failure", async () => {
    spies.updateTeamMember.mockRejectedValue(
      new ForbiddenError("Access denied. Required permissions: update on users"),
    );

    const outcome = await executeMcpTool(manageTeamTool, [
      manageTeamTool.inputSchema.parse({ action: "update_member", userId: MEMBER_ID, status: "active" }),
    ]);

    expect(outcome).toMatchObject({ ok: false, failure: { kind: "authorization" } });
  });

  it("rejects an update_member call without userId or email before reaching the interactor", async () => {
    const outcome = await executeMcpTool(manageTeamTool, [
      manageTeamTool.inputSchema.parse({ action: "update_member", status: "active" }),
    ]);

    expect(outcome).toMatchObject({ ok: false, failure: { kind: "validation" } });
    expect(spies.updateTeamMember).not.toHaveBeenCalled();
  });
});

describe("admin tool descriptions", () => {
  it("state the role permissions the interactors check instead of admin rights", () => {
    const texts = [updateMyProfileTool.description, manageTeamTool.description];

    for (const text of texts) expect(text).not.toContain("admin rights");
    expect(manageTeamTool.description).toContain("invite requires create permission on users");
    expect(manageTeamTool.description).toContain("update_member requires update permission");
  });
});
