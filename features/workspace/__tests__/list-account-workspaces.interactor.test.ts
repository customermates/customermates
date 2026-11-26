import { beforeEach, describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));

import { ListAccountWorkspacesInteractor } from "../list-account-workspaces.interactor";

const env = MOCK_ENV_MODULE.env as { APP_MODE: "cloud" | "demo" | "self-hosted" };
const facts = {
  plan: "pro" as const,
  onFreePlan: false,
  trialDaysLeft: 5,
  lostOnFree: [{ kind: "accounts" as const, count: 1 }],
  keepsItRunning: "pro" as const,
  choosePlanUrl: "https://app.example/w/acme/settings/billing",
};

function option(companyId: string, unavailableReason: "pending" | "permission" | null = null) {
  return {
    companyId,
    name: companyId.toUpperCase(),
    slug: `slug-${companyId}`,
    roleName: "Admin",
    isAdmin: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    subscription: null,
    unavailableReason,
  };
}

describe("ListAccountWorkspacesInteractor", () => {
  const authService = { getMcpCredential: vi.fn() };
  const access = { listWorkspaces: vi.fn() };
  const planFacts = { factsFor: vi.fn() };
  const usage = { countRecordsUnscoped: vi.fn() };

  function interactor() {
    return new ListAccountWorkspacesInteractor(authService, access, planFacts, usage);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    env.APP_MODE = "cloud";
    authService.getMcpCredential.mockResolvedValue({
      credential: "bearer",
      email: "member@example.com",
      companyId: null,
      agentJobKey: null,
    });
    access.listWorkspaces.mockResolvedValue([option("acme"), option("empty"), option("waiting", "pending")]);
    usage.countRecordsUnscoped.mockImplementation((companyId: string) =>
      Promise.resolve(companyId === "acme" ? 12 : 0),
    );
    planFacts.factsFor.mockResolvedValue(facts);
  });

  it("lists every workspace of the account with its role, setup state, plan facts and usability", async () => {
    const result = await interactor().invoke();

    expect(result).toEqual({
      ok: true,
      data: {
        canCreateWorkspace: true,
        workspaces: [
          expect.objectContaining({
            slug: "slug-acme",
            role: "Admin",
            setUp: true,
            records: 12,
            usable: true,
            plan: facts,
          }),
          expect.objectContaining({ slug: "slug-empty", setUp: false, records: 0, usable: true, plan: facts }),
          expect.objectContaining({
            slug: "slug-waiting",
            setUp: null,
            records: null,
            usable: false,
            unavailableReason: "pending",
            unavailableExplanation: expect.stringContaining("waiting for approval"),
            plan: null,
          }),
        ],
      },
    });
    expect(access.listWorkspaces).toHaveBeenCalledWith("member@example.com");
    expect(planFacts.factsFor).not.toHaveBeenCalledWith(expect.objectContaining({ companyId: "waiting" }));
  });

  it("lists only the key's own workspace for an API key and offers no new workspace", async () => {
    authService.getMcpCredential.mockResolvedValue({
      credential: "apiKey",
      email: "member@example.com",
      companyId: "empty",
      agentJobKey: null,
    });

    const result = await interactor().invoke();

    expect(result.ok && result.data.workspaces.map((workspace) => workspace.companyId)).toEqual(["empty"]);
    expect(result.ok && result.data.canCreateWorkspace).toBe(false);
  });

  it("offers no new workspace outside Cloud", async () => {
    env.APP_MODE = "self-hosted";
    planFacts.factsFor.mockResolvedValue(null);

    const result = await interactor().invoke();

    expect(result.ok && result.data.canCreateWorkspace).toBe(false);
    expect(result.ok && result.data.workspaces[0]?.plan).toBeNull();
  });

  it("refuses without a credential", async () => {
    authService.getMcpCredential.mockResolvedValue(null);

    await expect(interactor().invoke()).resolves.toMatchObject({ ok: false });
  });
});
