import type { Validated } from "@/core/validation/validation.utils";
import type { AgentJobRunnerRepo } from "./agent-job-runner.repo";
import type { AgentRunnerAuthenticator } from "./agent-runner-authenticator";
import type { AgentJobEventsRequest, AgentJobEventsResult } from "./agent-runner.schema";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

import { ACTIVE_JOB_STATUSES, jobClosed, jobNotFound } from "./agent-runner-failures";
import { AGENT_RUNNER_LIMITS, AgentJobEventsRequestSchema, AgentJobEventsResultSchema } from "./agent-runner.schema";

export function trimAgentJobEvent(event: Record<string, unknown>): Record<string, unknown> {
  const bytes = Buffer.byteLength(JSON.stringify(event), "utf8");
  return bytes <= AGENT_RUNNER_LIMITS.eventMaxBytes ? event : { type: "truncated", bytes };
}

@SystemInteractor
export class AppendAgentJobEventsInteractor {
  constructor(
    private readonly authenticator: AgentRunnerAuthenticator,
    private readonly jobs: Pick<AgentJobRunnerRepo, "findForRunner" | "appendTranscript">,
  ) {}

  @Validate(AgentJobEventsRequestSchema)
  @ValidateOutput(AgentJobEventsResultSchema)
  async invoke(data: AgentJobEventsRequest): Validated<AgentJobEventsResult> {
    const authentication = await this.authenticator.authenticate(data);
    if (!authentication.ok) return authentication.failure;

    const state = await this.jobs.findForRunner(data.jobId, authentication.runner);
    if (!state) return jobNotFound();
    if (!ACTIVE_JOB_STATUSES.has(state.status)) return jobClosed();

    await this.jobs.appendTranscript(state.id, authentication.runner, data.events.map(trimAgentJobEvent));
    return { ok: true, data: { ok: true, accepted: data.events.length } };
  }
}
