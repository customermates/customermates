import type { Data, Validated } from "@/core/validation/validation.utils";
import type { AgentJobCredentials } from "./agent-job-credentials";
import type { AgentJobRunnerRepo } from "./agent-job-runner.repo";
import type { AgentRunnerRepo } from "./agent-runner.repo";
import type { AgentRunnerAuthenticator } from "./agent-runner-authenticator";
import type {
  AgentJobClaim,
  AgentJobClaimRequest,
  AgentJobClaimResult,
  AuthenticatedAgentRunner,
} from "./agent-runner.schema";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

import { AGENT_RUNNER_LIMITS, AgentJobClaimRequestSchema, AgentJobClaimResultSchema } from "./agent-runner.schema";

export type AgentRunnerTiming = { now(): number; sleep(ms: number): Promise<void> };

export const REAL_AGENT_RUNNER_TIMING: AgentRunnerTiming = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

const OutputSchema = AgentJobClaimResultSchema.nullable().describe("Null when no job became available in time.");

@SystemInteractor
export class ClaimAgentJobInteractor {
  constructor(
    private readonly authenticator: AgentRunnerAuthenticator,
    private readonly runners: Pick<AgentRunnerRepo, "touchRunnerUnscoped">,
    private readonly jobs: Pick<AgentJobRunnerRepo, "claimNextForRunner" | "finish">,
    private readonly credentials: Pick<AgentJobCredentials, "issue">,
    private readonly timing: AgentRunnerTiming = REAL_AGENT_RUNNER_TIMING,
  ) {}

  @Validate(AgentJobClaimRequestSchema)
  @ValidateOutput(OutputSchema)
  async invoke(data: AgentJobClaimRequest): Validated<Data<typeof OutputSchema>> {
    const authentication = await this.authenticator.authenticate(data);
    if (!authentication.ok) return authentication.failure;

    const { runner } = authentication;
    const waitMs = (data.waitSeconds ?? AGENT_RUNNER_LIMITS.claimMaxWaitSeconds) * 1000;
    const startedAt = this.timing.now();
    await this.runners.touchRunnerUnscoped(runner.id, new Date(startedAt));

    for (;;) {
      const claim = await this.jobs.claimNextForRunner(runner.id);
      if (claim) return { ok: true, data: await this.deliver(runner, claim) };
      if (this.timing.now() + AGENT_RUNNER_LIMITS.claimPollMs > startedAt + waitMs) return { ok: true, data: null };
      await this.timing.sleep(AGENT_RUNNER_LIMITS.claimPollMs);
    }
  }

  private async deliver(runner: AuthenticatedAgentRunner, claim: AgentJobClaim): Promise<AgentJobClaimResult | null> {
    const credentials = await this.credentials.issue({
      companyId: claim.companyId,
      ownerUserId: claim.ownerUserId,
      jobId: claim.id,
      expiresAt: new Date(claim.timeoutAt.getTime() + AGENT_RUNNER_LIMITS.mcpTokenGraceMs),
    });
    if (!credentials) {
      await this.jobs.finish(claim.id, runner.id, {
        status: "failed",
        result: null,
        inputTokens: null,
        outputTokens: null,
        costMicrocents: null,
        error: "owner_unavailable",
      });
      return null;
    }
    return {
      job: {
        id: claim.id,
        prompt: claim.prompt,
        promptUntrusted: claim.promptUntrusted,
        timeoutAt: claim.timeoutAt.toISOString(),
      },
      mcp: credentials,
    };
  }
}
