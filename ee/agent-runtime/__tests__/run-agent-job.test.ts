import { beforeEach, describe, expect, it, vi } from "vitest";

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

import type { AgentTurnBudget } from "@/ee/agent-chat/agent-budget-policy";
import type { AgentJobLoopOutcome } from "../run-agent-job-loop";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { sealSecret } from "@/core/security/secret-box";
import { FakeAgentJobRepo } from "@/features/agent-jobs/__tests__/fake-agent-job-repo";
import { FakeAgentProviderKeyRepo } from "@/ee/agent-keys/__tests__/fake-agent-provider-key-repo";
import { agentProviderKeyBinding } from "@/ee/agent-keys/agent-provider-key-binding";
import { RunAgentJobInteractor } from "../run-agent-job.interactor";

const NOW = new Date("2026-11-17T12:00:00.000Z");
const PLAIN_KEY = "sk-ant-api03-SECRETVALUE-9876";
const BUDGET: AgentTurnBudget = {
  modelSpec: "anthropic/claude-haiku-5.5",
  servingProvider: "vertexAnthropic",
  inferenceRegion: "eu",
  reservedMicrocents: 1_000_000,
  roundReserveMicrocents: 300_000,
  maxOutputTokens: 8192,
  maxContextTokens: 65_000,
  maxContextBytes: 195_000,
  maxToolResultChars: 6000,
};
const STEP = {
  tokens: { inputTokens: 1000, outputTokens: 100, cacheReadTokens: 50, cacheWriteTokens: 0 },
  providerMetadata: undefined,
};

const CEILING = 10_000_000;

function finished(overrides: Partial<Extract<AgentJobLoopOutcome, { kind: "finished" }>> = {}): AgentJobLoopOutcome {
  return { kind: "finished", text: "Created one action.", reason: "stop", steps: [STEP], auxiliary: [], ...overrides };
}

function failed(error: unknown, steps: AgentJobLoopOutcome["steps"] = []): AgentJobLoopOutcome {
  return { kind: "failed", error, steps, auxiliary: [] };
}

async function world() {
  const jobs = new FakeAgentJobRepo();
  const keys = new FakeAgentProviderKeyRepo();
  await keys.upsert({
    provider: "anthropic",
    label: "Production",
    keyCiphertext: sealSecret(PLAIN_KEY, agentProviderKeyBinding(COMPANY, "anthropic")),
    keyLast4: "9876",
    defaultModel: "claude-haiku-5-5",
    validatedAt: NOW,
  });
  const credits = {
    reserve: vi.fn().mockResolvedValue({
      ok: true,
      reservation: {
        reservationId: "agent-job:x:1",
        budget: BUDGET,
        reservedMicrocents: BUDGET.reservedMicrocents,
        ceilingMicrocents: CEILING,
      },
    }),
    settle: vi.fn().mockResolvedValue(true),
    release: vi.fn().mockResolvedValue(undefined),
    admitRound: vi.fn().mockResolvedValue(true),
    extend: vi
      .fn()
      .mockImplementation(({ requiredMicrocents }: { requiredMicrocents: number }) =>
        Promise.resolve({ disposition: "extended", reservedMicrocents: requiredMicrocents }),
      ),
  };
  const createModel = vi.fn().mockReturnValue({ fake: "model" });
  const loop = vi.fn().mockImplementation(() => Promise.resolve(finished()));
  const toolkit = vi.fn().mockReturnValue({ tools: {}, activeToolNames: () => [] });
  const rules = { findRunUnscoped: vi.fn().mockResolvedValue({ rule: { name: "Follow up on offers" } }) };
  const interactor = new RunAgentJobInteractor(
    jobs,
    keys,
    rules as never,
    credits as never,
    createModel,
    toolkit,
    loop as never,
    () => NOW,
  );
  const run = (jobId: string, user = mockUser) => runWithTenant(user, () => interactor.invoke({ jobId } as never));
  return { jobs, keys, credits, createModel, loop, toolkit, rules, run };
}

