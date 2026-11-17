import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
  createMockDiModule,
} from "@/tests/helpers/interactor-test-setup";

const OWNER = "00000000-0000-4000-8000-000000000010";
const COMPANY = "00000000-0000-4000-8000-000000000011";
const mockUser = createMockUser({ id: OWNER, companyId: COMPANY });

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

import type { AutomationAgentJobInput, AutomationRecordView } from "../automation-ports";
import type { AutomationEffect } from "../automation-rule.schema";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { FakeAgentJobRepo } from "@/features/agent-jobs/__tests__/fake-agent-job-repo";
import { EnqueueAgentJobInteractor } from "@/features/agent-jobs/enqueue-agent-job.interactor";
import { AutomationEffectRunner } from "../automation-effect-runner";

const RULE = "00000000-0000-4000-8000-0000000000a1";
const RUN = "00000000-0000-4000-8000-0000000000b1";
const TYPE = "11111111-1111-4111-8111-111111111111";
const RECORD = "44444444-4444-4444-8444-444444444444";
const NOW = new Date("2026-11-17T12:00:00.000Z");

type Sent = AutomationAgentJobInput & { idempotencyKey?: string };

const agentStep = (prompt = "Summarise the deal into Notes"): AutomationEffect =>
  ({ kind: "agent", runtime: "ownKey", prompt }) as AutomationEffect;

function record(name = "Acme"): AutomationRecordView {
  return { ref: { typeId: TYPE, recordId: RECORD }, version: 1, name, assignedUserIds: [], values: new Map() };
}

function context(overrides: { runId?: string; trigger?: Record<string, unknown>; recordRef?: null } = {}) {
  return {
    companyId: COMPANY,
    runId: overrides.runId ?? RUN,
    rule: {
      id: RULE,
      name: "Follow up",
      ownerUserId: OWNER,
      trigger: (overrides.trigger ?? { kind: "recordUpdated", typeId: TYPE }) as never,
    },
    recordRef: overrides.recordRef === null ? null : { typeId: TYPE, recordId: RECORD },
    now: NOW,
  };
}

function runnerWith(agents: { enqueue: (input: AutomationAgentJobInput) => Promise<unknown> }, view = record()) {
  const records = { model: vi.fn(), read: vi.fn().mockResolvedValue(view), mutate: vi.fn() };
  return new AutomationEffectRunner(
    records as never,
    { notify: vi.fn() } as never,
    { publish: vi.fn() } as never,
    { findOutboundWebhookUnscoped: vi.fn() } as never,
    agents as never,
  );
}

describe("the agent step of a rule", () => {
  let sent: Sent[];
  let agents: { enqueue: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    sent = [];
    agents = {
      enqueue: vi.fn().mockImplementation((input: Sent) => {
        sent.push(input);
        return Promise.resolve({ ok: true, jobId: `job-${sent.length}` });
      }),
    };
  });

  it("names each job after its run and the position of the step, like the other effects", async () => {
    const runner = runnerWith(agents);

    const { outcomes } = await runner.run([agentStep(), agentStep("Draft a reply")], context());
    await runner.run([agentStep()], context({ runId: "00000000-0000-4000-8000-0000000000b2" }));

    expect(outcomes.map((outcome) => outcome.status)).toEqual(["applied", "applied"]);
    expect(sent.map((input) => input.idempotencyKey)).toEqual([
      `rule:${RUN}:0`,
      `rule:${RUN}:1`,
      "rule:00000000-0000-4000-8000-0000000000b2:0",
    ]);
  });

  it("enqueues one job when a run is claimed again and replays its effects", async () => {
    const jobs = new FakeAgentJobRepo();
    const dispatch = vi.fn().mockResolvedValue(undefined);
    const option = { available: true, reason: null, models: [], runners: [] };
    const availability = { availability: () => Promise.resolve({ mate: option, ownKey: option, runner: option }) };
    const interactor = new EnqueueAgentJobInteractor(jobs, availability as never, { dispatch } as never);
    const runner = runnerWith(interactor);
    const effects = [agentStep(), agentStep("Draft a reply")];

    const first = await runWithTenant(mockUser, () => runner.run(effects, context()));
    // The worker died before the run was settled; ten minutes later the run is claimed again.
    const replay = await runWithTenant(mockUser, () => runner.run(effects, context()));

    expect(first.failure).toBeNull();
    expect(jobs.jobs.size).toBe(2);
    expect(replay.outcomes.map((outcome) => outcome.detail)).toEqual(first.outcomes.map((outcome) => outcome.detail));
    expect(dispatch).toHaveBeenCalledTimes(2);
  });
});
