import type { WorkspacePlanService } from "@/ee/subscription/workspace-plan.service";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import {
  createMockDiModule,
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: (namespace?: string) => {
    const t = (key: string) => (namespace ? `${namespace}.${key}` : key);
    return Promise.resolve(Object.assign(t, { raw: t }));
  },
  getLocale: () => Promise.resolve("en"),
}));

import { CustomErrorCode } from "@/core/validation/validation.types";

import { agentRunnerTokenFromHeader, hashAgentRunnerToken } from "../agent-runner-token";
import { AGENT_RUNNER_LIMITS } from "../agent-runner.schema";
import { CreateAgentRunnerInteractor } from "../create-agent-runner.interactor";
import { GetAgentRunnersInteractor } from "../get-agent-runners.interactor";
import { RevokeAgentRunnerInteractor } from "../revoke-agent-runner.interactor";

import { RUNNER_ID } from "./agent-runner-fixtures";
import { FakeAgentRunnerRepo } from "./fake-agent-runner-repo";

const NOW = new Date("2026-11-17T09:00:00.000Z");

function plans(allowed = true) {
  return { canCreateIntegrations: vi.fn().mockResolvedValue(allowed) } as Pick<
    WorkspacePlanService,
    "canCreateIntegrations"
  >;
}

function errorCode(result: { ok: boolean; error?: { issues: Array<{ params?: unknown }> } }) {
  return (result.error?.issues[0]?.params as { error?: string } | undefined)?.error;
}

beforeEach(() => vi.clearAllMocks());

describe("CreateAgentRunnerInteractor", () => {
  it("creates a runner and returns its token once, storing only the token's hash", async () => {
    const repo = new FakeAgentRunnerRepo();
    const createRunner = vi.spyOn(repo, "createRunner");
    const interactor = new CreateAgentRunnerInteractor(
      repo,
      plans(),
      { baseUrl: "https://app.example.test/" },
      () => NOW,
    );

    const result = await interactor.invoke({ name: "  Office laptop  " });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { token, url, runner } = result.data;
    expect(agentRunnerTokenFromHeader(`Bearer ${token}`)).toBe(token);
    expect(url).toBe("https://app.example.test");
    expect(runner).toMatchObject({ id: RUNNER_ID, name: "Office laptop", online: false, lastSeenAt: null });
    expect(createRunner).toHaveBeenCalledWith({ name: "Office laptop", tokenHash: hashAgentRunnerToken(token) });
    expect(JSON.stringify(createRunner.mock.calls)).not.toContain(token);
    expect(JSON.stringify(runner)).not.toContain(token);
  });

  it("rejects a blank or over-long name without creating anything", async () => {
    const repo = new FakeAgentRunnerRepo();
    const createRunner = vi.spyOn(repo, "createRunner");
    const interactor = new CreateAgentRunnerInteractor(repo, plans(), { baseUrl: "https://app.example.test" });

    expect((await interactor.invoke({ name: "   " })).ok).toBe(false);
    expect((await interactor.invoke({ name: "x".repeat(AGENT_RUNNER_LIMITS.nameMaxLength + 1) })).ok).toBe(false);
    expect(createRunner).not.toHaveBeenCalled();
  });

  it("refuses while the workspace has no usable plan, like an API key", async () => {
    const repo = new FakeAgentRunnerRepo();
    const createRunner = vi.spyOn(repo, "createRunner");
    const interactor = new CreateAgentRunnerInteractor(repo, plans(false), { baseUrl: "https://app.example.test" });

    const result = await interactor.invoke({ name: "Office laptop" });

    expect(result.ok).toBe(false);
    expect(errorCode(result as never)).toBe(CustomErrorCode.workspacePlanRequired);
    expect(createRunner).not.toHaveBeenCalled();
  });
});

describe("GetAgentRunnersInteractor", () => {
  it("marks a runner online only when it was seen within two minutes and is not revoked", async () => {
    const repo = new FakeAgentRunnerRepo();
    const ago = (ms: number) => new Date(NOW.getTime() - ms);
    repo.addRunner({
      id: "00000000-0000-4000-8000-000000000001",
      name: "fresh",
      lastSeenAt: ago(60_000),
      clients: [{ name: "claude", version: "2.1.0" }],
      machine: "ws-main",
    });
    repo.addRunner({ id: "00000000-0000-4000-8000-000000000002", name: "edge", lastSeenAt: ago(120_000) });
    repo.addRunner({ id: "00000000-0000-4000-8000-000000000003", name: "stale", lastSeenAt: ago(120_001) });
    repo.addRunner({ id: "00000000-0000-4000-8000-000000000004", name: "never" });
    repo.addRunner({
      id: "00000000-0000-4000-8000-000000000005",
      name: "revoked",
      lastSeenAt: ago(1_000),
      revokedAt: ago(500),
    });
    const interactor = new GetAgentRunnersInteractor(repo, () => NOW);

    const result = await interactor.invoke();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.runners.map((runner) => [runner.name, runner.online])).toEqual([
      ["fresh", true],
      ["edge", true],
      ["stale", false],
      ["never", false],
      ["revoked", false],
    ]);
    expect(result.data.runners[0]).toMatchObject({
      machine: "ws-main",
      clients: [{ name: "claude", version: "2.1.0" }],
      lastSeenAt: ago(60_000).toISOString(),
    });
    expect(result.data.runners[4].revokedAt).toBe(ago(500).toISOString());
  });

  it("never exposes the token hash and tolerates malformed stored clients", async () => {
    const repo = new FakeAgentRunnerRepo();
    repo.addRunner({ clients: [{ name: "vim", version: 3 }] });

    const result = await new GetAgentRunnersInteractor(repo, () => NOW).invoke();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.runners[0].clients).toEqual([]);
    expect(JSON.stringify(result.data)).not.toContain("tokenHash");
  });
});

describe("RevokeAgentRunnerInteractor", () => {
  it("revokes a runner of this workspace and keeps the first revocation time on a repeat", async () => {
    const repo = new FakeAgentRunnerRepo();
    repo.addRunner();
    const first = await new RevokeAgentRunnerInteractor(repo, () => NOW).invoke({ id: RUNNER_ID });
    const later = new Date(NOW.getTime() + 60_000);
    const second = await new RevokeAgentRunnerInteractor(repo, () => later).invoke({ id: RUNNER_ID });

    expect(first).toEqual({ ok: true, data: { id: RUNNER_ID, revokedAt: NOW.toISOString() } });
    expect(second).toEqual({ ok: true, data: { id: RUNNER_ID, revokedAt: NOW.toISOString() } });
    expect(repo.runners.get(RUNNER_ID)?.revokedAt).toEqual(NOW);
  });

  it("answers not found for a runner that does not exist in this workspace", async () => {
    const repo = new FakeAgentRunnerRepo();

    const result = await new RevokeAgentRunnerInteractor(repo, () => NOW).invoke({ id: RUNNER_ID });

    expect(result.ok).toBe(false);
    expect(errorCode(result as never)).toBe(CustomErrorCode.agentRunnerNotFound);
  });

  it("rejects an id that is not a uuid", async () => {
    const result = await new RevokeAgentRunnerInteractor(new FakeAgentRunnerRepo(), () => NOW).invoke({
      id: "not-a-uuid",
    });

    expect(result.ok).toBe(false);
  });
});
