import type { Data, Validated } from "@/core/validation/validation.utils";
import type { AgentJobCredentials } from "./agent-job-credentials";
import type { AgentJobRunnerRepo } from "./agent-job-runner.repo";
import type { AgentRunnerRepo } from "./agent-runner.repo";
import type {
  AgentJobClaim,
  AgentJobClaimRequest,
  AgentJobClaimResult,
  AuthenticatedAgentRunner,
} from "./agent-runner.schema";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AGENT_JOB_MAX_WALL_MS } from "@/features/agent-jobs/agent-job.schema";

import {
  AGENT_RUNNER_JOB_ERRORS,
  AGENT_RUNNER_LIMITS,
  AgentJobClaimRequestSchema,
  AgentJobClaimResultSchema,
} from "./agent-runner.schema";

export type AgentRunnerTiming = { now(): number; sleep(ms: number, signal?: AbortSignal): Promise<void> };

export const REAL_AGENT_RUNNER_TIMING: AgentRunnerTiming = {
  now: () => Date.now(),
  sleep: (ms, signal) =>
    new Promise((resolve) => {
      if (signal?.aborted) return resolve();
      const done = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      signal?.addEventListener("abort", done, { once: true });
    }),
};

const OutputSchema = AgentJobClaimResultSchema.nullable().describe("Null when no job became available in time.");

@SystemInteractor
export class ClaimAgentJobInteractor {
  constructor(
    private readonly runners: Pick<AgentRunnerRepo, "touchRunnerUnscoped">,
    private readonly jobs: Pick<AgentJobRunnerRepo, "claimNextForRunner" | "finish">,
    private readonly credentials: Pick<AgentJobCredentials, "issue">,
    private readonly timing: AgentRunnerTiming = REAL_AGENT_RUNNER_TIMING,
  ) {}

  @Validate(AgentJobClaimRequestSchema)
  @ValidateOutput(OutputSchema)
  async invoke(data: AgentJobClaimRequest): Validated<Data<typeof OutputSchema>> {
    const { runner } = data.admission;
    const { signal } = data;
    const waitMs = (data.waitSeconds ?? AGENT_RUNNER_LIMITS.claimMaxWaitSeconds) * 1000;
    const startedAt = this.timing.now();
    await this.runners.touchRunnerUnscoped(runner.id, new Date(startedAt));

    for (;;) {
      if (signal?.aborted) return { ok: true, data: null };
      const claim = await this.jobs.claimNextForRunner(runner);
      if (claim) {
        if (signal?.aborted) return { ok: true, data: null };
        const delivered = await this.deliver(runner, claim);
        if (delivered) return { ok: true, data: delivered };
        continue;
      }
      if (this.timing.now() + AGENT_RUNNER_LIMITS.claimPollMs > startedAt + waitMs) return { ok: true, data: null };
      await this.timing.sleep(AGENT_RUNNER_LIMITS.claimPollMs, signal);
    }
  }

  private async deliver(runner: AuthenticatedAgentRunner, claim: AgentJobClaim): Promise<AgentJobClaimResult | null> {
    const issued = await this.credentials.issue({
      companyId: claim.companyId,
      ownerUserId: claim.ownerUserId,
      jobId: claim.id,
      attempt: claim.attempt,
      runnerId: runner.id,
      expiresAt: new Date(claim.confirmBy.getTime() + AGENT_JOB_MAX_WALL_MS + AGENT_RUNNER_LIMITS.mcpTokenGraceMs),
    });
    if (!issued.ok) {
      await this.jobs.finish(claim.id, runner, claim.attempt, {
        status: "failed",
        result: null,
        inputTokens: null,
        outputTokens: null,
        error: AGENT_RUNNER_JOB_ERRORS[issued.reason],
      });
      return null;
    }
    return {
      job: {
        id: claim.id,
        attempt: claim.attempt,
        prompt: claim.prompt,
        promptUntrusted: claim.promptUntrusted,
        confirmWithinSeconds: Math.floor(AGENT_RUNNER_LIMITS.claimConfirmMs / 1000),
      },
      mcp: issued.credentials,
    };
  }
}