describe("running an agent job on the workspace's own key", () => {
  beforeEach(() => {
    sentry.captureException.mockClear();
  });

  it("opens the key for this run only, runs the model and records the finished job", async () => {
    const { jobs, keys, createModel, loop, run } = await world();
    const job = jobs.add({ runtime: "ownKey", sourceId: "00000000-0000-4000-8000-0000000000a1" });

    const outcome = await run(job.id);

    expect(outcome).toEqual({ ok: true, data: { status: "succeeded" } });
    expect(createModel).toHaveBeenCalledWith("anthropic", PLAIN_KEY, "claude-haiku-5-5");
    expect(loop).toHaveBeenCalledTimes(1);
    const input = loop.mock.calls[0][0];
    expect(input.system).toContain("Follow up on offers");
    expect(input.system).toContain("at most 25 tool calls and 10 minutes");
    expect(input.prompt).toBe("Do the thing");
    expect(input.maxToolCalls).toBe(25);
    expect(input.wallMs).toBe(600_000);
    expect(input.admitRound).toBeUndefined();
    expect(input.limits).toBeUndefined();

    expect(jobs.jobs.get(job.id)).toMatchObject({
      status: "succeeded",
      attempts: 1,
      error: null,
      inputTokens: 1050,
      outputTokens: 100,
      costMicrocents: null,
      result: { text: "Created one action.", reason: "stop", toolCalls: 0 },
    });
    expect(jobs.events.get(job.id)?.map((event) => (event as { type: string }).type)).toEqual(["message", "finish"]);
    expect([...keys.rows.values()][0].lastUsedAt).toEqual(NOW);
  });

  it("picks the provider of the requested model and falls back to the oldest key's default model", async () => {
    const { jobs, keys, createModel, run } = await world();
    await keys.upsert({
      provider: "openai",
      label: "OpenAI",
      keyCiphertext: sealSecret("sk-openai-key-1111", agentProviderKeyBinding(COMPANY, "openai")),
      keyLast4: "1111",
      defaultModel: null,
      validatedAt: NOW,
    });

    await run(jobs.add({ runtime: "ownKey", model: "gpt-5" }).id);
    expect(createModel).toHaveBeenLastCalledWith("openai", "sk-openai-key-1111", "gpt-5");

    await run(jobs.add({ runtime: "ownKey", model: null }).id);
    expect(createModel).toHaveBeenLastCalledWith("anthropic", PLAIN_KEY, "claude-haiku-5-5");
  });

  it("fails a job that names a model no key can run, or has no key at all, before any provider call", async () => {
    const { jobs, keys, createModel, loop, run } = await world();
    const unknownModel = jobs.add({ runtime: "ownKey", model: "mystery-1" });
    const noOpenAiKey = jobs.add({ runtime: "ownKey", model: "gpt-5" });

    expect(await run(unknownModel.id)).toEqual({ ok: true, data: { status: "failed" } });
    expect(await run(noOpenAiKey.id)).toEqual({ ok: true, data: { status: "failed" } });
    expect(jobs.jobs.get(unknownModel.id)?.error).toBe("modelUnavailable");
    expect(jobs.jobs.get(noOpenAiKey.id)?.error).toBe("noKey");

    keys.rows.clear();
    const noKey = jobs.add({ runtime: "ownKey" });
    await run(noKey.id);
    expect(jobs.jobs.get(noKey.id)?.error).toBe("noKey");
    expect(createModel).not.toHaveBeenCalled();
    expect(loop).not.toHaveBeenCalled();
  });

  it("fails a key that cannot be opened with the current secret", async () => {
    const { jobs, keys, createModel, run } = await world();
    const [stored] = [...keys.rows.values()];
    keys.rows.set(stored.id, { ...stored, keyCiphertext: "v1.garbage.garbage.garbage" });
    const job = jobs.add({ runtime: "ownKey" });

    await run(job.id);

    expect(jobs.jobs.get(job.id)).toMatchObject({ status: "failed", error: "keyUnreadable" });
    expect(createModel).not.toHaveBeenCalled();
  });

  it("still runs on a key saved before SECRET_BOX_KEY was configured and fails as unreadable after the secret changed", async () => {
    const { jobs, createModel, run } = await world();

    mockEnv.SECRET_BOX_KEY = Buffer.alloc(32, 5).toString("base64");
    try {
      const kept = jobs.add({ runtime: "ownKey" });
      expect(await run(kept.id)).toEqual({ ok: true, data: { status: "succeeded" } });
      expect(createModel).toHaveBeenLastCalledWith("anthropic", PLAIN_KEY, "claude-haiku-5-5");

      mockEnv.BETTER_AUTH_SECRET = "a-rotated-test-only-authentication-secret";
      const rotated = jobs.add({ runtime: "ownKey" });
      await run(rotated.id);
      expect(jobs.jobs.get(rotated.id)).toMatchObject({ status: "failed", error: "keyUnreadable" });
      expect(createModel).toHaveBeenCalledTimes(1);
    } finally {
      mockEnv.SECRET_BOX_KEY = undefined;
      mockEnv.BETTER_AUTH_SECRET = "a-long-test-only-authentication-secret";
    }
  });

  it("fails with the provider's error class and never with the key", async () => {
    const { jobs, loop, run } = await world();
    const failure = Object.assign(new Error(`401 invalid x-api-key ${PLAIN_KEY}`), {
      name: "APICallError",
      statusCode: 401,
    });
    loop.mockResolvedValue(failed(failure));
    const job = jobs.add({ runtime: "ownKey" });

    expect(await run(job.id)).toEqual({ ok: true, data: { status: "failed" } });

    const stored = jobs.jobs.get(job.id);
    expect(stored).toMatchObject({ status: "failed", error: "APICallError:401", inputTokens: null });
    expect(JSON.stringify([stored, jobs.events.get(job.id)])).not.toContain(PLAIN_KEY);
  });

  it("fails a job whose loop throws unexpectedly, reports it and keeps the key out of the record", async () => {
    const { jobs, loop, run } = await world();
    loop.mockRejectedValue(new Error(`boom ${PLAIN_KEY}`));
    const job = jobs.add({ runtime: "ownKey" });

    expect(await run(job.id)).toEqual({ ok: true, data: { status: "failed" } });

    expect(jobs.jobs.get(job.id)?.error).toBe("ProviderError");
    expect(JSON.stringify(jobs.jobs.get(job.id))).not.toContain(PLAIN_KEY);
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it("maps how a run ended to the job's status", async () => {
    const { jobs, loop, run } = await world();
    const cases = [
      ["stop", "succeeded", null],
      ["toolLimit", "failed", "toolLimit"],
      ["creditLimit", "failed", "creditLimit"],
      ["timeLimit", "timedOut", "timeLimit"],
    ] as const;

    for (const [reason, status, error] of cases) {
      loop.mockResolvedValue(finished({ reason, text: "partial" }));
      const job = jobs.add({ runtime: "ownKey" });
      expect(await run(job.id)).toEqual({ ok: true, data: { status } });
      expect(jobs.jobs.get(job.id)).toMatchObject({ status, error, result: { text: "partial", reason } });
    }
  });

  it("does not run a job that is already taken, belongs to someone else or goes to a runner", async () => {
    const { jobs, loop, run } = await world();
    const taken = jobs.add({ runtime: "ownKey", status: "running", attempts: 1 });
    const foreign = jobs.add({ runtime: "ownKey", ownerUserId: "00000000-0000-4000-8000-000000000099" });
    const runner = jobs.add({ runtime: "runner" });

    for (const job of [taken, foreign, runner])
      expect(await run(job.id)).toEqual({ ok: true, data: { status: "skipped" } });
    expect(await run("00000000-0000-4000-8000-0000000000ee")).toEqual({ ok: true, data: { status: "skipped" } });
    expect(loop).not.toHaveBeenCalled();
    expect(jobs.jobs.get(runner.id)?.status).toBe("queued");
  });

  it("marks a prompt from outside the workspace as untrusted in what the model is told", async () => {
    const { jobs, loop, run } = await world();
    await run(jobs.add({ runtime: "ownKey", promptUntrusted: true }).id);
    await run(jobs.add({ runtime: "ownKey", promptUntrusted: false }).id);

    expect(loop.mock.calls[0][0].system).toContain("came from outside the workspace");
    expect(loop.mock.calls[1][0].system).not.toContain("came from outside the workspace");
  });
});

describe("running an agent job on Mate", () => {
  it("runs on the hosted model under a credit reservation and settles what the rounds cost", async () => {
    const { jobs, credits, loop, createModel, run } = await world();
    const job = jobs.add({ runtime: "mate" });

    expect(await run(job.id)).toEqual({ ok: true, data: { status: "succeeded" } });

    expect(credits.reserve).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: job.id, attempt: 1, companyId: COMPANY, userId: OWNER }),
    );
    expect(createModel).not.toHaveBeenCalled();
    const input = loop.mock.calls[0][0];
    expect(input.model).toBe("anthropic/claude-haiku-5.5");
    expect(input.providerOptions).toMatchObject({ gateway: { only: ["vertexAnthropic"], zeroDataRetention: true } });
    expect(typeof input.admitRound).toBe("function");
    expect(input.limits).toEqual({ maxOutputTokens: 8192, maxContextBytes: 195_000 });
    expect(credits.settle).toHaveBeenCalledWith(
      expect.objectContaining({
        reservationId: "agent-job:x:1",
        companyId: COMPANY,
        userId: OWNER,
        settlement: expect.objectContaining({
          model: "anthropic/claude-haiku-5.5",
          inputTokens: 1000,
          state: "settled",
        }),
      }),
    );
    expect(credits.release).not.toHaveBeenCalled();
    expect(Number(jobs.jobs.get(job.id)?.costMicrocents)).toBeGreaterThan(0);
  });

  it("releases the credits when the provider answered nothing and still settles the rounds of a failed run", async () => {
    const { jobs, credits, loop, run } = await world();
    loop.mockResolvedValueOnce(failed(new Error("down")));
    const nothing = jobs.add({ runtime: "mate" });
    await run(nothing.id);
    expect(credits.release).toHaveBeenCalledTimes(1);
    expect(credits.settle).not.toHaveBeenCalled();
    expect(jobs.jobs.get(nothing.id)).toMatchObject({ status: "failed", costMicrocents: 0n });

    loop.mockResolvedValueOnce(failed(new Error("down"), [STEP]));
    const partial = jobs.add({ runtime: "mate" });
    await run(partial.id);
    expect(credits.settle).toHaveBeenCalledTimes(1);
    expect(jobs.jobs.get(partial.id)?.status).toBe("failed");
  });

  it("fails without a provider call when the workspace has no credits or hosted AI is unavailable", async () => {
    const { jobs, credits, loop, run } = await world();
    credits.reserve.mockResolvedValueOnce({ ok: false, reason: "credits" });
    credits.reserve.mockResolvedValueOnce({ ok: false, reason: "unavailable" });
    const first = jobs.add({ runtime: "mate" });
    const second = jobs.add({ runtime: "mate" });

    await run(first.id);
    await run(second.id);

    expect(jobs.jobs.get(first.id)).toMatchObject({ status: "failed", error: "creditsExhausted" });
    expect(jobs.jobs.get(second.id)).toMatchObject({ status: "failed", error: "hostedAiUnavailable" });
    expect(loop).not.toHaveBeenCalled();
    expect(credits.settle).not.toHaveBeenCalled();
  });

  it("keeps the job's result when the settlement itself fails, gives the held credits back and reports the failure", async () => {
    const { jobs, credits, run } = await world();
    credits.settle.mockRejectedValueOnce(new Error("ledger unavailable"));
    const job = jobs.add({ runtime: "mate" });

    expect(await run(job.id)).toEqual({ ok: true, data: { status: "succeeded" } });

    expect(jobs.jobs.get(job.id)).toMatchObject({ status: "succeeded", costMicrocents: null });
    expect(sentry.captureException).toHaveBeenCalled();
    expect(credits.release).toHaveBeenCalledWith({ jobId: job.id, attempt: 1, companyId: COMPANY, userId: OWNER });
  });

  it("settles against the reservation as the rounds extended it, so a long run is charged in full", async () => {
    const { jobs, credits, loop, run } = await world();
    const round = { tokens: STEP.tokens, providerMetadata: undefined, unmeasuredMicrocents: 900_000 };
    loop.mockImplementation(async (input: { admitRound: (round: unknown) => Promise<unknown> }) => {
      const admission = await input.admitRound({
        steps: [round, round],
        auxiliary: [],
        contextBytes: BUDGET.maxContextBytes,
        measured: null,
      });
      expect(admission).toEqual({ admitted: true, roundReserveMicrocents: 300_000 });
      return finished({ steps: [round, round] });
    });
    const job = jobs.add({ runtime: "mate" });

    expect(await run(job.id)).toEqual({ ok: true, data: { status: "succeeded" } });

    expect(credits.admitRound).toHaveBeenCalledWith({
      reservationId: "agent-job:x:1",
      companyId: COMPANY,
      userId: OWNER,
    });
    expect(credits.extend).toHaveBeenCalledWith({
      reservationId: "agent-job:x:1",
      companyId: COMPANY,
      userId: OWNER,
      requiredMicrocents: 2_100_000,
      ceilingMicrocents: CEILING,
    });
    expect(credits.settle).toHaveBeenCalledWith(
      expect.objectContaining({
        settlement: expect.objectContaining({
          reservedMicrocents: 2_100_000,
          chargedMicrocents: 1_800_000,
          policyBreach: false,
        }),
      }),
    );
    expect(jobs.jobs.get(job.id)?.costMicrocents).toBe(1_800_000n);
  });

  it("charges the re-rank calls of the run's tools together with its rounds", async () => {
    const { jobs, credits, loop, run } = await world();
    const round = { tokens: STEP.tokens, providerMetadata: undefined, unmeasuredMicrocents: 100_000 };
    loop.mockResolvedValue(
      finished({
        steps: [round],
        auxiliary: [{ use: "docs_rerank", model: "jev", costMicrocents: 2_500, measured: true, answered: true }],
      }),
    );
    const job = jobs.add({ runtime: "mate" });

    await run(job.id);

    expect(credits.settle).toHaveBeenCalledWith(
      expect.objectContaining({ settlement: expect.objectContaining({ costMicrocents: 102_500 }) }),
    );
    expect(jobs.jobs.get(job.id)?.costMicrocents).toBe(102_500n);
  });

  it("fails as hosted AI unavailable, not as a provider error, when a round is refused for that reason", async () => {
    const { jobs, credits, loop, run } = await world();
    credits.admitRound.mockResolvedValue(false);
    loop.mockImplementation(async (input: { admitRound: (round: unknown) => Promise<unknown> }) => {
      const error = await input
        .admitRound({ steps: [], auxiliary: [], contextBytes: 1_000, measured: null })
        .catch((caught: unknown) => caught);
      return failed(error);
    });
    const job = jobs.add({ runtime: "mate" });

    await run(job.id);

    expect(jobs.jobs.get(job.id)).toMatchObject({ status: "failed", error: "hostedAiUnavailable" });
    expect(credits.release).toHaveBeenCalledTimes(1);
  });

  it("keeps the status and the charge of a run whose record could not be written at the first try", async () => {
    const { jobs, credits, run } = await world();
    sentry.captureException.mockClear();
    const finish = vi.spyOn(jobs, "finishUnscoped").mockRejectedValueOnce(new Error("connection reset"));
    const job = jobs.add({ runtime: "mate" });

    expect(await run(job.id)).toEqual({ ok: true, data: { status: "succeeded" } });

    expect(finish).toHaveBeenCalledTimes(2);
    expect(credits.settle).toHaveBeenCalledTimes(1);
    expect(credits.release).not.toHaveBeenCalled();
    const stored = jobs.jobs.get(job.id);
    expect(stored).toMatchObject({ status: "succeeded", error: null, result: { reason: "stop" } });
    expect(Number(stored?.costMicrocents)).toBeGreaterThan(0);
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
  });
});
