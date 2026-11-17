import type { Validated } from "@/core/validation/validation.utils";
import type { AgentJobCredentials } from "./agent-job-credentials";
import type { AgentJobRunnerRepo } from "./agent-job-runner.repo";
import type { AgentRunnerAuthenticator } from "./agent-runner-authenticator";
import type { AgentJobFinishResult, AgentJobOutcome, AgentJobResultRequest } from "./agent-runner.schema";

import { AGENT_MICROCENTS_PER_USD } from "@/core/commercial/agent-credits";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import * as ErrorReporter from "@/core/observability/server";

import { ACTIVE_JOB_STATUSES, jobClosed, jobNotFound } from "./agent-runner-failures";
import { AgentJobFinishResultSchema, AgentJobResultRequestSchema } from "./agent-runner.schema";

const DEFAULT_ERRORS = { failed: "failed", timedOut: "timeout" } as const;

function outcomeOf(data: AgentJobResultRequest): AgentJobOutcome {
  return {
    status: data.status,
    result: data.summary === undefined ? null : { summary: data.summary },
    inputTokens: data.inputTokens ?? null,
    outputTokens: data.outputTokens ?? null,
    costMicrocents: data.costUsd === undefined ? null : Math.round(data.costUsd * AGENT_MICROCENTS_PER_USD),
    error: data.status === "succeeded" ? null : (data.error ?? DEFAULT_ERRORS[data.status]),
  };
}

@SystemInteractor
export class FinishAgentJobInteractor {
  constructor(
    private readonly authenticator: AgentRunnerAuthenticator,
    private readonly jobs: Pick<AgentJobRunnerRepo, "findForRunner" | "finish">,
    private readonly credentials: Pick<AgentJobCredentials, "revoke">,
  ) {}

  @Validate(AgentJobResultRequestSchema)
  @ValidateOutput(AgentJobFinishResultSchema)
  async invoke(data: AgentJobResultRequest): Validated<AgentJobFinishResult> {
    const authentication = await this.authenticator.authenticate(data);
    if (!authentication.ok) return authentication.failure;

    const { runner } = authentication;
    const state = await this.jobs.findForRunner(data.jobId, runner);
    if (!state) return jobNotFound();
    if (!ACTIVE_JOB_STATUSES.has(state.status)) return jobClosed();

    await this.jobs.finish(state.id, runner, outcomeOf(data));
    await this.credentials.revoke({ companyId: runner.companyId, jobId: state.id }).catch((error: unknown) => {
      ErrorReporter.captureException(error, {
        tags: { kind: "agent-job-credentials-revoke", companyId: runner.companyId },
      });
    });
    return { ok: true, data: { ok: true } };
  }
}
