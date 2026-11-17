import { describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { MOCK_PRISMA_DB_MODULE, MOCK_ZOD_MODULE, createMockDiModule } from "@/tests/helpers/interactor-test-setup";

const mockEnv = vi.hoisted(() => ({
  NODE_ENV: "test" as const,
  APP_MODE: "cloud" as const,
  BASE_URL: "http://localhost:4000",
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  BETTER_AUTH_SECRET: "a-long-test-only-authentication-secret",
  SECRET_BOX_KEY: undefined as string | undefined,
}));
const sentry = vi.hoisted(() => ({ captureException: vi.fn() }));

const OWNER = "00000000-0000-4000-8000-000000000010";
const COMPANY = "00000000-0000-4000-8000-000000000011";
const mockUser = createMockUser({ id: OWNER, companyId: COMPANY, firstName: "Ada", lastName: "Lovelace" });

vi.mock("@/env", () => ({ env: mockEnv }));
vi.mock("@/core/observability/server", () => sentry);
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

import type { AgentJobLoopOutcome } from "../run-agent-job-loop";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { sealSecret } from "@/core/security/secret-box";
import { FakeAgentJobRepo } from "@/features/agent-jobs/__tests__/fake-agent-job-repo";
import { FakeAgentProviderKeyRepo } from "@/ee/agent-keys/__tests__/fake-agent-provider-key-repo";
import { RunAgentJobInteractor } from "../run-agent-job.interactor";

const NOW = new Date("2026-11-17T12:00:00.000Z");
const STEP = {
  tokens: { inputTokens: 1000, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0 },
  providerMetadata: undefined,
};
const FINISHED: AgentJobLoopOutcome = { kind: "finished", text: "Done.", reason: "stop", steps: [STEP] };

async function world(loop: (jobs: FakeAgentJobRepo) => Promise<AgentJobLoopOutcome>) {
  const jobs = new FakeAgentJobRepo();
  const keys = new FakeAgentProviderKeyRepo();
  await keys.upsert({
    provider: "anthropic",
    label: "Production",
    keyCiphertext: sealSecret("sk-ant-api03-SECRETVALUE-9876"),
    keyLast4: "9876",
    defaultModel: "claude-haiku-5-5",
    validatedAt: NOW,
  });
  const toolkit = vi.fn().mockReturnValue({ tools: {}, activeToolNames: () => [] });
  const interactor = new RunAgentJobInteractor(
    jobs,
    keys,
    { findRunUnscoped: vi.fn().mockResolvedValue(null) } as never,
    { reserve: vi.fn(), settle: vi.fn(), release: vi.fn() } as never,
    vi.fn().mockReturnValue({ fake: "model" }),
    toolkit,
    (() => loop(jobs)) as never,
    () => NOW,
  );
  const run = (jobId: string) => runWithTenant(mockUser, () => interactor.invoke({ jobId } as never));
  return { jobs, toolkit, run };
}

describe("a hosted agent job and the queue", () => {
  it("cannot close or write into the job once a second attempt holds it", async () => {
    let jobId = "";
    const { jobs, run } = await world(async (repo) => {
      // The first attempt outlives its timeout: the sweep re-queues the job and a second attempt claims it.
      const stale = repo.jobs.get(jobId);
      if (!stale) throw new Error("The job is missing");
      repo.jobs.set(jobId, { ...stale, status: "queued" });
      await repo.claimUnscoped({ companyId: COMPANY, runtime: "ownKey", jobId, now: NOW, timeoutAt: NOW });
      return FINISHED;
    });
    jobId = jobs.add({ runtime: "ownKey" }).id;

    await run(jobId);

    expect(jobs.jobs.get(jobId)).toMatchObject({ status: "claimed", attempts: 2, finishedAt: null, result: null });
    expect(jobs.events.get(jobId) ?? []).toEqual([]);
  });

  it("builds the tools of a run with the rule chain stored on the job", async () => {
    const chain = ["00000000-0000-4000-8000-0000000000d1", "00000000-0000-4000-8000-0000000000d2"];
    const { jobs, toolkit, run } = await world(() => Promise.resolve(FINISHED));
    const job = jobs.add({ runtime: "ownKey", ruleChain: chain });

    await run(job.id);

    expect(toolkit).toHaveBeenCalledTimes(1);
    expect(toolkit.mock.calls[0][0]).toMatchObject({ ruleChain: chain, maxToolCalls: 25 });
    expect(jobs.jobs.get(job.id)?.status).toBe("succeeded");
  });
});
