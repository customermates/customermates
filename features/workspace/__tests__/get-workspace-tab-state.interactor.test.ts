import { beforeEach, describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("next-intl/server", () => ({ getTranslations: () => Promise.resolve({ raw: (key: string) => key }) }));

import { interactorFailureCodes } from "@/core/validation/validation.utils";

import { GetWorkspaceTabStateInteractor } from "../get-workspace-tab-state.interactor";

async function codes(result: Promise<{ ok: boolean; error?: unknown }>) {
  const resolved = await result;
  return resolved.ok ? [] : interactorFailureCodes(resolved.error as never);
}

const RENDERED = "6f1f8b8e-0d3c-4c59-9a55-3b7f4f3f0a11";
const OTHER = "0b9a7f4e-5d1c-4e8a-8f7e-2c6d5b4a3f22";

describe("GetWorkspaceTabStateInteractor", () => {
  const authService = { getInteractiveSession: vi.fn(), getCredentialWorkspace: vi.fn() };
  const memberships = { findMembershipUnscoped: vi.fn() };
  const companies = { existsUnscoped: vi.fn() };

  function state(companyId = RENDERED) {
    return new GetWorkspaceTabStateInteractor(authService as never, memberships as never, companies as never).invoke({
      companyId,
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    authService.getInteractiveSession.mockResolvedValue({
      user: { email: "ben@example.invalid" },
      session: { id: "s" },
    });
    authService.getCredentialWorkspace.mockResolvedValue({
      kind: "session",
      sessionId: "s",
      companyId: RENDERED,
      documentRequest: false,
    });
    memberships.findMembershipUnscoped.mockResolvedValue({ companyId: RENDERED });
    companies.existsUnscoped.mockResolvedValue(true);
  });

  it("confirms the workspace the tab shows while the session is still in it", async () => {
    await expect(state()).resolves.toEqual({ ok: true, data: { state: "current" } });
  });

  it("reports a change when the session moved to another workspace", async () => {
    authService.getCredentialWorkspace.mockResolvedValue({
      kind: "session",
      sessionId: "s",
      companyId: OTHER,
      documentRequest: false,
    });

    expect(await codes(state())).toEqual(["workspaceChanged"]);
  });

  it("reports a change when the person lost the membership of a workspace that still exists", async () => {
    memberships.findMembershipUnscoped.mockResolvedValue(null);

    expect(await codes(state())).toEqual(["workspaceChanged"]);
  });

  it("reports the deletion when the workspace the tab shows no longer exists", async () => {
    authService.getCredentialWorkspace.mockResolvedValue({
      kind: "session",
      sessionId: "s",
      companyId: null,
      documentRequest: false,
    });
    memberships.findMembershipUnscoped.mockResolvedValue(null);
    companies.existsUnscoped.mockResolvedValue(false);

    await expect(state()).resolves.toEqual({ ok: true, data: { state: "deleted" } });
  });
});
