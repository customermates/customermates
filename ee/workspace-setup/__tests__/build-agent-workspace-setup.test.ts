import { describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";
import { createMockUser } from "@/tests/helpers/mock-user";

vi.mock("@/env", () => ({ env: { ...MOCK_ENV_MODULE.env, APP_MODE: "cloud" } }));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/core/observability/server", () => ({ captureException: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));

import type { WorkspaceSetupPatch, WorkspaceSetupRecord } from "../workspace-setup.schema";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { createZodError } from "@/core/validation/validation.utils";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { BuildAgentWorkspaceSetupInteractor } from "../build-agent-workspace-setup.interactor";
import { ConfirmWorkspaceSetupInteractor } from "../confirm-workspace-setup.interactor";
import { AGENT_SETUP_DESCRIPTION_QUESTION } from "../start-agent-workspace-setup.interactor";

const SETUP_ID = "5d0b1f9e-2c6a-4f43-9a1e-7b3c2d4e5f60";

function harness(options: { agent: boolean; status?: string }) {
  let setup = {
    id: SETUP_ID,
    status: options.status ?? "planned",
    planRevision: 3,
    plan: {},
    answers: {},
    phases: {},
    interview: {
      followUpQuestions: options.agent
        ? [{ id: "followUp1", label: AGENT_SETUP_DESCRIPTION_QUESTION, format: "shortText", maxLength: 1000 }]
        : [{ id: "followUp1", label: "Which services do you sell?", format: "shortText", maxLength: 200 }],
    },
  } as unknown as WorkspaceSetupRecord;
  const repo = {
    get: vi.fn(() => Promise.resolve(setup)),
    mutate: vi.fn((_id: string, change: (current: WorkspaceSetupRecord) => WorkspaceSetupPatch | null) => {
      const patch = change(setup);
      if (patch) setup = { ...setup, ...patch };
      return Promise.resolve({ setup, changed: Boolean(patch) });
    }),
  };
  const background = { dispatch: vi.fn(() => Promise.resolve()) };
  const confirm = new ConfirmWorkspaceSetupInteractor(
    repo as never,
    background,
    { findCompanyOrThrow: vi.fn(() => Promise.resolve({ id: "company-1", name: "Named" })) } as never,
    { invoke: vi.fn() },
    { require: vi.fn(() => Promise.resolve(null)) },
  );
  const interactor = new BuildAgentWorkspaceSetupInteractor(repo, confirm);
  const invoke = () => runWithTenant(createMockUser(), () => interactor.invoke({ setupId: SETUP_ID }));
  return { invoke, background, current: () => setup };
}

describe("building a setup an agent started", () => {
  it("confirms the ready plan of a setup create_workspace started and starts its build", async () => {
    const { invoke, background, current } = harness({ agent: true });

    expect(await invoke()).toEqual({ ok: true, data: { building: true } });

    expect(current().status).toBe("building");
    expect(background.dispatch).toHaveBeenCalledExactlyOnceWith("build-workspace-setup", {
      setupId: SETUP_ID,
      userId: expect.any(String),
    });
  });

  it("never starts a second build when the plan-ready step runs again", async () => {
    const { invoke, background } = harness({ agent: true });

    await invoke();
    expect(await invoke()).toEqual({ ok: true, data: { building: true } });

    expect(background.dispatch).toHaveBeenCalledOnce();
  });

  it("leaves a plan the owner started in the app waiting for the owner's confirmation", async () => {
    const { invoke, background, current } = harness({ agent: false });

    expect(await invoke()).toEqual({ ok: true, data: { building: false } });

    expect(current().status).toBe("planned");
    expect(background.dispatch).not.toHaveBeenCalled();
  });

  it("starts nothing for an agent setup whose plan is not ready", async () => {
    const { invoke, background } = harness({ agent: true, status: "interview" });

    expect(await invoke()).toEqual({ ok: true, data: { building: false } });
    expect(background.dispatch).not.toHaveBeenCalled();
  });

  it("returns the refusal of the confirmation so the planning run can report it", async () => {
    const refusal = createZodError("Mate is not included in this plan.", [], {
      error: CustomErrorCode.permissionDenied,
    });
    const repo = {
      get: vi.fn(() => Promise.resolve(harness({ agent: true }).current())),
    };
    const interactor = new BuildAgentWorkspaceSetupInteractor(repo, {
      invoke: vi.fn(() => Promise.resolve({ ok: false as const, error: refusal })),
    });

    const result = await runWithTenant(createMockUser(), () => interactor.invoke({ setupId: SETUP_ID }));

    expect(result).toEqual({ ok: false, error: refusal });
  });
});
