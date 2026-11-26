import { beforeEach, describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";
import { createMockUser } from "@/tests/helpers/mock-user";

const env = vi.hoisted(() => ({ APP_MODE: "self-hosted" as "self-hosted" | "demo" | "cloud" }));

vi.mock("@/env", () => ({
  env: {
    ...MOCK_ENV_MODULE.env,
    get APP_MODE() {
      return env.APP_MODE;
    },
  },
}));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));

import { runWithTenant } from "@/core/decorators/tenant-context";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { interactorFailureCodes } from "@/core/validation/validation.utils";
import { countryCodeFor, localeDefaultCurrency } from "@/i18n/locale-registry";
import type { TeamSize } from "@/features/onboarding-funnel/team-size";

import { GetWorkspaceSetupStatusInteractor } from "../get-workspace-setup-status.interactor";
import { StartWorkspaceSetupInteractor } from "../start-workspace-setup.interactor";

const owner = createMockUser();

function interactors() {
  const repo = { findCurrent: vi.fn(), create: vi.fn() };
  const funnel = { findOnboardingJobChoice: vi.fn(() => Promise.resolve({ teamSize: null as TeamSize | null })) };
  const company = { name: null as string | null };
  const usage = { workspacePlatformSpend: vi.fn() };
  const records = {
    getModel: vi.fn(() =>
      Promise.resolve({ revision: 0, types: [] as Array<{ id: string; archived: boolean; embedded: boolean }> }),
    ),
  };
  const entitlements = { require: vi.fn(() => Promise.resolve(null)) };
  return {
    repo,
    records,
    funnel,
    company,
    start: new StartWorkspaceSetupInteractor(
      repo as never,
      {
        findCompanyOrThrow: () =>
          Promise.resolve({ id: "company-1", name: company.name, createdAt: new Date(0), updatedAt: new Date(0) }),
      },
      funnel as never,
      entitlements,
    ),
    entitlements,
    status: new GetWorkspaceSetupStatusInteractor(repo as never, usage, records as never),
  };
}

describe("workspace setup availability", () => {
  beforeEach(() => {
    env.APP_MODE = "self-hosted";
  });

  it("is unavailable on a self-hosted instance and starts nothing", async () => {
    const { start, status, repo } = interactors();
    const started = await runWithTenant(owner, () => start.invoke({}));
    expect(started.ok).toBe(false);
    if (!started.ok) expect(interactorFailureCodes(started.error)).toEqual([CustomErrorCode.workspaceSetupUnavailable]);
    expect(await runWithTenant(owner, () => status.invoke())).toEqual({
      ok: true,
      data: { available: false, reason: "selfHosted", setup: null },
    });
    expect(repo.findCurrent).not.toHaveBeenCalled();
  });

  it("refuses to start in demo mode but still reports itself unavailable", async () => {
    env.APP_MODE = "demo";
    const { start, status } = interactors();
    await expect(runWithTenant(owner, () => start.invoke({}))).rejects.toThrow();
    expect(await runWithTenant(owner, () => status.invoke())).toEqual({
      ok: true,
      data: { available: false, reason: "demo", setup: null },
    });
  });

  it("skips the setup for a workspace that already has lists but never ran it", async () => {
    env.APP_MODE = "cloud";
    const { status, repo, records } = interactors();
    repo.findCurrent.mockResolvedValue(null);
    expect(await runWithTenant(owner, () => status.invoke())).toEqual({
      ok: true,
      data: { available: true, setup: null },
    });
    const list = (state: { archived?: boolean; embedded?: boolean }) => ({
      id: "list",
      archived: state.archived ?? false,
      embedded: state.embedded ?? false,
    });
    records.getModel.mockResolvedValue({ revision: 2, types: [list({ archived: true }), list({ embedded: true })] });
    expect(await runWithTenant(owner, () => status.invoke())).toMatchObject({ data: { available: true } });
    records.getModel.mockResolvedValue({ revision: 3, types: [list({})] });
    expect(await runWithTenant(owner, () => status.invoke())).toEqual({
      ok: true,
      data: { available: false, reason: "configured", setup: null },
    });
  });

  it("seeds the answers the profile already gave without asking again", async () => {
    env.APP_MODE = "cloud";
    const { start, repo, funnel, company } = interactors();
    repo.findCurrent.mockResolvedValue(null);
    repo.create.mockResolvedValue({ id: "setup-1" });
    company.name = " Acme Studio ";
    funnel.findOnboardingJobChoice.mockResolvedValue({ teamSize: "medium" });
    const choice = (value: string) => ({ source: "user", confidence: 1, value: { format: "singleChoice", value } });
    expect(await runWithTenant(owner, () => start.invoke({ locale: "de" }))).toEqual({
      ok: true,
      data: { setupId: "setup-1" },
    });
    expect(repo.create).toHaveBeenCalledWith({
      templateSlug: null,
      answers: {
        language: choice("de"),
        currency: choice(localeDefaultCurrency("de")),
        country: choice(countryCodeFor("de")),
        teamSize: choice("large"),
        companyName: { source: "user", confidence: 1, value: { format: "shortText", value: "Acme Studio" } },
      },
    });
  });

  it("maps the profile team size and leaves out what the profile did not give", async () => {
    env.APP_MODE = "cloud";
    const { start, repo, funnel } = interactors();
    repo.findCurrent.mockResolvedValue(null);
    repo.create.mockResolvedValue({ id: "setup-1" });
    for (const [teamSize, expected] of [
      ["solo", "solo"],
      ["small", "small"],
      ["large", "large"],
      [null, undefined],
    ] as const) {
      funnel.findOnboardingJobChoice.mockResolvedValue({ teamSize });
      await runWithTenant(owner, () => start.invoke({}));
      const answers = repo.create.mock.lastCall?.[0].answers;
      expect(answers.teamSize?.value.value).toBe(expected);
      expect(answers.companyName).toBeUndefined();
      expect(answers.language.value.value).toBe("en");
    }
  });

  it("refuses a workspace without a usable subscription before creating or spending anything", async () => {
    env.APP_MODE = "cloud";
    const { start, repo, entitlements } = interactors();
    const denial = {
      ok: false as const,
      error: new Error("paid subscription required"),
      code: "paidSubscriptionRequired",
    };
    entitlements.require.mockResolvedValueOnce(denial as never);
    const started = await runWithTenant(owner, () => start.invoke({}));
    expect(started).toBe(denial);
    expect(entitlements.require).toHaveBeenCalledWith("agentChat");
    expect(repo.create).not.toHaveBeenCalled();
  });
});
