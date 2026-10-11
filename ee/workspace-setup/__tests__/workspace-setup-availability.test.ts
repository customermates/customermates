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

import { GetWorkspaceSetupStatusInteractor } from "../get-workspace-setup-status.interactor";
import { StartWorkspaceSetupInteractor } from "../start-workspace-setup.interactor";

const owner = createMockUser();

function interactors() {
  const repo = { findCurrent: vi.fn(), create: vi.fn() };
  const crawls = { start: vi.fn() };
  const background = { dispatch: vi.fn() };
  const usage = { workspacePlatformSpend: vi.fn() };
  return {
    repo,
    crawls,
    background,
    start: new StartWorkspaceSetupInteractor(repo as never, crawls, background),
    status: new GetWorkspaceSetupStatusInteractor(repo as never, usage),
  };
}

describe("workspace setup availability", () => {
  beforeEach(() => {
    env.APP_MODE = "self-hosted";
  });

  it("is unavailable on a self-hosted instance and starts nothing", async () => {
    const { start, status, repo, crawls, background } = interactors();
    const started = await runWithTenant(owner, () => start.invoke({ websiteUrl: "https://studio.example" }));
    expect(started.ok).toBe(false);
    if (!started.ok) expect(interactorFailureCodes(started.error)).toEqual([CustomErrorCode.workspaceSetupUnavailable]);
    expect(await runWithTenant(owner, () => status.invoke())).toEqual({
      ok: true,
      data: { available: false, reason: "selfHosted", setup: null },
    });
    expect(repo.findCurrent).not.toHaveBeenCalled();
    expect(crawls.start).not.toHaveBeenCalled();
    expect(background.dispatch).not.toHaveBeenCalled();
  });

  it("refuses to start in demo mode but still reports itself unavailable", async () => {
    env.APP_MODE = "demo";
    const { start, status } = interactors();
    await expect(runWithTenant(owner, () => start.invoke({ websiteUrl: null }))).rejects.toThrow();
    expect(await runWithTenant(owner, () => status.invoke())).toEqual({
      ok: true,
      data: { available: false, reason: "demo", setup: null },
    });
  });

  it("rejects a website that is not a public homepage before creating anything", async () => {
    env.APP_MODE = "cloud";
    const { start, repo } = interactors();
    const started = await runWithTenant(owner, () => start.invoke({ websiteUrl: "http://127.0.0.1/admin" }));
    expect(started.ok).toBe(false);
    if (!started.ok) expect(interactorFailureCodes(started.error)).toEqual([CustomErrorCode.invalidUrl]);
    expect(repo.create).not.toHaveBeenCalled();
  });
});
