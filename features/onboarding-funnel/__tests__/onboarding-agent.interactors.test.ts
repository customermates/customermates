import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { createMockUser } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);

import { RecordAgentFirstCallInteractor } from "../record-agent-first-call.interactor";

const owner = createMockUser({ onboardingWizardCompletedAt: null });
let workspaces = 0;

describe("RecordAgentFirstCallInteractor", () => {
  let repo: { recordAgentFirstCall: ReturnType<typeof vi.fn>; recordAgentCall: ReturnType<typeof vi.fn> };
  let recordingOwner = owner;

  beforeEach(() => {
    workspaces += 1;
    recordingOwner = createMockUser({
      onboardingWizardCompletedAt: null,
      companyId: `first-call-workspace-${workspaces}`,
    });
    (MOCK_ENV_MODULE.env as { APP_MODE: "cloud" | "demo" | "self-hosted" }).APP_MODE = "cloud";
    repo = {
      recordAgentFirstCall: vi.fn().mockResolvedValue(true),
      recordAgentCall: vi.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stamps the latest agent call at most once an hour per workspace", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-13T10:00:00.000Z"));
    await record();
    await record();
    expect(repo.recordAgentCall).toHaveBeenCalledOnce();
    expect(repo.recordAgentCall).toHaveBeenCalledWith(new Date("2026-11-13T09:00:00.000Z"));

    vi.setSystemTime(new Date("2026-11-13T11:00:01.000Z"));
    await record();
    expect(repo.recordAgentCall).toHaveBeenCalledTimes(2);
  });

  const record = (user = recordingOwner) =>
    runWithTenant(user, () => new RecordAgentFirstCallInteractor(repo as never).invoke());

  it("records the first authenticated call of a workspace", async () => {
    await expect(record()).resolves.toEqual({ ok: true, data: { recorded: true } });
    expect(repo.recordAgentFirstCall).toHaveBeenCalledOnce();
  });

  it("asks the database once per workspace and process, then answers from memory", async () => {
    await record();
    await expect(record()).resolves.toEqual({ ok: true, data: { recorded: false } });
    await record();

    expect(repo.recordAgentFirstCall).toHaveBeenCalledOnce();
  });

  it("keeps workspaces apart", async () => {
    await record();
    await record(createMockUser({ companyId: "another-company" }));

    expect(repo.recordAgentFirstCall).toHaveBeenCalledTimes(2);
  });

  it("reports a call that was already stored by an earlier process without writing twice", async () => {
    repo.recordAgentFirstCall.mockResolvedValue(false);

    await expect(record()).resolves.toEqual({ ok: true, data: { recorded: false } });
    await record();

    expect(repo.recordAgentFirstCall).toHaveBeenCalledOnce();
  });

  it("does not remember a workspace when the write failed", async () => {
    repo.recordAgentFirstCall.mockRejectedValueOnce(new Error("database is down"));

    await expect(record()).rejects.toThrow("database is down");
    await expect(record()).resolves.toEqual({ ok: true, data: { recorded: true } });
    expect(repo.recordAgentFirstCall).toHaveBeenCalledTimes(2);
  });
});
